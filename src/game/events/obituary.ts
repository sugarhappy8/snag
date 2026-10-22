// Offline obituary: up to four short lines of bare facts from the life that was lived.
//   1. Name, age, cause and place (always).
//   2. The counters, then the main talent, then the job or degree.
//   3. The survivors, a rift over the will, a gift to charity, then the estate.
//   4. One closer from a dry pool (always).
// A line holds at most three fragments (each ends in a full stop) and is left out when it has
// nothing to say. No eulogy, no verdict on the life (docs/VOICE.md).
import { counter, formatMoney, fullName, netWorth, peopleBy, pronouns, shortMoney } from '../core'
import { pick } from '../rng'
import { pickLine } from '../text/pick'
import { characterTalents, talentLabel } from '../talents'
import type { GameState, Person } from '../types'
import { country } from './helpers'
import { estrangedKids, readWill, readWl, willNameable } from './will-core'

/** The most fragments one line may hold. */
const MAX_FRAGMENTS = 3

/** Occupations that are not a job to name (roleLabel's stand-ins). */
const NOT_A_JOB = new Set(['Unemployed', 'Deceased', 'Prisoner', 'Kid', 'Baby', 'Infant', 'Toddler', 'Student', 'Preschooler', 'Retired', 'University Student', 'Graduate Student'])

const FLOWERS = ['call your mother', 'donate to a local animal shelter', 'never speak of the incident at the barbecue', 'plant a tree', 'finally return their casserole dish']

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

type Pronouns = ReturnType<typeof pronouns>

/** A count in words: 4 is "four", 23 is "twenty-three". Past 99, digits. */
function numberWord(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n)
  if (n < 20) return ONES[n]
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "Four marriages." from a count and the noun. */
function tally(n: number, one: string, many = `${one}s`): string {
  return `${capital(numberWord(n))} ${n === 1 ? one : many}.`
}

