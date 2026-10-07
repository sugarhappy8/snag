// Moving countries: who comes along, what's left behind, exit taxes, the new legal status, the
// sponsoring job, and the ways out (leaving, deportation). Mutates the draft; used by the
// Emigrate menu (immigration-apply.ts) and the yearly immigration clock (immigration.ts).
import { companyName, hireForJob } from '../careers'
import { addStat, count, currentPartner, endJob, log, notice, remember, spend } from '../core'
import { dualRule, type InvestKind } from '../data/immigration'
import { priceLevel } from '../history/timeline'
import type { Industry } from '../data/jobs'
import { notePerson } from '../people'
import { randInt } from '../rng'
import { getCountry, randomCity, type Country } from '../world'
import type { Asset, GameState, ImmigrationStatus, Person } from '../types'
import { isAbroad, money, niceRound, pushFlagString, stableRng } from './common'
import {
  blocAccess,
  citizenshipsOf,
  expandCitizenships,
  grantCitizenship,
  isCitizenOf,
  loseCitizenship,
  personCitizenships,
  place,
  setStatus,
  stampPerson,
  updateImm,
} from './immigration-state'
import { exitTaxDue, type SponsorJob } from './immigration-routes'

// ---------------------------------------------------------------------------
// The household

/** Partner + minor kids + pets who would move with you. */
export function movingFamily(g: GameState): { partner?: Person; kids: Person[]; pets: Person[] } {
  const partner = currentPartner(g)
  const kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild') && p.age < 18 && (p.livesWithPlayer || (partner && p.otherParentId === partner.id)) && !isAbroad(g, p))
  const pets = g.people.filter((p) => p.alive && p.relation === 'pet' && !isAbroad(g, p))
  return { partner: partner && !isAbroad(g, partner) ? partner : undefined, kids, pets }
}

/** Animals no country lets you bring in as a pet. */
const EXOTIC_PETS = ['Tiger', 'Lion', 'Monkey', 'Wolf', 'Gorilla', 'Bear', 'Alligator', 'Crocodile', 'Leopard', 'Cheetah', 'Jaguar', 'Hyena', 'Kangaroo', 'Panther', 'Komodo Dragon', 'Elephant', 'Shark']

export function isExoticPet(p: Person): boolean {
  return p.relation === 'pet' && !!p.species && EXOTIC_PETS.includes(p.species)
}

function wealthOf(country: Country): number {
  return Math.max(0.5, Math.min(1.6, typeof country.wealth === 'number' ? country.wealth : 1))
}

export function relocationCost(g: GameState, country: Country): number {
  const fam = movingFamily(g)
  const people = (fam.partner ? 1 : 0) + fam.kids.length
  return niceRound(2500 * wealthOf(country) + 1200 * people)
}

const FAMILY_RELATIONS = ['spouse', 'fiance', 'partner', 'child', 'stepchild', 'parent', 'stepparent', 'sibling', 'halfSibling', 'stepsibling', 'grandparent', 'grandchild']

/** Record everyone's nationality before people start moving around (Person.data.citizenships). */
export function stampFamily(g: GameState): void {
  for (const p of g.people) {
    if (!p.alive || !FAMILY_RELATIONS.includes(p.relation)) continue
    if (Array.isArray(p.data.citizenships) && p.data.citizenships.length) continue
    stampPerson(p, personCitizenships(g, p))
  }
}

// ---------------------------------------------------------------------------
// Citizenship changes

/** Passports you'd give up by naturalizing in `dest` this year (its rules and theirs on dual citizenship). */
export function passportsLostBy(g: GameState, dest: string): string[] {
  const year = g.year
  const held = citizenshipsOf(g).filter((id) => id !== dest)
  const destRule = dualRule(dest, year)
  const shares = (id: string) => blocAccess([id], dest, year).length > 0
  return held.filter((id) => {
    if (destRule === 'no') return true
    if (destRule === 'limited' && !shares(id)) return true
    const own = dualRule(id, year)
    return own === 'no' || (own === 'limited' && !shares(id))
  })
}

/**
 * Take a new citizenship (mutates), giving up the passports the dual-citizenship rules on either
 * side won't let you keep (passportsLostBy, worked out before the new one is added). Renouncing
 * can trigger an expatriation tax. Returns the passports lost and the tax paid.
 */
export function acquireCitizenship(g: GameState, dest: string): { lost: string[]; tax: number; taxName: string } {
  const renounce = passportsLostBy(g, dest)
  grantCitizenship(g, dest)
  const lost: string[] = []
  let tax = 0
  let taxName = ''
  for (const id of renounce) {
    const t = exitTaxDue(g, 'renounce', id)
    if (!loseCitizenship(g, id)) continue
    lost.push(id)
    if (t.due > 0) {
      const paid = Math.min(t.due, Math.max(0, g.character.money))
      if (paid > 0) spend(g, paid)
      tax += paid
      taxName = t.name
    }
  }
  return { lost, tax, taxName }
}

