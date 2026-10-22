// Connections: rich or famous parents without a company of their own. Their kids' summer jobs and
// first jobs get "arranged" by a family friend, a famous parent's name opens a door in acting or
// music, and everybody has an opinion. Using your name costs favors (the more you call in, the
// less they are worth and the more the friend expects back), can embarrass the kid, and invites the
// press. At most one popup a year, and it shares the family business's popup budget
// (business/nepo-year.ts). A parent who owns a company gets the ask popups from business/nepo-asks.ts
// instead.
import { personCash } from '../cash'
import { addMoney, addRelationship, addStat, formatMoney, log, notice, scriptChoice } from '../core'
import { businessAssets } from '../business/state'
import { internWord } from '../business/nepo-roles'
import { driveOf, outlookFor } from '../business/nepo-model'
import { popupRoom, usePopup } from '../business/nepo-year'
import { hasTech } from '../history/timeline'
import { notePerson } from '../people'
import { chance, pick } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { ChoiceOption, GameState, Json, Person } from '../types'
import { addEntitlement, entitlement, perceivedWealth, typicalIncome, wealthTier } from './wealth-core'

const SCRIPT = defineScript('nepo.life', (g, choice, data) => {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : null
  const p = g.people.find((x) => x.id === (typeof d?.pid === 'string' ? d.pid : ''))
  const kind = typeof d?.kind === 'string' ? d.kind : ''
  if (!p || !p.alive || g.character.age < 18) return
  resolve(g, p, kind, choice)
})

type Kind = 'summer' | 'intern' | 'screen' | 'intro'

// ---------------------------------------------------------------------------
// Favors: calling people in is a currency that wears out

interface Favors {
  n: number
  y: number
}

function readFavors(g: GameState): Favors {
  const v = g.flags['nepo.favors']
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { n: 0, y: g.year }
  return { n: typeof v.n === 'number' && Number.isFinite(v.n) ? Math.max(0, Math.round(v.n)) : 0, y: typeof v.y === 'number' ? v.y : g.year }
}

/** Favors already spent, fading by one every three years. */
export function favorsSpent(g: GameState): number {
  const f = readFavors(g)
  return Math.max(0, f.n - Math.floor(Math.max(0, g.year - f.y) / 3))
}

function spendFavor(g: GameState): void {
  const n = favorsSpent(g) + 1
  g.flags['nepo.favors'] = { n, y: g.year } as Json
}

/** The chance the call works. Pure. */
export function callOdds(g: GameState, p: Person, kind: Kind): number {
  const spent = favorsSpent(g)
  if (kind === 'screen') {
    const fame = g.character.hidden.fame
    const craft = typeof p.data.nepoCraft === 'number' ? p.data.nepoCraft : 0
    return clamp01(0.3 + fame / 220 + p.stats.looks / 350 + craft * 0.08 - spent * 0.1)
  }
  return clamp01(0.85 - spent * 0.1)
}

function clamp01(n: number): number {
  return Math.max(0.08, Math.min(0.92, n))
}

/** The chance a kid who is left to it finds something on their own. Pure. */
export function ownOdds(p: Person): number {
  return Math.max(0.2, Math.min(0.8, 0.3 + driveOf(p) / 200 - entitlement(p) / 300))
}

// ---------------------------------------------------------------------------
// Words

function press(g: GameState): string {
  return g.year >= 2022 && hasTech(g, 'socialMedia') ? 'nepo baby' : g.year >= 1990 ? 'silver-spoon kid' : "the boss's pet"
}

function viral(g: GameState): boolean {
  return hasTech(g, 'socialMedia') && g.year >= 2012
}

function whoIs(p: Person): string {
  return `${p.firstName}, your ${p.gender === 'male' ? (p.relation === 'grandchild' ? 'grandson' : 'son') : p.relation === 'grandchild' ? 'granddaughter' : 'daughter'}`
}