/** Title Case words lowered, acronyms and single letters kept: "Complications From HIV" becomes "complications from HIV". */
function lowerWords(phrase: string): string {
  return phrase
    .trim()
    .split(/\s+/)
    .map((w) => (/^[A-Z][a-z'’-]+$/.test(w) ? w.toLowerCase() : w))
    .join(' ')
}

/** A job title for prose: "Sr. Bus Driver" becomes "senior bus driver", "VP of Engineering" "VP of engineering". */
function jobWords(title: string): string {
  return lowerWords(title.replace(/\bJr\.\s+/g, 'Junior ').replace(/\bSr\.\s+/g, 'Senior ').replace(/\bAsst\.\s+/g, 'Assistant '))
}

function childWord(p: Person): string {
  return p.gender === 'male' ? 'son' : 'daughter'
}

/** Line 1: `Name, 78. Heart attack, Chicago, United States.` (a prisoner's place is the prison). */
function opening(g: GameState): string {
  const c = g.character
  const cause = c.causeOfDeath?.trim() || 'Natural causes'
  const said = g.flags.surrendered === true && cause.toLowerCase() === 'surrender' ? 'Surrendered' : capital(lowerWords(cause))
  const place = c.prison ? c.prison.name : [c.city, country(g).name].filter(Boolean).join(', ')
  return `${fullName(c)}, ${c.age}. ${said}, ${place}.`
}

/** The job at death, the job retired from, or the best degree past high school. */
function workFragment(g: GameState): string {
  const c = g.character
  const occupation = typeof g.flags.finalOccupation === 'string' ? g.flags.finalOccupation : c.job?.title ?? ''
  const history = c.careerHistory.filter((r) => r.reason !== 'graduated')
  const last = history.length ? history[history.length - 1] : undefined
  const job = occupation && !NOT_A_JOB.has(occupation) ? occupation : c.retired && last ? last.title : ''
  if (c.age >= 16 && job) return c.retired ? `Retired ${jobWords(job)}.` : `${capital(jobWords(job))}.`
  const degrees = c.education.degrees
  const best = degrees.length ? degrees[degrees.length - 1] : undefined
  if (best && best.kind !== 'highschool' && best.kind !== 'ged') return `${best.name}, ${best.school}.`
  return ''
}

/** Line 2: the counters first, then the main talent, then the work. */
function lifeFragments(g: GameState): string[] {
  const n = (key: string) => counter(g, key)
  const out: string[] = []
  // One marriage is the usual case (and the spouse shows on line 3); two or more is news.
  if (n('marriages') >= 2) out.push(tally(n('marriages'), 'marriage'))
  if (n('escapes') > 0) out.push(tally(n('escapes'), 'prison escape'))
  if (n('lotteryWins') > 0) out.push(tally(n('lotteryWins'), 'lottery win'))
  if (n('murders') > 0) out.push(`A person of interest in ${n('murders')} ${n('murders') === 1 ? 'case' : 'cases'}.`)
  if (n('prisonYears') > 0) out.push(tally(n('prisonYears'), 'year behind bars', 'years behind bars'))
  const talent = characterTalents(g)[0]
  if (talent) out.push(`Gifted at ${talentLabel(talent).toLowerCase()}.`)
  const work = workFragment(g)
  if (work) out.push(work)
  return out.slice(0, MAX_FRAGMENTS)
}

interface Survivors {
  /** `Survived by Maria and two children.`, or '' when no family survives. */
  text: string
  /** Ids of the people the text names. */
  named: string[]
}

/** Spouse, children, grandchildren, then parents: the first two of them, never a list of three. */
function survivors(g: GameState, P: Pronouns): Survivors {
  const spouse = peopleBy(g, ['spouse'])[0]
  const kids = peopleBy(g, ['child', 'stepchild'])
  const grandkids = peopleBy(g, ['grandchild'])
  const parents = peopleBy(g, ['parent'])
  const items: { text: string; ids: string[] }[] = []
  if (spouse) items.push({ text: spouse.firstName, ids: [spouse.id] })
  if (kids.length === 1) items.push({ text: `${P.his} ${childWord(kids[0])}, ${kids[0].firstName}`, ids: [kids[0].id] })
  else if (kids.length > 1) items.push({ text: `${numberWord(kids.length)} children`, ids: [] })
  if (grandkids.length) items.push({ text: `${numberWord(grandkids.length)} ${grandkids.length === 1 ? 'grandchild' : 'grandchildren'}`, ids: [] })
  if (parents.length > 1) items.push({ text: `${P.his} parents, ${parents[0].firstName} and ${parents[1].firstName}`, ids: [parents[0].id, parents[1].id] })
  else if (parents.length) items.push({ text: `${P.his} ${parents[0].gender === 'male' ? 'father' : 'mother'}, ${parents[0].firstName}`, ids: [parents[0].id] })
  const [a, b] = items
  if (!a) return { text: '', named: [] }
  // An appositive ("her son, Max") needs a closing comma before "and".
  const who = b ? `${a.text}${a.text.includes(',') ? ',' : ''} and ${b.text}` : a.text
  return { text: `Survived by ${who}.`, named: [...a.ids, ...(b?.ids ?? [])] }
}

/** Line 3: the survivors, a rift over the will, a charity share of 20% or more, then the estate. */
function familyFragments(g: GameState, P: Pronouns, left: Survivors): string[] {
  const out: string[] = []
  if (left.text) out.push(left.text)
  if (g.character.age >= 18) {
    const apart = estrangedKids(g)
    if (apart.length === 1) {
      const k = apart[0]
      out.push(`Hadn't spoken to ${left.named.includes(k.id) ? k.firstName : `${P.his} ${childWord(k)}, ${k.firstName},`} since a fight over the will.`)
    } else if (apart.length > 1) {
      out.push(`Hadn't spoken to ${numberWord(apart.length)} of ${P.his} children since a fight over the will.`)
    } else if (willNameable(g).some((p) => {
      const w = readWl(g, p)
      return w.cut && w.known && w.anger >= 50 && !w.estr
    })) {
      out.push('The will split the family.')
    }
    const share = readWill(g).charity
    if (share >= 20) out.push(`Left ${share}% of the estate to charity.`)
    const worth = netWorth(g)
    if (worth >= 1_000_000) out.push(`Left ${shortMoney(worth)}.`)
    else if (worth < 0) out.push(`Died ${formatMoney(-worth)} in debt.`)
    else out.push(`Left ${formatMoney(worth)}.`)
  }
  return out.slice(0, MAX_FRAGMENTS)
}

/** Line 4: one closer. The no-family line only when nobody in the family survives, from age 30. */
function closer(g: GameState, alone: boolean): string {
  const c = g.character
  return pick(g, [
    ...(alone && c.age >= 30 ? ['No family members could be reached for comment.'] : []),
    `In lieu of flowers, the family asks that you ${pickLine(g, FLOWERS)}.`,
    `A memorial service will be held in ${c.city || country(g).name}.`,
    'Rest in peace.',
  ])
}

/** The obituary as at most four lines. Pure apart from the RNG draws of the closer. */
export function obituaryLines(g: GameState): string[] {
  const P = pronouns(g.character.gender)
  const left = survivors(g, P)
  const lines = [opening(g), lifeFragments(g).join(' '), familyFragments(g, P, left).join(' ')].filter((line) => line !== '')
  lines.push(closer(g, left.text === ''))
  return lines
}

/** The obituary text: its lines joined with a space. */
export function writeObituary(g: GameState): string {
  return obituaryLines(g).join(' ')
}
