// Emigrate: request to move to another country. Approval depends on your record, pets,
// military service and a bit of luck. Denied? You can try to sneak in.
// Moving ends your jobs, brings your partner (if they agree) and minor kids along, and
// leaves the rest of the family behind (marked with person.data.countryId = the old country).
import { arrestPlayer } from '../crime'
import { addStat, count, currentPartner, endJob, log, notice, remember, scriptChoice } from '../core'
import { notePerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import { localTerm } from '../data/locales'
import { COUNTRIES, getCountry, randomCity, type Country } from '../world'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { brokeNotice, firstReason, gate, isAbroad, money, niceRound, pushFlagString, result, stablePick } from './common'

const EXOTIC = ['Tiger', 'Lion', 'Monkey', 'Fox', 'Bear', 'Wolf', 'Alligator', 'Crocodile', 'Gorilla', 'Leopard', 'Cheetah', 'Jaguar', 'Python', 'Shark', 'Elephant', 'Hyena', 'Kangaroo', 'Panther', 'Komodo Dragon', 'Snake']

function schoolBlock(g: GameState): string | null {
  const cur = g.character.education.current
  if (!cur) return null
  if (cur.level === 'high' || cur.level === 'middle' || cur.level === 'elementary' || cur.level === 'preschool') {
    return `You need to finish (or drop out of) ${localTerm(g, 'high')} before you can emigrate.`
  }
  return 'You need to finish (or drop out of) school before you can emigrate.'
}

export function emigrateBlock(g: GameState): string | null {
  return firstReason(gate(g, { minAge: 18 }), schoolBlock(g))
}

/** Partner + minor kids who would move with you (for pricing). */
function movingFamily(g: GameState): { partner?: Person; kids: Person[]; pets: Person[] } {
  const partner = currentPartner(g)
  const kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild') && p.age < 18 && (p.livesWithPlayer || (partner && p.otherParentId === partner.id)) && !isAbroad(g, p))
  const pets = g.people.filter((p) => p.alive && p.relation === 'pet' && !isAbroad(g, p))
  return { partner: partner && !isAbroad(g, partner) ? partner : undefined, kids, pets }
}

function wealthOf(country: Country): number {
  return Math.max(0.5, Math.min(1.6, typeof country.wealth === 'number' ? country.wealth : 1))
}

export function relocationCost(g: GameState, country: Country): number {
  const fam = movingFamily(g)
  const people = (fam.partner ? 1 : 0) + fam.kids.length
  return niceRound(2500 * wealthOf(country) + 1200 * people)
}

function offers(g: GameState): Country[] {
  return stablePick(g, 'emigrate', COUNTRIES.filter((c) => c.id !== g.character.countryId), 8)
}

function deniedKey(country: Country): string {
  return `act.emigrate.${country.id}`
}

// ---------------------------------------------------------------------------
// Approval

function denialReason(g: GameState, country: Country): string | null {
  const c = g.character
  if (c.wantedLevel > 0) return 'Your background check flagged an outstanding warrant.'
  if (c.job?.category === 'military') return "You're currently serving in the military. Desertion isn't a great look on an application."
  const exotic = g.people.find((p) => p.alive && p.relation === 'pet' && !isAbroad(g, p) && p.species && EXOTIC.includes(p.species))
  if (exotic) return `${country.name} won't allow your pet ${exotic.species!.toLowerCase()}, ${exotic.firstName}, into the country.`
  const convictions = c.criminalRecord.filter((r) => r.convicted).length
  let p = 0.8
  if (c.education.degrees.some((d) => d.kind !== 'highschool' && d.kind !== 'ged')) p += 0.08
  if (c.stats.smarts >= 70) p += 0.04
  if (c.money < 5000) p -= 0.1
  if (convictions > 0) p = Math.min(p, 0.3 - 0.05 * (convictions - 1))
  if (chance(g, Math.max(0.05, Math.min(0.95, p)))) return null
  if (convictions > 0) return 'Immigration officials took one look at your criminal record and stamped your application DENIED.'
  return pick(g, [
    `${country.name}'s immigration office reviewed your application and decided they're full, thanks.`,
    'Your application was denied. The officer cited "vibes."',
    `${country.name} rejected your request. Apparently your paperwork was missing a form that doesn't exist.`,
  ])
}

function requestEmigration(g: GameState, country: Country): void {
  const cost = relocationCost(g, country)
  if (g.character.money < cost) {
    brokeNotice(g, cost, `moving to ${country.name}`)
    return
  }
  g.yearActions[deniedKey(country)] = 1
  const reason = denialReason(g, country)
  if (!reason) {
    g.character.money -= cost
    moveTo(g, country, true, cost)
    return
  }
  log(g, `My request to emigrate to ${country.name} was denied.`, 'bad')
  scriptChoice(g, ILLEGAL, 'Request Denied', `${country.flag} ${reason}\n\nYou could always try to get in without permission...`, [
    { id: 'sneak', label: 'Sneak across the border', emoji: '\u{1F977}' },
    { id: 'stay', label: 'Accept the decision', emoji: '\u{1F64F}' },
  ], { emoji: '\u{1F6C2}', data: { country: country.id } })
}

const ILLEGAL = defineScript('act.emigrate.illegal', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const country = typeof d.country === 'string' ? getCountry(d.country) : undefined
  if (!country || country.id === g.character.countryId) return
  if (choice !== 'sneak') {
    log(g, `I gave up on moving to ${country.name}.`, 'neutral')
    return
  }
  if (chance(g, 0.5)) {
    g.flags.illegalImmigrant = country.id
    count(g, 'illegalEmigrations')
    moveTo(g, country, false, 0)
    return
  }
  g.flags.deported = (typeof g.flags.deported === 'number' ? g.flags.deported : 0) + 1
  if (chance(g, 0.45)) {
    log(g, `I was caught trying to sneak into ${country.name}.`, 'bad')
    notice(g, 'Caught!', `Border agents caught you trying to sneak into ${country.name}. They handed you over to the police.`, { emoji: '\u{1F6A8}', tone: 'bad' })
    arrestPlayer(g, 'Illegal Border Crossing', 1)
    return
  }
  addStat(g, 'happiness', -randInt(g, 5, 10))
  log(g, `I was caught sneaking into ${country.name} and deported.`, 'bad')
  result(g, 'Deported', `You made it ${randInt(g, 2, 40)} miles past the border before you were caught and put on the next flight home.`, '\u{1F6EC}', 'bad')
})