/** Minor kids at home (and a long-married spouse living with you) naturalize with you. */
export function familyNaturalizes(g: GameState, dest: string): string[] {
  const lines: string[] = []
  const kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild') && p.age < 18 && p.livesWithPlayer)
  for (const k of kids) {
    const list = personCitizenships(g, k)
    if (!list.includes(dest)) stampPerson(k, [...list, dest])
  }
  if (kids.length) lines.push(kids.length === 1 ? `${kids[0].firstName} became a citizen with you.` : 'Your kids became citizens with you.')
  const sp = g.people.find((p) => p.alive && p.relation === 'spouse' && p.livesWithPlayer && !isAbroad(g, p))
  if (sp && sp.yearsKnown >= 3) {
    const list = personCitizenships(g, sp)
    if (!expandCitizenships(list, g.year).includes(dest)) {
      stampPerson(sp, [...list, dest])
      lines.push(`${sp.firstName} naturalized too.`)
    }
  }
  return lines
}

// ---------------------------------------------------------------------------
// Moving

export interface Arrival {
  status: ImmigrationStatus['status']
  visa?: string
  term?: number
  maxYears?: number | null
  program?: string
  sponsor?: SponsorJob
  keepJob?: boolean
  entry?: 'border' | 'overstay'
}

export type MoveHow = 'legal' | 'illegal' | 'deported' | 'asylum' | 'escape' | 'leave'

export interface MoveText {
  title: string
  opener: string
  extra?: string[]
  emoji?: string
}