function stage(g: GameState): string {
  if (g.year >= 2010 && hasTech(g, 'streaming')) return 'a part in a streaming series, or a meeting with a record label'
  if (hasTech(g, 'tv')) return 'a part in a film or a television series'
  if (g.year >= 1912) return hasTech(g, 'radio') ? 'a part in a picture or a radio drama' : 'a part in a picture or a stage show'
  return 'a role in the local theater company'
}

// ---------------------------------------------------------------------------
// The popup

function kidsFor(g: GameState): Person[] {
  return g.people.filter(
    (p) =>
      p.alive &&
      (p.relation === 'child' || p.relation === 'stepchild' || p.relation === 'grandchild') &&
      p.age >= 14 &&
      p.age <= 28 &&
      p.relationship >= 25 &&
      p.data.disowned !== true &&
      !p.data.nepo &&
      !(typeof p.data.nepoLife === 'number' && g.year - p.data.nepoLife < 4),
  )
}

function pickKind(g: GameState, p: Person): Kind | null {
  const fame = g.character.hidden.fame
  const options: Kind[] = []
  if (p.age < 18) options.push('summer')
  else if (p.age <= 25) options.push('intern')
  else options.push('intro')
  if (fame >= 35 && p.age <= 26 && g.year >= 1912) options.push('screen')
  return options.length ? pick(g, options) : null
}

function odds(g: GameState): number {
  const fame = g.character.hidden.fame
  return Math.min(0.2, 0.07 + (fame >= 40 ? 0.05 : 0) + (wealthTier(g) >= 3 ? 0.03 : 0))
}

/** Yearly: a connection-based chance for a rich or famous parent's kid. At most one popup. */
export function yearlyNepoLife(g: GameState): void {
  const c = g.character
  if (!c.alive || c.age < 30 || c.prison || !popupRoom(g)) return
  const tier = wealthTier(g)
  if (tier < 2 && c.hidden.fame < 35) return
  // A parent with a company of their own gets the job asks instead.
  if (businessAssets(g).some((a) => Number(a.details.share ?? 1) >= 0.2)) return
  const kids = kidsFor(g)
  if (kids.length === 0 || !chance(g, odds(g))) return
  const p = pick(g, kids)
  const kind = pickKind(g, p)
  if (!kind || !usePopup(g)) return
  p.data.nepoLife = g.year
  present(g, p, kind)
}

function present(g: GameState, p: Person, kind: Kind): void {
  const call = callOdds(g, p, kind)
  const own = ownOdds(p)
  const biz = hasTalent(g, 'Business')
  const callHint = biz ? talentHint(g, 'Business', `About ${Math.round(call * 100)}% it works; each favor you call in is worth less, and the friend will want something back`) : undefined
  const ownHint = biz ? talentHint(g, 'Business', `About ${Math.round(own * 100)}% ${p.firstName} finds something alone, and a kid who does comes back stronger`) : undefined
  const choices: ChoiceOption[] = []
  let title: string
  let text: string
  if (kind === 'summer') {
    title = 'A Summer Job'
    text = `${whoIs(p)} (${p.age}) wants a summer job. A family friend who runs a firm in town says "of course, send ${p.gender === 'male' ? 'him' : 'her'} over." One phone call from you and it is done.`
    choices.push({ id: 'call', label: 'Make the call', emoji: '\u{1F4DE}', hint: callHint }, { id: 'own', label: `Let ${p.firstName} find one alone`, emoji: '\u{1F9ED}', hint: ownHint })
  } else if (kind === 'intern') {
    const word = internWord(g).toLowerCase()
    title = `An Arranged ${word[0].toUpperCase()}${word.slice(1)}ship`
    text = `${whoIs(p)} (${p.age}) needs a start. A friend of yours who runs a well-known firm would happily offer ${p.gender === 'male' ? 'him' : 'her'} ${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}ship if you ask. Nobody would mention how it came about. Everybody would know.`
    choices.push({ id: 'call', label: 'Call your friend', emoji: '\u{1F4DE}', hint: callHint }, { id: 'own', label: `Let ${p.firstName} apply like everyone else`, emoji: '\u{1F9ED}', hint: ownHint })
  } else if (kind === 'intro') {
    title = 'A Door Opens'
    text = `${whoIs(p)} (${p.age}) is between jobs. A contact of yours says they have "something that would suit ${p.gender === 'male' ? 'him' : 'her'}" if you put in a word.`
    choices.push({ id: 'call', label: 'Put in a word', emoji: '\u{1F4DE}', hint: callHint }, { id: 'own', label: `Let ${p.firstName} sort it out alone`, emoji: '\u{1F9ED}', hint: ownHint })
  } else {
    title = 'Your Name Opens Doors'
    text = `${whoIs(p)} (${p.age}) wants to be on screen, and your name is on every list in town. A casting director would see ${p.gender === 'male' ? 'him' : 'her'} for ${stage(g)}. So would anyone you asked. People will say what they will say.`
    choices.push(
      { id: 'call', label: 'Make the introduction', emoji: '\u{1F31F}', hint: callHint },
      { id: 'lessons', label: `Pay for lessons first (${formatMoney(lessonCost(g))})`, emoji: '\u{1F3AD}', hint: biz ? talentHint(g, 'Business', 'Lessons make the introduction land better next time') : undefined },
      { id: 'own', label: `Keep ${p.firstName} out of it`, emoji: '\u{1F64A}' },
    )
  }
  scriptChoice(g, SCRIPT, title, text, choices, { emoji: kind === 'screen' ? '\u{1F31F}' : '\u{1F4DE}', data: { pid: p.id, kind } as Json, personId: p.id })
}

