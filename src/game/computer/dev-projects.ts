// Building things at home: Scratch games, websites, game mods, chat bots, browser extensions,
// mobile apps and indie games. Quality comes from coding skill (and the right language); some
// flop, the good ones go on the CV, and some earn a little money every year (ad revenue, app
// store sales, donations) until people move on. A hit app or game can become a real venture.
import { addHidden, addStat, count, earnIncome, formatMoney, log, notice, remember, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { fillLocal } from '../data/locales'
import { pick, rand, randFloat, randInt, uid } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import { stableChoice } from '../special/common'
import { hasTalent, talentHint } from '../talents'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { makeGamesMenu } from '../special/gamedev-make'
import { ageBlock, computerBlock, firstReason, useComputer } from './dev-common'
import { practice } from './dev-learn'
import { PROJECT_KINDS, type ProjectKind } from './dev-kinds'
export { getProjectKind, PROJECT_KINDS, projectDetail, type ProjectKind } from './dev-kinds'
import { between, cap, devState, money, num, plural, priceLevel, saveDev, shortCount, str, type DevProject } from './dev-state'
import { canStartVenture, spinOffVenture } from './dev-venture'
import { bestLanguageFor, codingSkill, getLanguage } from './skills'
import { eraOpen, eraReason, online } from './era'

function projectName(g: GameState, kind: ProjectKind): string {
  const used = new Set(devState(g).projects.map((p) => p.name))
  const fresh = kind.names.map((n) => fillLocal(g, n).replace(/\{\w+\}/g, '').trim()).filter((n) => n && !used.has(n))
  return fresh.length ? pick(g, fresh) : `${pick(g, kind.names.map((n) => fillLocal(g, n).replace(/\{\w+\}/g, '').trim()))} ${pick(g, ['2', 'II', 'Reloaded', 'Again'])}`
}

function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`
}

/** Yearly income of a project at launch (local + global users). */
function launchIncome(g: GameState, kind: ProjectKind, users: number, q: number): number {
  if (kind.income === 'none') return 0
  const pl = 0.5 + 0.5 * priceLevel(g.character.countryId)
  const conv = kind.income === 'sales' ? 0.5 : 1
  return Math.max(0, Math.round(users * kind.arpu * pl * conv * (0.5 + q / 100)))
}

/**
 * Internet luck: most projects find a small audience and a few blow up. A heavy right tail
 * (median ~0.35, top 10% ~1.5, rare 4-6x), so shipping is a lottery ticket, not a salary.
 */
function audienceLuck(g: GameState): number {
  const z = (rand(g) + rand(g) + rand(g) - 1.5) / 0.5
  return between(Math.exp(-1.05 + 1.15 * z), 0.04, 6)
}

/** The kind of project the internet is hungry for this year (stable; the Programming talent sees it). */
function trendingKind(g: GameState): string {
  return stableChoice(
    g,
    'computer.dev.trend',
    PROJECT_KINDS.filter((k) => !GAME_KINDS.has(k.id) && eraOpen(g, k.era)).map((k) => k.id),
  )
}

/** Shipping the same kind of thing over and over: each one from the last two years costs 30% of the audience. */
function audienceFatigue(g: GameState, kind: ProjectKind): number {
  const recent = devState(g).projects.filter((p) => p.kind === kind.id && g.character.age - p.age <= 2).length
  return Math.pow(0.7, recent)
}

function quality(g: GameState, kind: ProjectKind, langLevel: number): number {
  const c = g.character
  const base = codingSkill(g) * 0.62 + langLevel * 0.15 + c.stats.smarts * 0.12 + c.hidden.discipline * 0.08 + (hasTalent(g, 'Programming') ? 10 : 0)
  return Math.round(between(base + randInt(g, -18, 18) - kind.difficulty + 10, 0, 100))
}

const SPIN = defineScript('computer.dev.spinoff', (g, choice, data) => {
  if (!g.character.alive) return
  if (choice !== 'yes') {
    log(g, 'I kept my hit project a hobby.')
    return
  }
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const type = str(d.type) === 'game' ? 'game' : 'app'
  spinOffVenture(g, type, str(d.name, 'My Project'), num(d.q, 60), num(d.users, 0))
})

/** Build a project now. */
export function buildProject(g: GameState, kind: ProjectKind): void {
  const c = g.character
  const reason = firstReason(computerBlock(g), ageBlock(g, kind.minAge, `build a ${kind.label.toLowerCase()}`), eraReason(g, kind.era, `${kind.noun}s`))
  if (reason) return notice(g, kind.label, reason, { emoji: kind.emoji })
  if (codingSkill(g) < kind.minSkill) {
    return notice(g, kind.label, `You need coding skill ${kind.minSkill} to build a ${kind.label.toLowerCase()} (you have ${codingSkill(g)}). Try Learn to Code first.`, { emoji: kind.emoji })
  }
  if (!useYearAction(g, 'computer.dev.project', 2)) {
    return notice(g, 'Projects', "You've already shipped two projects this year. Your keyboard is begging for mercy.", { emoji: kind.emoji })
  }
  useComputer(g, 2)
  const best = bestLanguageFor(g, kind.use)
  const lang = best ? getLanguage(best.id) : undefined
  const q = quality(g, kind, best?.level ?? 0)
  practice(g, 3, best?.id ?? null, 1.2)
  count(g, 'codingProjects')
  const name = projectName(g, kind)
  const quoted = kind.id === 'website' ? name : `"${name}"`
  const tired = audienceFatigue(g, kind)
  if (q < 30) {
    addStat(g, 'happiness', -randInt(g, 2, 5))
    log(g, `I tried to build ${withArticle(kind.noun)}. It flopped.`, 'bad')
    notice(g, 'It Flopped', `${pick(g, kind.flops)} You learned a lot, mostly about what not to do.`, { emoji: kind.emoji, tone: 'bad' })
    return
  }
  const [lo, hi] = kind.users
  const trend = kind.id === trendingKind(g) ? 1.5 : 1
  const users = Math.max(1, Math.round((lo + (hi - lo) * Math.pow(q / 100, 3)) * audienceLuck(g) * tired * trend))
  const income = launchIncome(g, kind, users, q)
  const proj: DevProject = { id: uid(g, 'dp'), kind: kind.id, name, q, age: c.age, users, income, earned: 0, lang: best?.id ?? '' }
  const s = devState(g)
  s.projects.push(proj)
  s.shipped += 1
  saveDev(g, s)
  addStat(g, 'happiness', randInt(g, 2, 6))
  if (q >= 70) addStat(g, 'smarts', randInt(g, 0, 1))
  addHidden(g, 'discipline', 1)
  // A hit needs both: great work and the internet actually noticing.
  const hit = q >= 80 && users >= hi * 0.35
  if (hit) {
    remember(g, `${kind.cvTitle(name)} (${shortCount(users)} ${kind.unit}s).`)
    if (kind.id === 'game' || kind.id === 'app') addHidden(g, 'fame', 1)
  }
  log(g, `I built ${kind.id === 'website' ? name : `${quoted}, ${withArticle(kind.noun)}`} (${plural(users, kind.unit)}).`, 'good')
  const verdict = hit
    ? `It was a hit! ${kind.great}`
    : q >= 80
      ? pickSite(g, [`It's genuinely great. ${online(g) ? 'The internet' : 'The world'} hasn't noticed yet.`, 'It is the best thing you have ever made. Twelve people agree.'], 0xaa0a41a3)
      : q >= 65
        ? pickLine(g, ['It turned out really well.', 'People actually like it. Strangers, even.'])
        : q >= 45
          ? pickLine(g, ['Not bad! Not great. Solidly not bad.', 'It works, which is more than most first drafts can say.'])
          : 'It turned out... fine. Fine counts.'
  const earn = income > 0 ? ` It should bring in about ${formatMoney(income)} a year in ${kind.id === 'listing' ? 'magazine fees and reprints' : kind.id === 'shareware' ? 'registration checks' : kind.income === 'sales' ? 'sales' : kind.income === 'premium' ? 'premium upgrades' : kind.income === 'donations' ? 'donations' : 'ad revenue'}, at least until people move on.` : ''
  const how = lang ? ` Written in ${lang.label}.` : ''
  const meh = tired < 1 ? ` People have seen a lot of your ${kind.noun}s lately; this one got less attention.` : ''
  notice(g, kind.label, `You built ${quoted}. ${verdict} ${cap(plural(users, kind.unit))} so far.${meh}${earn}${how}\n\nQuality ${q}/100 · added to your CV.`, { emoji: kind.emoji, tone: 'good' })
  if (kind.spin && q >= 82 && users >= (kind.id === 'game' ? 20_000 : 60_000) && canStartVenture(g) === null) {
    scriptChoice(
      g,
      SPIN,
      'Turn It Into a Business?',
      `${quoted} is taking off. You could turn it into a real ${kind.spin === 'game' ? 'game studio' : 'app business'}: pricing, marketing, contractors, the works.`,
      [
        { id: 'yes', label: 'Make it a business', emoji: '\u{1F680}' },
        { id: 'no', label: 'Keep it a hobby', emoji: '\u{1F3E0}' },
      ],
      { emoji: kind.emoji, data: { type: kind.spin, name, q, users } as Json },
    )
  }
}

/** Game-making kinds live in Special Careers › Game Industry (special/gamedev-make.ts). */
export const GAME_KINDS = new Set(['scratch', 'mod', 'game'])

/** Shortcut from the computer to Game Industry › Make Games. */
const makeGamesLink: MenuGroup = {
  type: 'menu',
  id: 'computer.dev.games',
  label: 'Make Games',
  emoji: '\u{1F3AE}',
  subtitle: 'Moved to Special Careers › Game Industry · tap for a shortcut',
  header: () => 'Scratch games, mods, game jams and real game releases now live in Occupation › Special Careers › Game Industry. Here is a shortcut.',
  disabledReason: (g) => makeGamesMenu.disabledReason?.(g) ?? null,
  children: (g) => makeGamesMenu.children(g),
}

export const projectsMenu: MenuGroup = {
  type: 'menu',
  id: 'computer.dev.projects',
  label: 'Build a Project',
  emoji: '\u{1F6E0}\u{FE0F}',
  subtitle: (g) => {
    const s = devState(g)
    const kinds = PROJECT_KINDS.filter((k) => !GAME_KINDS.has(k.id) && eraOpen(g, k.era)).map((k) => `${k.label.replace(/ \(.*\)$/, '').toLowerCase()}s`)
    const what = kinds.join() === 'websites,chat bots,browser extensions,mobile apps' ? 'Websites, bots, extensions, apps' : kinds.length ? cap(kinds.slice(0, 4).join(', ')) : 'Programs'
    return `${what} · ${s.shipped} shipped · ${yearActionsUsed(g, 'computer.dev.project')}/2 this year`
  },
  disabledReason: computerBlock,
  header: (g) => {
    const s = devState(g)
    const earning = s.projects.filter((p) => p.income > 0)
    const total = earning.reduce((sum, p) => sum + p.income, 0)
    return `Coding skill ${codingSkill(g)}/100. ${earning.length ? `Your projects bring in about ${money(total)} a year.` : online(g) ? 'Build something. Ship it. Let the internet judge it.' : 'Build something. Mail it off, pass it around on floppy disks, and let the world judge it.'}`
  },
  children: (): MenuNode[] => [
    ...PROJECT_KINDS.filter((k) => !GAME_KINDS.has(k.id)).map(
      (k): MenuAction => ({
        type: 'action',
        id: `computer.dev.project.${k.id}`,
        label: k.label,
        emoji: k.emoji,
        subtitle: (g) => {
          const best = bestLanguageFor(g, k.use)
          const lang = best ? getLanguage(best.id)?.label : null
          return `Skill ${k.minSkill}+${lang ? ` · you'd use ${lang}` : ''}${k.income !== 'none' ? ' · can earn money' : ''}`
        },
        hint: (g) => (k.id === trendingKind(g) ? talentHint(g, 'Programming', `${k.label.replace(/^(.*?)( \(.*\))?$/, '$1s$2')} are having a moment this year: expect a bigger audience.`) || null : null),
        visible: (g) => g.character.age >= k.minAge && (k.maxAge === undefined || g.character.age <= k.maxAge) && eraOpen(g, k.era),
        disabledReason: (g) => firstReason(computerBlock(g), codingSkill(g) < k.minSkill ? `You need coding skill ${k.minSkill} (you have ${codingSkill(g)}).` : null),
        run: (g) => buildProject(g, k),
      }),
    ),
    makeGamesLink,
  ],
}

/**
 * Yearly: projects pay what they still earn (taxed income), audiences drift away, and some
 * projects quietly die. Returns a log-ready total.
 */
export function yearlyProjects(g: GameState): number {
  const s = devState(g)
  if (s.projects.length === 0) return 0
  let total = 0
  for (const p of s.projects) {
    if (p.income <= 0) continue
    const pay = Math.max(0, Math.round(p.income))
    total += pay
    p.earned += pay
    // Hobby projects fade fast: people move on to the next thing.
    const keep = 0.3 + 0.35 * (p.q / 100) + randFloat(g, -0.08, 0.08)
    p.income = Math.round(p.income * between(keep, 0.15, 0.75))
    p.users = Math.round(p.users * (1 + between(keep - 0.45, 0, 0.3)))
    if (p.income < 5) p.income = 0
  }
  saveDev(g, s)
  if (total > 0) {
    earnIncome(g, total, 'royalty')
    const earners = s.projects.filter((p) => p.earned > 0).length
    log(g, earners === 1 ? `My side project brought in ${formatMoney(total)} this year.` : `My side projects brought in ${formatMoney(total)} this year.`, 'good')
  }
  return total
}