/** Move the household to `dest` with this status (mutates). Returns the notice lines it showed. */
export function relocate(g: GameState, dest: string, how: MoveHow, arrival: Arrival, text: MoveText): void {
  const c = g.character
  const country = getCountry(dest)
  const oldId = c.countryId
  const oldName = place(getCountry(oldId))
  stampFamily(g)
  const fam = movingFamily(g)
  const lines: string[] = [...(text.extra ?? [])]

  // The taxman's goodbye (legal moves only: smugglers don't file returns).
  if (how === 'legal' || how === 'leave') {
    const t = exitTaxDue(g)
    if (t.due > 0) {
      const paid = Math.min(t.due, Math.max(0, c.money))
      if (paid > 0) {
        spend(g, paid)
        lines.push(`${capital(t.name)} took ${money(paid)} on your way out.`)
        log(g, `I paid ${money(paid)} in exit tax leaving ${oldName}.`, 'bad')
      }
    }
  }

  // The partner decides.
  let partnerCame = false
  if (fam.partner) {
    const p = fam.partner
    const fromThere = expandCitizenships(personCitizenships(g, p), g.year).includes(dest)
    const forced = how === 'deported' || how === 'escape' || how === 'asylum'
    const need = fromThere ? 20 : how === 'deported' ? 65 : forced ? 40 : 50
    if (p.relationship >= need) {
      partnerCame = true
      p.data.countryId = dest
      p.livesWithPlayer = true
      notePerson(p, `Moved to ${place(country)} with the player.`)
      lines.push(fromThere ? `${p.firstName} was thrilled to be going home.` : forced ? `${p.firstName} stuck by you and came along.` : `${p.firstName} happily packed up and came with you.`)
    } else if (forced) {
      p.data.countryId = oldId
      p.livesWithPlayer = false
      p.relationship = Math.max(0, p.relationship - 15)
      notePerson(p, `Stayed in ${oldName} when the player had to leave.`)
      lines.push(`${p.firstName} stayed behind in ${oldName}.`)
    } else {
      const wasSpouse = p.relation === 'spouse'
      p.relation = wasSpouse ? 'exSpouse' : 'ex'
      p.livesWithPlayer = false
      p.data.countryId = oldId
      if (wasSpouse) count(g, 'divorces')
      notePerson(p, `Refused to move to ${place(country)} and ended the relationship.`)
      log(g, `${p.firstName} refused to move to ${place(country)} with me, so we broke up.`, 'bad')
      addStat(g, 'happiness', -randInt(g, 5, 12))
      lines.push(`${p.firstName} refused to leave ${oldName} and ${wasSpouse ? 'filed for divorce' : 'broke up with you'}.`)
    }
  }
  const kids = fam.kids.filter((k) => partnerCame || !fam.partner || k.otherParentId !== fam.partner.id || k.livesWithPlayer)
  for (const k of kids) {
    k.data.countryId = dest
    k.livesWithPlayer = true
  }
  if (kids.length) lines.push(kids.length === 1 ? `${kids[0].firstName} came along.` : 'Your kids came along.')
  // Pets come along, except on the run and except the ones no customs officer will wave through.
  const pets = how === 'escape' || how === 'deported' ? [] : fam.pets.filter((p) => !isExoticPet(p))
  for (const pet of pets) pet.data.countryId = dest
  if (pets.length) lines.push(pets.length === 1 ? `${pets[0].firstName} the ${(pets[0].species ?? 'pet').toLowerCase()} came too.` : 'Your pets came too.')
  const banned = how === 'escape' || how === 'deported' ? [] : fam.pets.filter(isExoticPet)
  for (const pet of banned) notePerson(pet, `Stayed behind in ${oldName} when the player moved abroad.`)
  if (banned.length) lines.push(banned.length === 1 ? `Customs wouldn't let ${banned[0].firstName} the ${(banned[0].species ?? 'pet').toLowerCase()} into ${place(country)}, so ${banned[0].firstName} stayed behind in ${oldName}.` : `Customs wouldn't let your exotic pets into ${place(country)}, so they stayed behind in ${oldName}.`)

  // Everyone else stays where they are.
  const movers = new Set<string>([...kids.map((k) => k.id), ...pets.map((p) => p.id), ...(partnerCame && fam.partner ? [fam.partner.id] : [])])
  for (const p of g.people) {
    if (movers.has(p.id) || !p.alive) continue
    if (typeof p.data.countryId !== 'string') p.data.countryId = oldId
    if (p.data.countryId !== dest) p.livesWithPlayer = false
  }
  const stayed = g.people.filter((p) => p.alive && (p.relation === 'parent' || p.relation === 'sibling') && p.data.countryId === oldId)
  if (stayed.length && how !== 'deported') lines.push(`You said a tearful goodbye to your family in ${oldName}.`)
  const reunited = g.people.filter((p) => p.alive && (p.relation === 'parent' || p.relation === 'sibling' || p.relation === 'child') && p.data.countryId === dest && !movers.has(p.id))
  if (reunited.length) lines.push(reunited.length === 1 ? `${reunited[0].firstName} was waiting for you.` : 'Family was waiting for you.')

  // Jobs don't transfer (a remote job does).
  if (!arrival.keepJob) {
    const jobTitle = c.job && c.job.category !== 'special' ? c.job.title : c.job?.title
    if (c.job) endJob(g, 'job', 'quit')
    if (c.partTimeJob) endJob(g, 'partTimeJob', 'quit')
    if (jobTitle) lines.push(`You had to quit your job as ${/^[aeiou]/i.test(jobTitle) ? 'an' : 'a'} ${jobTitle}.`)
  } else if (c.job) {
    lines.push(`You kept your job as ${/^[aeiou]/i.test(c.job.title) ? 'an' : 'a'} ${c.job.title}, now from ${place(country)}.`)
  }

  c.countryId = dest
  c.city = randomCity(g, country)
  if (!(c.residence.status === 'partner' && partnerCame)) {
    const rent = niceRound(9000 * wealthOf(country))
    c.residence = { status: 'renting', rent, description: `Apartment in ${c.city}` }
  }

  // The new status.
  if (arrival.status === 'citizen') {
    if (!isCitizenOf(g, dest)) grantCitizenship(g, dest)
    setStatus(g, { status: 'citizen', since: g.year })
    if (g.flags.illegalImmigrant !== undefined) delete g.flags.illegalImmigrant
  } else {
    setStatus(g, { status: arrival.status, visa: arrival.visa, since: g.year, expires: arrival.term ? g.year + arrival.term : undefined })
  }
  updateImm(g, (s) => {
    s.arrived = g.year
    s.prSince = arrival.status === 'permanent' ? g.year : undefined
    s.visaSince = arrival.status === 'visa' || arrival.status === 'asylum' ? g.year : undefined
    s.program = arrival.program
    s.maxUntil = arrival.maxYears ? g.year + arrival.maxYears : undefined
    s.entry = arrival.status === 'undocumented' ? (arrival.entry ?? 'border') : undefined
    s.arrivalAge = c.age
    s.asylumDecide = undefined
    s.asylumOdds = undefined
    s.citizenAsk = undefined
    s.prDeferred = undefined
    s.degreesAtVisa = c.education.degrees.length
    s.apps = s.apps.filter((a) => a.dest !== dest)
  })

  // A sponsored job starts right away.
  if (arrival.sponsor) {
    const r = stableRng(g, `imm.sponsor.${dest}`)
    const company = companyName(g, arrival.sponsor.industry as Industry, r)
    hireForJob(g, { defId: arrival.sponsor.defId, title: arrival.sponsor.title, company, salary: arrival.sponsor.salary, category: 'fulltime' })
    lines.push(`Your sponsor, ${company}, put you straight to work as ${/^[aeiou]/i.test(arrival.sponsor.title) ? 'an' : 'a'} ${arrival.sponsor.title}.`)
  }

  count(g, 'emigrations')
  pushFlagString(g, 'countriesLived', country.name)
  const verb = how === 'illegal' ? 'Snuck' : how === 'deported' ? 'Was deported' : how === 'escape' ? 'Escaped' : how === 'asylum' ? 'Fled' : how === 'leave' ? 'Moved back' : 'Emigrated'
  remember(g, `${verb} from ${oldName} to ${place(country)} (${c.city}).`)
  const logLine =
    how === 'illegal'
      ? `I snuck into ${place(country)} and settled in ${c.city}.`
      : how === 'deported'
        ? `I was deported from ${oldName} to ${place(country)}.`
        : how === 'escape'
          ? `I escaped from ${oldName} to ${place(country)}.`
          : how === 'asylum'
            ? `I fled to ${place(country)} and claimed asylum.`
            : how === 'leave'
              ? `I left ${oldName} and moved to ${place(country)}.`
              : `I emigrated to ${place(country)} and settled in ${c.city}.`
  log(g, logLine, how === 'deported' ? 'bad' : 'event')
  if (how === 'deported') addStat(g, 'happiness', -randInt(g, 6, 14))
  else addStat(g, 'happiness', randInt(g, 3, 8))
  notice(g, text.title, [text.opener, ...lines].join('\n\n'), { emoji: text.emoji ?? country.flag, tone: how === 'deported' ? 'bad' : 'event' })
}