/** What lessons cost: a few percent of a typical year's income, more for the very rich (capped by what is spare). */
export function lessonCost(g: GameState): number {
  return Math.round(Math.min(perceivedWealth(g) * 0.002, typicalIncome(g) * 0.3 * (1 + wealthTier(g) * 0.5)) / 10) * 10 || 10
}

// ---------------------------------------------------------------------------
// The answers

function wage(g: GameState, p: Person, share: number): number {
  const w = Math.round((typicalIncome(g) * share * (p.age < 18 ? 0.25 : 1)) / 10) * 10
  return Math.max(0, w)
}

function resolve(g: GameState, p: Person, kind: string, choice: string): void {
  const k = kind as Kind
  if (choice === 'lessons') {
    const cost = lessonCost(g)
    if (g.character.money < cost) {
      notice(g, 'Lessons', `You cannot spare ${formatMoney(cost)} for lessons right now.`, { emoji: '\u{1F3AD}' })
      return
    }
    addMoney(g, -cost, 'tuition')
    p.data.nepoCraft = (typeof p.data.nepoCraft === 'number' ? p.data.nepoCraft : 0) + 1
    p.stats.happiness = Math.min(100, p.stats.happiness + 4)
    addRelationship(p, 4)
    notePerson(p, 'Took acting and music lessons you paid for.')
    log(g, `I paid for ${p.firstName}'s acting and music lessons.`, 'good')
    notice(g, 'Lessons', `${p.firstName} took the lessons seriously for a whole season. The teacher says there is something there. "Something" is not a compliment or an insult.`, { emoji: '\u{1F3AD}', tone: 'good' })
    return
  }
  if (choice === 'own') {
    if (chance(g, ownOdds(p))) {
      p.data.nepoSelfMade = g.year
      addEntitlement(p, -6)
      p.stats.smarts = Math.min(100, p.stats.smarts + 2)
      addRelationship(p, 4)
      personCash(g, p, Math.round(p.money + wage(g, p, k === 'summer' ? 0.08 : 0.25)) - p.money, 'wage')
      notePerson(p, `Found work alone at ${p.age} when ${p.gender === 'male' ? 'he' : 'she'} could have used your name.`)
      log(g, `${p.firstName} found ${p.gender === 'male' ? 'his' : 'her'} own job without using my name.`, 'good')
      notice(g, 'On Their Own', `${p.firstName} found something alone. It is smaller than the one you could have arranged and entirely ${p.gender === 'male' ? 'his' : 'hers'}. ${p.gender === 'male' ? 'He' : 'She'} mentioned it at dinner four times.`, { emoji: '\u{1F4AA}', tone: 'good' })
    } else {
      addRelationship(p, -1)
      log(g, `${p.firstName} spent the time looking for a job and did not find one.`)
      notice(g, 'No Luck', `${p.firstName} sent out applications and heard back from nobody. It was a character-building season, if you like that kind of thing.`, { emoji: '\u{1F4EC}' })
    }
    return
  }
  // The call.
  const works = chance(g, callOdds(g, p, k))
  spendFavor(g)
  if (!works) {
    addRelationship(p, -1)
    log(g, `The favor I called in for ${p.firstName} did not come through.`, 'bad')
    notice(g, 'No Dice', k === 'screen' ? `The casting director took the meeting, smiled, and passed. Your name opened the door; it did not do the audition.` : `Your friend was very sorry: "the position was just filled." Both of you knew what that meant.`, { emoji: '\u{1F4DE}', tone: 'bad' })
    return
  }
  addEntitlement(p, g.character.hidden.fame >= 40 ? 8 : 5)
  p.data.nepoArranged = g.year
  const o = outlookFor(p, k === 'summer' ? 0 : k === 'intern' ? 0 : 1)
  const shines = o.fit >= 6
  personCash(g, p, Math.round(p.money + wage(g, p, k === 'screen' ? 0.6 : k === 'summer' ? 0.1 : 0.3)) - p.money, 'wage')
  if (shines) {
    p.stats.smarts = Math.min(100, p.stats.smarts + 1)
    addRelationship(p, 6)
  } else addRelationship(p, 3)
  p.stats.happiness = Math.min(100, p.stats.happiness + 5)
  notePerson(p, k === 'screen' ? `Got ${stage(g)} through your name (age ${p.age}).` : `Got a job through your friend (age ${p.age}).`)
  log(g, k === 'screen' ? `My name got ${p.firstName} in front of a casting director.` : `I called in a favor to get ${p.firstName} a job.`, 'neutral')
  const he = p.gender === 'male' ? 'He' : 'She'
  const result =
    k === 'screen'
      ? shines
        ? `${p.firstName} got the part and, to everyone's surprise, was not bad.`
        : `${p.firstName} got the part. The reviews were kind in the way reviews are kind to the boss's kid.`
      : shines
        ? `${p.firstName} turned out to be good at it. ${he} earned the second look the first look was meant to buy.`
        : `${p.firstName} did fine, in the way people do fine when they know nobody will fire them.`
  // The price: the friend calls it in later, the press may notice.
  let extra = ''
  if (chance(g, 0.3)) {
    const cost = Math.round(Math.min(perceivedWealth(g) * 0.003, typicalIncome(g) * 0.5) / 10) * 10
    if (cost > 0 && g.character.money >= cost) {
      addMoney(g, -cost, 'donation')
      extra += ` Your friend called the favor in: a ${formatMoney(cost)} donation to their favorite cause.`
    }
  }
  const famous = g.character.hidden.fame >= 35
  if (chance(g, (famous ? 0.35 : 0.15) * (k === 'screen' ? 1.4 : 1))) {
    p.stats.happiness = Math.max(0, p.stats.happiness - 6)
    if (famous) g.character.hidden.fame = Math.max(0, g.character.hidden.fame - 1)
    addStat(g, 'happiness', -2)
    extra += viral(g) ? ` Then someone posted it, and ${p.firstName} was a "${press(g)}" for a week.` : ` The gossip columns called ${p.firstName} "${press(g)}".`
  }
  notice(g, k === 'screen' ? 'A Foot in the Door' : 'Favor Granted', `${result}${extra}`, { emoji: k === 'screen' ? '\u{1F31F}' : '\u{1F91D}', tone: 'good' })
}