// ---------------------------------------------------------------------------
// The move

function moveTo(g: GameState, country: Country, legal: boolean, cost: number): void {
  const c = g.character
  const oldId = c.countryId
  const oldName = getCountry(oldId).name
  const fam = movingFamily(g)
  const lines: string[] = []

  // Partner decides whether to come.
  let partnerCame = false
  if (fam.partner) {
    const p = fam.partner
    if (p.relationship >= 50) {
      partnerCame = true
      p.data.countryId = country.id
      p.livesWithPlayer = true
      notePerson(p, `Moved to ${country.name} with the player.`)
      lines.push(`${p.firstName} happily packed up and came with you.`)
    } else {
      const wasSpouse = p.relation === 'spouse'
      p.relation = wasSpouse ? 'exSpouse' : 'ex'
      p.livesWithPlayer = false
      p.data.countryId = oldId
      if (wasSpouse) count(g, 'divorces')
      notePerson(p, `Refused to move to ${country.name} and ended the relationship.`)
      log(g, `${p.firstName} refused to move to ${country.name} with me, so we broke up.`, 'bad')
      addStat(g, 'happiness', -randInt(g, 5, 12))
      lines.push(`${p.firstName} refused to leave ${oldName} and ${wasSpouse ? 'filed for divorce' : 'broke up with you'}.`)
    }
  }
  const kids = fam.kids.filter((k) => partnerCame || !fam.partner || k.otherParentId !== fam.partner.id || k.livesWithPlayer)
  for (const k of kids) {
    k.data.countryId = country.id
    k.livesWithPlayer = true
  }
  if (kids.length) lines.push(kids.length === 1 ? `${kids[0].firstName} came along.` : 'Your kids came along.')
  for (const pet of fam.pets) pet.data.countryId = country.id
  if (fam.pets.length) lines.push(fam.pets.length === 1 ? `${fam.pets[0].firstName} the ${(fam.pets[0].species ?? 'pet').toLowerCase()} came too.` : 'Your pets came too.')

  // Everyone else stays behind.
  const movers = new Set<string>([...kids.map((k) => k.id), ...fam.pets.map((p) => p.id), ...(partnerCame && fam.partner ? [fam.partner.id] : [])])
  for (const p of g.people) {
    if (movers.has(p.id) || !p.alive) continue
    if (typeof p.data.countryId !== 'string') p.data.countryId = oldId
    p.livesWithPlayer = false
  }
  const stayed = g.people.filter((p) => p.alive && (p.relation === 'parent' || p.relation === 'sibling') && p.data.countryId === oldId)
  if (stayed.length) lines.push(`You said a tearful goodbye to your family in ${oldName}.`)

  // Jobs don't transfer.
  const jobTitle = c.job?.title
  if (c.job) endJob(g, 'job', 'quit')
  if (c.partTimeJob) endJob(g, 'partTimeJob', 'quit')
  if (jobTitle) lines.push(`You had to quit your job as ${jobTitle.toLowerCase().startsWith('a') ? 'an' : 'a'} ${jobTitle}.`)

  c.countryId = country.id
  c.city = randomCity(g, country)
  if (!(c.residence.status === 'partner' && partnerCame)) {
    const rent = niceRound(9000 * wealthOf(country))
    c.residence = { status: 'renting', rent, description: `Apartment in ${c.city}` }
  }

  count(g, 'emigrations')
  pushFlagString(g, 'countriesLived', country.name)
  remember(g, `${legal ? 'Emigrated' : 'Snuck'} from ${oldName} to ${country.name} (${c.city}).`)
  log(g, legal ? `I emigrated to ${country.name} and settled in ${c.city}.` : `I snuck into ${country.name} and settled in ${c.city}.`, 'event')
  addStat(g, 'happiness', randInt(g, 3, 8))
  const title = legal ? `Welcome to ${country.name}!` : 'You Made It!'
  const opener = legal
    ? `Your request was approved! You paid ${money(cost)} in fees and moving costs and moved to ${c.city}, ${country.name}.`
    : `You slipped across the border undetected and started a new life in ${c.city}, ${country.name}. Try not to get caught.`
  notice(g, title, [opener, ...lines].join('\n\n'), { emoji: country.flag, tone: 'event' })
}

