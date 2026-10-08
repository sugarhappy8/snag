// Offline obituary: a few sentences built from the life that was lived — age, cause,
// career, family left behind, notable counters and the estate — with varied phrasing.
import { counter, formatMoney, fullName, netWorth, peopleBy, pronouns, shortMoney } from '../core'
import { pick, randInt } from '../rng'
import { characterTalents, talentLabel } from '../talents'
import type { GameState, Person } from '../types'
import { country } from './helpers'
import { estrangedKids, readWill, readWl, willNameable } from './will-core'

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('')
  // Appositives ("his wife, Maria") need the serial comma to stay readable.
  const serial = items.some((i) => i.includes(','))
  return `${items.slice(0, -1).join(', ')}${serial ? ',' : ''} and ${items[items.length - 1]}`
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function spouseWord(p: Person): string {
  return p.gender === 'male' ? 'husband' : 'wife'
}

/** Build the obituary text. Pure apart from RNG draws for phrasing. */
export function writeObituary(g: GameState): string {
  const c = g.character
  const name = fullName(c)
  const P = pronouns(c.gender)
  const age = c.age
  const cause = (c.causeOfDeath ?? 'natural causes').toLowerCase()
  const place = `${c.city}, ${country(g).name}`
  const occupation = typeof g.flags.finalOccupation === 'string' ? g.flags.finalOccupation : c.job?.title ?? ''
  const sentences: string[] = []

  // Opening.
  if (g.flags.surrendered === true && cause === 'surrender') {
    sentences.push(pick(g, [`${name} gave up on life at the age of ${age} in ${place}.`, `${name} surrendered at the age of ${age} in ${place}, leaving a lot of potential on the table.`]))
  } else if (c.prison || occupation === 'Prisoner') {
    sentences.push(pick(g, [`${name} died behind bars${c.prison ? ` at ${c.prison.name}` : ''} at the age of ${age} from ${cause}.`, `Inmate ${name}, ${age}, died of ${cause} while serving time${c.prison ? ` at ${c.prison.name}` : ''}.`]))
  } else if (age < 1) {
    sentences.push(`${name} lived only a few short months in ${place} before dying from ${cause}.`)
  } else if (age < 18) {
    sentences.push(pick(g, [`${name} was taken far too soon, dying from ${cause} at just ${age} years old in ${place}.`, `${name} died from ${cause} at the age of ${age} in ${place}, with a whole life still ahead.`]))
  } else if (age >= 90) {
    sentences.push(pick(g, [`After ${age} remarkable years, ${name} has passed away from ${cause} in ${place}.`, `${name} died peacefully at the ripe old age of ${age} from ${cause} in ${place}.`]))
  } else {
    sentences.push(pick(g, [`${name}, ${age}, of ${place}, passed away from ${cause}.`, `${name} died from ${cause} at the age of ${age} in ${place}.`, `${name} has died of ${cause} in ${place}. ${P.He} was ${age}.`]))
  }

  // Career and education.
  const history = c.careerHistory.filter((r) => r.reason !== 'graduated')
  const lastJob = history.length ? history[history.length - 1] : undefined
  const job = occupation && !['Unemployed', 'Deceased', 'Prisoner', 'Kid', 'Baby', 'Infant', 'Toddler', 'Student', 'Preschooler', 'Retired', 'University Student', 'Graduate Student'].includes(occupation) ? occupation : c.retired && lastJob ? lastJob.title : ''
  if (age >= 16) {
    if (c.retired && job) sentences.push(pick(g, [`${P.He} retired after a career as ${article(job)} ${job}.`, `${P.He} spent ${P.his} working years as ${article(job)} ${job} before a well-earned retirement.`]))
    else if (job) {
      const jobs = new Set(history.map((r) => r.company)).size
      sentences.push(pick(g, [`${P.He} worked as ${article(job)} ${job}${jobs > 2 ? `, one of ${jobs} jobs over the years` : ''}.`, `At the time of ${P.his} death, ${P.he} was working as ${article(job)} ${job}.`]))
    } else if (age >= 25 && history.length === 0) {
      sentences.push(pick(g, [`${P.He} never held a steady job, which ${P.he} described as "a lifestyle choice."`, `${P.He} never worked a day in ${P.his} life and was proud of it.`]))
    }
  }
  const degrees = c.education.degrees
  const best = degrees.length ? degrees[degrees.length - 1] : undefined
  if (best && best.kind !== 'highschool' && best.kind !== 'ged') sentences.push(`${P.He} earned ${article(best.name)} ${best.name} from ${best.school}.`)
  else if (age < 18 && c.education.current) sentences.push(`${P.He} was a student at ${c.education.current.school}.`)

  // Notable things (at most two).
  const notable: string[] = []
  const n = (k: string) => counter(g, k)
  if (n('murders') > 0) notable.push(`Police files describe ${P.him} as "a person of interest" in ${plural(n('murders'), 'case')}.`)
  if (n('prisonYears') >= 2) notable.push(`${P.He} spent ${plural(n('prisonYears'), 'year')} behind bars.`)
  else if (n('crimes') >= 5 && n('convictions') === 0) notable.push(`Rumors of a criminal past were never proven.`)
  if (n('escapes') > 0) notable.push(`${P.He} once escaped from prison, a fact ${P.he} brought up at every dinner party.`)
  if (n('marriages') >= 3) notable.push(`${P.He} walked down the aisle ${n('marriages')} times.`)
  if (n('lotteryWins') > 0) notable.push(`${P.He} once hit it big in the lottery.`)
  if (c.hidden.fame >= 60) notable.push(`${P.He} was a household name, recognized wherever ${P.he} went.`)
  if (n('vacations') >= 5) notable.push(`A passionate traveler, ${P.he} took ${n('vacations')} vacations.`)
  if (n('emigrations') > 0) notable.push(`${P.He} was born in one country and made a life in another.`)
  if (n('donated') >= 5) notable.push(`${P.He} was a generous giver to charity.`)
  if (n('gym') >= 20) notable.push(`${P.He} rarely missed a day at the gym.`)
  if (n('pets') >= 3) notable.push(`${P.He} adored animals and cared for ${n('pets')} pets over the years.`)
  if (n('casinoWins') + n('casinoLosses') >= 10) notable.push(`${P.He} was a familiar face at the casino.`)
  if (n('fights') >= 10) notable.push(`${P.He} never backed down from a fight, and there were many.`)
  const gifts = characterTalents(g).map((t) => talentLabel(t).toLowerCase())
  if (gifts.length) notable.push(`${P.He} had a real gift for ${gifts.length > 1 ? `${gifts.slice(0, -1).join(', ')} and ${gifts[gifts.length - 1]}` : gifts[0]}.`)
  if (c.hidden.karma >= 80) notable.push(`Friends remember ${P.him} as one of the kindest people they ever met.`)
  else if (c.hidden.karma <= 15) notable.push(`Few will admit to missing ${P.him}.`)
  const picked: string[] = []
  const pool = [...notable]
  while (picked.length < 2 && pool.length) {
    const i = randInt(g, 0, pool.length - 1)
    picked.push(pool.splice(i, 1)[0])
  }
  sentences.push(...picked)

  // Survivors.
  const living = (rels: Parameters<typeof peopleBy>[1]) => peopleBy(g, rels)
  const spouse = living(['spouse'])[0]
  const kids = living(['child', 'stepchild'])
  const grandkids = living(['grandchild'])
  const parentsAlive = living(['parent'])
  const survivors: string[] = []
  if (spouse) survivors.push(`${P.his} ${spouseWord(spouse)}, ${spouse.firstName}`)
  if (kids.length === 1) survivors.push(`${P.his} ${kids[0].gender === 'male' ? 'son' : 'daughter'}, ${kids[0].firstName}`)
  else if (kids.length > 1) survivors.push(plural(kids.length, 'child', 'children'))
  if (grandkids.length) survivors.push(plural(grandkids.length, 'grandchild', 'grandchildren'))
  if (parentsAlive.length && survivors.length < 2) survivors.push(parentsAlive.length === 2 ? `${P.his} parents, ${parentsAlive[0].firstName} and ${parentsAlive[1].firstName}` : `${P.his} ${parentsAlive[0].gender === 'male' ? 'father' : 'mother'}, ${parentsAlive[0].firstName}`)
  if (survivors.length) {
    sentences.push(pick(g, [`${P.He} is survived by ${listJoin(survivors)}.`, `${P.He} leaves behind ${listJoin(survivors)}.`]))
  } else {
    const pet = living(['pet'])[0]
    if (pet) sentences.push(`${P.He} is survived by ${P.his} ${(pet.species ?? 'pet').toLowerCase()}, ${pet.firstName}, who is doing about as well as can be expected.`)
    else if (age >= 30) sentences.push(pick(g, [`${P.He} leaves behind no close family.`, `No family members could be reached for comment.`]))
  }

  // A rift over the will, or a gift to charity (no randomness: it must not shift the phrasing above).
  if (age >= 18) {
    const apart = estrangedKids(g)
    const sore = willNameable(g).filter((p) => {
      const w = readWl(g, p)
      return w.cut && w.known && w.anger >= 50 && !w.estr
    })
    if (apart.length > 0) sentences.push(`${P.He} had not spoken to ${apart.length === 1 ? `${P.his} ${apart[0].gender === 'male' ? 'son' : 'daughter'}, ${apart[0].firstName}` : `${apart.length} of ${P.his} children`} in years, after a quarrel over the will.`)
    else if (sore.length > 0) sentences.push('The family is said to be divided over the will.')
    const share = readWill(g).charity
    if (share >= 20) sentences.push(`${P.He} left ${share}% of ${P.his} estate to charity.`)
  }

  // Estate.
  if (age >= 18) {
    const worth = netWorth(g)
    if (worth >= 1_000_000) sentences.push(pick(g, [`${P.He} left behind an estate worth ${shortMoney(worth)}.`, `${P.His} fortune of ${shortMoney(worth)} will be divided among ${P.his} heirs.`]))
    else if (worth < 0) sentences.push(`${P.He} died ${formatMoney(-worth)} in debt.`)
    else if (worth < 1000) sentences.push(`${P.He} left behind ${formatMoney(worth)} and a drawer full of takeout menus.`)
    else sentences.push(`${P.He} left behind ${formatMoney(worth)}.`)
  }

  // Closing.
  const happy = c.stats.happiness >= 60
  sentences.push(
    pick(g, [
      ...(happy ? [`By all accounts, ${P.he} lived a happy life.`, `${P.He} will be dearly missed.`] : [`${P.He} had a complicated life, and ${P.he} lived it ${P.his} own way.`]),
      `In lieu of flowers, the family asks that you ${pick(g, ['call your mother', 'donate to a local animal shelter', 'never speak of the incident at the barbecue', 'plant a tree', 'finally return their casserole dish'])}.`,
      `A memorial service will be held in ${c.city}.`,
      'Rest in peace.',
    ]),
  )
  return sentences.join(' ')
}