function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Where a deportee is sent: the birth country if it's still theirs, else another passport's country. */
export function homeCountryFor(g: GameState): string {
  const c = g.character
  const held = citizenshipsOf(g)
  if (c.birthCountryId && c.birthCountryId !== c.countryId && isCitizenOf(g, c.birthCountryId)) return c.birthCountryId
  return held.find((id) => id !== c.countryId) ?? expandCitizenships(held, g.year).find((id) => id !== c.countryId) ?? held[0]
}

/** Remove the character to their home country, with a re-entry ban (mutates). */
export function deport(g: GameState, reason: string, banYears: number): void {
  const c = g.character
  const from = c.countryId
  const home = homeCountryFor(g)
  if (!home || home === from) return
  updateImm(g, (s) => {
    s.bans[from] = g.year + Math.max(1, banYears) - 1
    s.deportAfterRelease = undefined
  })
  count(g, 'deportations')
  g.flags.deported = (typeof g.flags.deported === 'number' ? g.flags.deported : 0) + 1
  const country = getCountry(home)
  relocate(g, home, 'deported', { status: 'citizen' }, { title: 'Deported', opener: `${reason} You were put on a flight to ${place(country)}${banYears > 0 ? ` and banned from ${place(getCountry(from))} until ${g.year + banYears}` : ''}.`, emoji: '\u{1F6EC}' })
}

/** Go home of your own accord (mutates). Long overstays still earn a ban in some countries. */
export function leaveFor(g: GameState, dest: string, why: string, banYears = 0): void {
  const from = g.character.countryId
  if (banYears > 0) updateImm(g, (s) => (s.bans[from] = g.year + banYears - 1))
  const country = getCountry(dest)
  relocate(g, dest, 'leave', { status: isCitizenOf(g, dest) ? 'citizen' : 'permanent' }, { title: 'Moving On', opener: `${why} You packed up and moved to ${place(country)}.${banYears > 0 ? ` Overstaying earned you a ban from ${place(getCountry(from))} until ${g.year + banYears}.` : ''}`, emoji: '\u{1F9F3}' })
}

// ---------------------------------------------------------------------------
// Locked investments (golden visas): an Asset of kind 'other' so it counts toward net worth

export const LOCK_CATEGORY = 'immigration'

export function lockAssets(g: GameState): Asset[] {
  return g.assets.filter((a) => a.kind === 'other' && a.details.category === LOCK_CATEGORY)
}

export function createLock(g: GameState, opts: { program: string; name: string; emoji: string; kind: InvestKind; amount: number; years: number; country: string }): Asset {
  g.nextId += 1
  const a: Asset = {
    id: `imm${g.nextId}`,
    kind: 'other',
    name: opts.name,
    emoji: opts.emoji,
    purchasePrice: opts.amount,
    value: opts.amount,
    condition: 100,
    purchasedAge: g.character.age,
    upkeep: 0,
    details: {
      category: LOCK_CATEGORY,
      program: opts.program,
      investKind: opts.kind,
      country: opts.country,
      until: g.year + opts.years,
      start: g.year,
      holder: g.character.id,
      locked: true,
    },
  }
  g.assets.push(a)
  return a
}

/** A fixed nominal sum, valued in today's money a year later (interest-free loans and deposits). */
export function inflationErosion(year: number, share: number): number {
  const ratio = priceLevel(year - 1) / priceLevel(year)
  return Number.isFinite(ratio) && ratio > 0 ? Math.pow(ratio, share) : 1
}