// ---------------------------------------------------------------------------
// Menu

export const emigrateMenu: MenuGroup = {
  type: 'menu',
  id: 'emigrate',
  label: 'Emigrate',
  emoji: '\u{1F6C2}',
  subtitle: 'Move to another country',
  disabledReason: emigrateBlock,
  header: (g) => {
    const fam = movingFamily(g)
    const bits = [fam.partner ? `${fam.partner.firstName}` : '', fam.kids.length ? `${fam.kids.length} kid${fam.kids.length > 1 ? 's' : ''}` : ''].filter(Boolean)
    return `Pick a country and request approval to live there. Moving ends your job${bits.length ? ` and includes ${bits.join(' and ')}` : ''}. The list changes every year.`
  },
  children: (g): MenuNode[] =>
    offers(g).map(
      (country): MenuAction => ({
        type: 'action',
        id: `emigrate.${country.id}`,
        label: country.name,
        emoji: country.flag,
        subtitle: (s) => `Relocation: ${money(relocationCost(s, country))}`,
        disabledReason: (s) => ((s.yearActions[deniedKey(country)] ?? 0) > 0 ? `${country.name} already reviewed your application this year.` : null),
        confirm: (s) => `Request approval to move to ${country.name}? If approved, you'll pay ${money(relocationCost(s, country))} and leave your job behind.`,
        run: (d) => requestEmigration(d, country),
      }),
    ),
}
