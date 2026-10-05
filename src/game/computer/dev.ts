// The legit side of the home computer: learn to code, build projects, enter contests, freelance
// and run online ventures (SaaS, apps, an online store, indie games), from childhood on.
// computer.ts assembles the Activities › Computer menu; this file is the contract surface and
// the yearly hook. The pieces live in computer/dev-*.ts:
//   dev-state     plain-JSON state (g.flags.dev, venture Asset.details) + local economy helpers
//   dev-kinds     project kinds and venture types (pure data)
//   dev-common    who may use the computer, screen time, paying, taxed earnings
//   dev-learn     tutorials, courses, bootcamp, kids camp, contests; getting a computer
//   dev-projects  websites, mods, bots, extensions, apps, games (+ yearly royalties)
//   dev-venture   ventures: founding, yearly simulation, events, dashboard and actions
//   dev-freelance freelance gigs on invented platforms
//   dev-cv        CV entries and the self-taught developer check
import { computerLocked, ownsComputer } from '../computer'
import { addRelationship, addStat, count, log, notice, scriptChoice } from '../core'
import { getJobDef } from '../data/jobs'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { Asset, GameState, MenuNode } from '../types'
import { guardians, parentWord } from './dev-common'
import { codeFreelanceMenu } from './dev-freelance'
import { competitionsMenu, getAComputerNodes, languagesPhrase, learnMenu, nagParent } from './dev-learn'
import { projectsMenu, yearlyProjects } from './dev-projects'
import { between, cap as capitalizeFirst, devState, freelanceRating, localFee, money, ventureAssets, withDev } from './dev-state'
import { startVentureMenu, ventureLine, ventureSubtitle, ventureView, yearlyVentures } from './dev-venture'
import { addCodingSkill, addLanguageXp, codingLanguages, codingSkill, lastCodedAge, markCoded, screenTime, SCREEN_LIMIT } from './skills'

/** Menu rows for Activities › Computer (learn to code, projects, freelancing, ventures...). */
export function devNodes(g: GameState): MenuNode[] {
  const c = g.character
  const nodes: MenuNode[] = [{ type: 'heading', id: 'computer.dev.h.code', label: 'Coding' }, learnMenu, projectsMenu, competitionsMenu]
  const ventures = ventureAssets(g)
  if (c.age >= 12 || ventures.length) {
    nodes.push({ type: 'heading', id: 'computer.dev.h.biz', label: 'Online Business' })
    nodes.push(codeFreelanceMenu, startVentureMenu)
    for (const a of ventures) {
      nodes.push({
        type: 'menu',
        id: `computer.dev.venture.${a.id}`,
        label: a.name,
        emoji: a.emoji,
        subtitle: (gg) => {
          const cur = gg.assets.find((x) => x.id === a.id)
          return cur ? ventureSubtitle(gg, cur) : 'Gone'
        },
        header: (gg) => {
          const cur = gg.assets.find((x) => x.id === a.id)
          return cur ? `${cur.emoji} ${cur.name}` : 'This venture is gone.'
        },
        children: (gg) => {
          const cur = gg.assets.find((x) => x.id === a.id)
          return cur ? ventureView(gg, cur) : [{ type: 'info', id: 'computer.dev.venture.gone', text: 'You no longer own this.' }]
        },
      })
    }
  }
  const screen = screenTime(g)
  if (screen > 0) {
    nodes.push({
      type: 'info',
      id: 'computer.dev.screen',
      emoji: screen > SCREEN_LIMIT ? '\u{1F635}\u{200D}\u{1F4AB}' : '\u{23F1}\u{FE0F}',
      text: screen > SCREEN_LIMIT ? `Screen time this year: ${screen} sessions. Your eyes, grades and ${c.age < 18 ? 'parents' : 'posture'} are not happy.` : `Screen time this year: ${screen} of ~${SCREEN_LIMIT} healthy sessions.`,
    })
  }
  return nodes
}

// ---------------------------------------------------------------------------
// Yearly

/** Coding skill drifts: a software job or a CS degree keeps you sharp; years away make you rusty. */
function skillYear(g: GameState): void {
  const c = g.character
  if (c.prison) return
  const def = c.job ? getJobDef(c.job.defId) : undefined
  const cur = c.education.current
  const csStudent = !!cur && (cur.level === 'university' || cur.level === 'community' || cur.level === 'graduate') && ['Computer Science', 'Information Systems', 'Mathematics', 'Engineering'].includes(cur.major ?? '')
  if (def?.industry === 'tech' || csStudent) {
    addCodingSkill(g, randInt(g, 1, csStudent ? 3 : 2))
    const main = Object.entries(codingLanguages(g)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'python'
    addLanguageXp(g, main, randInt(g, 1, 3))
    markCoded(g)
    return
  }
  const last = lastCodedAge(g)
  const skill = codingSkill(g)
  if (last === null || skill < 15 || c.age - last < 3) return
  addCodingSkill(g, -randInt(g, 1, 3))
  for (const id of Object.keys(codingLanguages(g))) if (chance(g, 0.5)) addLanguageXp(g, id, -randInt(g, 1, 2))
  if (chance(g, 0.35)) log(g, pick(g, ["My coding skills are getting rusty. I forgot what a for loop is for.", "I opened my old code and couldn't understand a word of it. I wrote it."]), 'neutral')
}

const PARENT_SCRIPT = defineScript('computer.dev.parents.screen', (g, choice, data) => {
  const c = g.character
  if (!c.alive) return
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const p = g.people.find((x) => x.id === d.personId) ?? nagParent(g)
  const who = p ? parentWord(p) : 'your parents'
  const Who = capitalizeFirst(who)
  const earned = typeof d.earned === 'number' && Number.isFinite(d.earned) ? d.earned : 0
  const broken = d.broken === true
  const confiscate = (years: number) => {
    // Already locked away (say, by the police after something shadier): that lock stands.
    if (!ownsComputer(g) || computerLocked(g)) return ''
    g.flags.computerLockedUntil = c.age + years
    g.flags.computerLockedBy = 'Your parents'
    log(g, `My parents confiscated my computer until I'm ${c.age + years}.`, 'bad')
    return ` ${Who} unplugged your computer and locked it in ${pick(g, ['the garage', 'their closet', 'the trunk of the car', 'a cupboard with a padlock'])} until you're ${c.age + years}.`
  }
  if (choice === 'promise') {
    addStat(g, 'happiness', -randInt(g, 1, 3))
    if (p) addRelationship(p, randInt(g, 2, 5))
    g.flags.devScreenPromise = c.age
    notice(g, 'Pinky Promise', `You promised ${who} you'd cut back on screen time and do your homework first. ${Who} said "We'll see." It sounded like a threat.`, { emoji: '\u{1F91E}' })
    return
  }
  if (choice === 'earnings' && earned >= localFee(g, 500)) {
    if (p) addRelationship(p, randInt(g, 3, 7))
    notice(g, 'Show Me the Money', `You showed ${who} that you've earned ${money(earned)} at the computer. ${Who} went quiet, then asked if you could build a website for ${pick(g, ['their friend\'s bakery', 'the church bake sale', 'their book club'])}. Screen time: negotiable. Grades: still not.`, { emoji: '\u{1F4B0}', tone: 'good' })
    return
  }
  if (p) addRelationship(p, -randInt(g, 5, 10))
  addStat(g, 'happiness', -randInt(g, 2, 5))
  const odds = choice === 'earnings' ? 0.35 : broken ? 0.8 : 0.5
  const taken = chance(g, odds) ? confiscate(1) : ''
  notice(
    g,
    taken ? 'Confiscated!' : 'Screen Time Fight',
    choice === 'earnings' ? `You proudly showed ${who} the ${money(earned)} you've made online. "That's ${pick(g, ['about two hours of my salary', 'not even the electricity bill', 'adorable'])}." They were not impressed.${taken}` : `You argued that coding is basically homework. ${Who} pointed out your grades.${taken || ' You won this round. Barely.'}`,
    { emoji: taken ? '\u{1F512}' : '\u{1F4A2}', tone: 'bad' },
  )
})

/** Everything you've earned at the computer this life (for convincing your parents). */
function lifetimeEarnings(g: GameState): number {
  const s = devState(g)
  return s.freelance.earned + s.projects.reduce((sum, p) => sum + p.earned, 0) + s.exits.reduce((sum, e) => sum + e.amount, 0) + (g.counters.ventureIncome ?? 0)
}

/** Parents of a minor react to last year's screen time and grades. Returns popups used (0/1). */
function parentsYear(g: GameState, budget: number): number {
  const c = g.character
  if (c.age >= 18 || c.prison || c.residence.status !== 'parents' || guardians(g).length === 0) return 0
  const last = screenTime(g, c.age - 1)
  const cur = c.education.current
  const grades = cur && cur.level !== 'preschool' ? cur.grades : null
  if (last > SCREEN_LIMIT) {
    // Too much screen time already cost grades during the year; here the parents notice.
    if (grades !== null && grades < 60 && budget > 0 && ownsComputer(g) && !computerLocked(g) && chance(g, 0.65)) {
      const p = nagParent(g)
      const earned = lifetimeEarnings(g)
      const broken = g.flags.devScreenPromise === c.age - 2 || g.flags.devScreenPromise === c.age - 1
      withDev(g, (s) => {
        s.nags += 1
      })
      count(g, 'screenTimeTalks')
      scriptChoice(
        g,
        PARENT_SCRIPT,
        'Screen Time Talk',
        `${p ? capitalizeFirst(parentWord(p)) : 'Your parents'} sat you down. "You were on that computer ${last * 3 + randInt(g, 0, 8)} days in a row and your grades are ${Math.round(grades)}%. ${broken ? 'You PROMISED.' : 'This stops now.'}"`,
        [
          { id: 'promise', label: 'Promise to cut back', emoji: '\u{1F91E}' },
          { id: 'argue', label: 'Argue that coding IS studying', emoji: '\u{1F5E3}\u{FE0F}' },
          ...(earned > 0 ? [{ id: 'earnings', label: `Show them the ${money(earned)} you've earned`, emoji: '\u{1F4B0}' }] : []),
        ],
        { emoji: '\u{1F4F5}', data: { personId: p?.id ?? '', earned, broken }, personId: p?.id },
      )
      return 1
    }
    if (chance(g, 0.5)) log(g, pick(g, ['My parents complained that I live on the computer.', 'My parents change the Wi-Fi password at 10 PM. Every night.', 'My parents threatened to throw my computer in the lake.']), 'neutral')
    return 0
  }
  if (codingSkill(g) >= 40 && (grades ?? 0) >= 75 && chance(g, 0.25)) {
    const p = pick(g, guardians(g))
    addRelationship(p, 2)
    log(g, `${capitalizeFirst(parentWord(p)).replace(/^Your/, 'My')} bragged to the neighbors that I'm "basically a hacker."`, 'good')
  }
  return 0
}

/** Yearly hook: skill drift, project royalties, ventures, parents. At most one popup from this side. */
export function yearlyDev(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  skillYear(g)
  yearlyProjects(g)
  let budget = 1
  budget -= parentsYear(g, budget)
  yearlyVentures(g, between(budget, 0, 1))
}

// ---------------------------------------------------------------------------
// AI context

/** One compact line for the AI context ('' when nothing to say). */
export function devSummary(g: GameState): string {
  const parts: string[] = []
  const skill = codingSkill(g)
  const langs = languagesPhrase(g)
  if (skill > 0) parts.push(langs ? `codes in ${langs} (skill ${skill})` : `is learning to code (skill ${skill})`)
  const ventures = ventureAssets(g)
  if (ventures.length) {
    const lines = ventures.slice(0, 2).map((a) => ventureLine(g, a))
    parts.push(`runs ${lines.join(' and ')}${ventures.length > 2 ? ` and ${ventures.length - 2} more` : ''}`)
  }
  const s = devState(g)
  if (s.exits.length) parts.push(`sold ${s.exits.length === 1 ? `${s.exits[0].name} for ${money(s.exits[0].amount)}` : `${s.exits.length} startups`}`)
  if (s.freelance.gigs >= 3) {
    const r = freelanceRating(s)
    parts.push(`freelances online (${s.freelance.gigs} jobs${r > 0 ? `, ${r.toFixed(1)} stars` : ''})`)
  }
  const earning = s.projects.filter((p) => p.income > 0)
  if (earning.length) parts.push(`side projects earn ${money(earning.reduce((sum, p) => sum + p.income, 0))}/yr`)
  const locked = computerLocked(g)
  if (locked && ownsComputer(g)) parts.push(`computer confiscated until ${g.flags.computerLockedUntil}`)
  else if (screenTime(g) > SCREEN_LIMIT) parts.push('spends way too much time at the computer')
  if (parts.length === 0) return ''
  const text = capitalizeFirst(parts.join('; '))
  return text.length > 300 ? `${text.slice(0, 297)}…` : text
}

// ---------------------------------------------------------------------------
// No computer, and the owned-venture screen

/** What Activities › Computer shows when you don't have a working computer (e.g. ask your parents for one). */
export function noComputerNodes(g: GameState): MenuNode[] {
  return getAComputerNodes(g)
}

/** Owned-asset screen for a kind 'venture' asset (SaaS, app, online store...), registered in menus.ts. */
export function ventureAssetView(g: GameState, a: Asset): MenuNode[] {
  return ventureView(g, a)
}

export function ventureAssetSubtitle(g: GameState, a: Asset): string {
  return a.kind === 'venture' ? ventureSubtitle(g, a) : a.name
}
