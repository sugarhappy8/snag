// Grown-up life events: found wallets, jury duty, neighbors, car trouble, traffic stops,
// scams, scratch-off tickets, strangers, landlords, audits, weddings and midlife crises.
//
// Also home to the local-color and pacing helpers shared by the grown-up event files
// (adult, family, friends, elder, work, sos, prison, custom, obituary): the scenes happen
// where the player actually lives (a braai in Johannesburg, Lebaran at the in-laws', a
// lay judge summons in Tokyo) and the same person or situation doesn't come back year
// after year.
import { addMoney, count, currentPartner, peopleBy } from '../core'
import { locale, localPick, localTerm, type LocaleToken } from '../data/locales'
import { createPerson } from '../people'
import { chance, pick, randInt } from '../rng'
import type { Asset, GameState, Json, Person } from '../types'
import { getCountry } from '../world'
import {
  anyOf,
  ask,
  ch,
  country,
  defineEvents,
  dollars,
  friends,
  hasCar,
  hasJob,
  livesWithParents,
  money,
  ownsHome,
  say,
  strangerName,
  type Ctx,
  type EventDef,
} from './helpers'

// ---------------------------------------------------------------------------
// Local color

/** The player lives in the United States (the library's original setting, kept as is). */
export function isUS(g: GameState): boolean {
  return g.character.countryId === 'us'
}

/** Most people here are Muslim: no booze-soaked or gambling scenes by default. */
export function muslimMajority(g: GameState, countryId = g.character.countryId): boolean {
  const r = getCountry(countryId).religions
  return r.length > 0 && r.filter((x) => x === 'Islam').length / r.length >= 0.65
}

/** A random local word ('food', 'hangout', 'getaway'...) or the fallback when the list is empty. */
export function lp(g: GameState, token: LocaleToken, fallback: string): string {
  return localPick(g, token) || fallback
}

/** A local term ('high school', 'the DMV', '911'...) or the fallback when it is blank. */
export function lt(g: GameState, term: Parameters<typeof localTerm>[1], fallback: string): string {
  return localTerm(g, term) || fallback
}

const NOT_A_FEAST = /Ramadan|Advent|Lent\b|Holy Week|Semana Santa|Golden Week|Tourism Week|Women's Day|Founding Day|Super Bowl/i

/**
 * The big family holiday here (Thanksgiving in the US, Lebaran in Indonesia, Diwali in India,
 * Eid al-Fitr in Saudi Arabia), skipping month-long observances.
 */
export function feastHoliday(g: GameState): string {
  const list = locale(g).holidays
  return list.find((h) => !NOT_A_FEAST.test(h)) ?? list[0] ?? 'New Year'
}

/** "secondary school" → "Secondary school". */
export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// ---------------------------------------------------------------------------
// Pacing: cross-event cooldowns (so the same person or situation doesn't come back year after
// year). Stamps are [generation, age] so a parent's "age 30" never blocks their child.

const COOLDOWN_FLAG = 'eventCooldowns'
type Stamp = [number, number]

function stamp(g: GameState): Stamp {
  return [g.generation, g.character.age]
}

function expired(g: GameState, v: Json | undefined, years: number): boolean {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number') return true
  if (v[0] !== g.generation) return true
  const age = g.character.age
  return v[1] > age || age - v[1] >= years
}

function cooldowns(g: GameState): { [key: string]: Json } {
  const raw = g.flags[COOLDOWN_FLAG]
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  const fresh: { [key: string]: Json } = {}
  g.flags[COOLDOWN_FLAG] = fresh
  return fresh
}

/** True when nothing in this group happened in the last `years` years. */
export function cooledDown(g: GameState, key: string, years: number): boolean {
  const raw = g.flags[COOLDOWN_FLAG]
  return !raw || typeof raw !== 'object' || Array.isArray(raw) || expired(g, raw[key], years)
}

export function markCooldown(g: GameState, key: string): void {
  cooldowns(g)[key] = stamp(g)
}

/** True when this person hasn't starred in this kind of scene in the last `years` years. */
export function personReady(g: GameState, p: Person, key: string, years: number): boolean {
  return expired(g, p.data?.[`cd.${key}`], years)
}

export function markPerson(g: GameState, p: Person, key: string): void {
  if (!p.data || typeof p.data !== 'object') p.data = {}
  p.data[`cd.${key}`] = stamp(g)
}

export interface Pace {
  /** A group of events that wait for each other: [key, years]. */
  group?: [string, number]
  /** Per-person cooldowns for the event's main person: [key, years][]. */
  person?: [string, number][]
}

/**
 * Wrap an event with cross-event cooldowns: it waits for its group, skips a main person who
 * starred in the same kind of scene recently, and stamps both once the player answers.
 */
export function paced(ev: EventDef, pace: Pace): EventDef {
  const { group, person = [] } = pace
  const when = ev.when
  const setup = ev.setup
  const resolve: EventDef['resolve'] = {}
  for (const [id, fn] of Object.entries(ev.resolve)) {
    resolve[id] = (g: GameState, x: Ctx) => {
      if (group) markCooldown(g, group[0])
      if (x.p) for (const [key] of person) markPerson(g, x.p, key)
      fn(g, x)
    }
  }
  return {
    ...ev,
    when: (g) => (!group || cooledDown(g, group[0], group[1])) && (!when || when(g)),
    setup: (g) => {
      const s = setup(g)
      if (s?.person && person.some(([key, years]) => !personReady(g, s.person!, key, years))) return null
      return s
    },
    resolve,
  }
}

/** A person who hasn't starred in this kind of scene lately (or undefined). */
export function freshOf(g: GameState, list: Person[], key: string, years: number): Person | undefined {
  return anyOf(g, list.filter((p) => personReady(g, p, key, years)))
}

/** A small amount scaled to the local economy ($20 in the US). */
export function cash(g: GameState, usd: number): number {
  return dollars(g, usd, usd)
}

function car(g: GameState): Asset | undefined {
  const cars = g.assets.filter((a) => a.kind === 'car')
  return cars.length ? pick(g, cars) : undefined
}

function carName(a: Asset | undefined): string {
  return a ? a.name : 'car'
}

const CAR_PROBLEMS = [
  'a bird flew into your fender and dented it',
  'someone slashed one of your tires',
  'you left your headlights on all night and drained the battery',
  'it has a bad spark plug',
  'the catalytic converter was stolen in the night',
  'the timing belt snapped',
  'a rock cracked the windshield on the highway',
  'the fuel pump died',
  'the power steering pump is failing',
  'the engine is making a noise like a dying walrus',
]

const STRANGERS = ['a hipster', 'a tourist', 'a jogger', 'a businessman', 'a skateboarder', 'a little old lady', 'a cyclist', 'a street magician', 'a construction worker', 'a mime', 'a tech bro']
const US_STRANGERS = ['a mall cop', 'a college kid']
const WORLD_STRANGERS = ['a university student', 'a street vendor', 'a parking attendant']

/** A random stranger on the street ("a mall cop" only in the US). */
function stranger(g: GameState): string {
  return pick(g, [...STRANGERS, ...(isUS(g) ? US_STRANGERS : WORLD_STRANGERS)])
}

const INSULTS = ['a dork', 'a nincompoop', 'a walking participation trophy', 'a potato', 'a clown', 'a goblin', 'a buffoon', 'a dingus', 'a waste of oxygen', 'a soggy waffle']

function crimesWitnessed(g: GameState) {
  return [
    { act: 'littering a whole bag of fast food wrappers', crime: 'littering' },
    { act: 'shoplifting a stack of video games', crime: 'shoplifting' },
    { act: `spray painting a mural of themselves on ${isUS(g) ? 'a church' : 'the town hall'}`, crime: 'vandalism' },
    { act: 'keying a parked car', crime: 'vandalism' },
    { act: 'pickpocketing a tourist', crime: 'pickpocketing' },
    { act: 'stealing a package off a porch', crime: 'theft' },
    { act: 'kicking a vending machine until it paid out', crime: 'vandalism' },
  ]
}

const JURY_CRIMES = ['tax fraud', 'burglary', 'stealing 400 garden gnomes', 'arson', 'running an illegal pet casino', 'identity theft', 'assault with a deadly baguette']

/** Countries that put ordinary citizens on juries. */
const JURY_COUNTRIES = new Set(['us', 'ca', 'gb', 'ie', 'au', 'nz', 'jm', 'bs', 'bz', 'gy', 'pr', 'fr', 'be', 'at', 'es', 'br', 'ru', 'dk', 'ar'])
/** Countries where citizens sit next to professional judges as lay judges instead. */
const LAY_JUDGE_COUNTRIES = new Set(['de', 'se', 'fi', 'no', 'it', 'jp', 'kr', 'pl', 'cz', 'hr'])

/** What a night-time intruder turns out to be, by country. */
function nightCritter(g: GameState): { what: string; emoji: string } {
  const id = g.character.countryId
  if (['us', 'ca', 'de', 'jp'].includes(id)) return { what: 'a raccoon', emoji: '🦝' }
  if (['au', 'nz'].includes(id)) return { what: 'a possum', emoji: '🐀' }
  if (['gb', 'ie', 'nl', 'be', 'dk', 'se', 'no', 'fi'].includes(id)) return { what: 'a fox', emoji: '🦊' }
  if (['in', 'id', 'th', 'my', 'lk', 'np', 'bd', 'ke', 'ug', 'za', 'zw', 'gh'].includes(id)) return { what: 'a monkey', emoji: '🐒' }
  return pick(g, [
    { what: 'a stray cat', emoji: '🐈' },
    { what: 'a very large rat', emoji: '🐀' },
  ])
}

/** What you grab to investigate a noise downstairs. */
function homeWeapon(g: GameState): string {
  const sports = locale(g).sports.join(' ').toLowerCase()
  if (isUS(g) || sports.includes('baseball')) return 'a baseball bat'
  if (sports.includes('cricket')) return 'a cricket bat'
  if (sports.includes('hockey')) return 'a hockey stick'
  return pick(g, ['a broom', 'a frying pan', 'an umbrella'])
}

/** The neighborhood get-together: a backyard barbecue in the US, an asado, a braai, a feast... */
function neighborParty(g: GameState): { invite: string; event: string; cooking: string; food: string; dish: string; emoji: string } {
  if (isUS(g)) return { invite: 'Your neighbors invited you to their backyard barbecue. What will you do?', event: 'barbecue', cooking: 'grilling', food: 'burgers', dish: 'potato salad', emoji: '🍖' }
  const grills: Record<string, [string, string]> = { ar: ['asado', 'the asado'], uy: ['asado', 'the asado'], py: ['asado', 'the asado'], cl: ['asado', 'the asado'], br: ['churrasco', 'the picanha'], za: ['braai', 'the boerewors'], zw: ['braai', 'the boerewors'], au: ['barbie', 'the snags'], nz: ['barbecue', 'the sausages'], ke: ['nyama choma', 'the goat'], kr: ['barbecue', 'the samgyeopsal'] }
  const dish = lp(g, 'food', 'a home-cooked dish')
  const grill = grills[g.character.countryId]
  if (grill) return { invite: `Your neighbors invited you to their backyard ${grill[0]}. What will you do?`, event: grill[0], cooking: 'grilling', food: grill[1].replace(/^the /, ''), dish, emoji: '🍖' }
  const holiday = feastHoliday(g).replace(/^the /i, '')
  return { invite: `Your neighbors invited you over for a big ${holiday} feast. What will you do?`, event: `${holiday} feast`, cooking: 'cooking', food: lp(g, 'food', 'stew'), dish, emoji: '🍲' }
}

/** How phone scammers want to be paid here. */
function scamPayment(g: GameState): { pay: string; unit: string } {
  const id = g.character.countryId
  if (['us', 'ca', 'gb', 'ie', 'au', 'nz', 'pr'].includes(id)) return { pay: 'in gift cards', unit: 'gift cards' }
  if (['ke', 'ug', 'zw', 'cd', 'ng', 'et'].includes(id)) return { pay: 'by mobile money', unit: 'mobile money transfers' }
  return { pay: 'in Bitcoin', unit: 'Bitcoin' }
}

export const ADULT_EVENTS = defineEvents([
  {
    id: 'adult.foundWallet',
    emoji: '👛',
    title: 'Lost and Found',
    minAge: 8,
    maxAge: 95,
    setup: (g) => {
      const cash = dollars(g, 20, g.character.age < 16 ? 80 : 400)
      const s = strangerName(g)
      return {
        text: `You found a wallet on the sidewalk with ${money(cash)} in cash inside. The ID says it belongs to ${s.first} ${s.last}. What will you do?`,
        choices: [ch('return', 'Return it intact'), ch('cash', 'Keep the cash, return the wallet'), ch('keep', 'Keep everything'), ch('leave', 'Leave it there')],
        data: { cash, first: s.first, last: s.last },
      }
    },
    resolve: {
      return: (g, x) => {
        const reward = chance(g, 0.45) ? Math.round(x.n('cash') * 0.2) + 10 : 0
        say(g, x, ['Good Samaritan', 'Faith in humanity'], reward ? `You returned the wallet to ${x.s('first')}, who was so grateful they gave you a ${money(reward)} reward!` : `You returned the wallet to ${x.s('first')}. They hugged you and cried a little.`, `I returned a lost wallet to its owner, ${x.s('first')} ${x.s('last')}.`, { karma: 12, happiness: 6, money: reward }, 'good', '😇')
      },
      cash: (g, x) => say(g, x, 'Finder\'s fee', `You pocketed the ${money(x.n('cash'))} and mailed the empty wallet back. ${x.s('first')} will never know. Probably.`, `I kept ${money(x.n('cash'))} from a wallet I found and returned the rest.`, { money: x.n('cash'), karma: -8 }, 'neutral', '💵'),
      keep: (g, x) => {
        const caught = g.character.age >= 16 && chance(g, 0.08)
        if (caught) say(g, x, 'Caught on camera', `A security camera caught you taking the wallet. ${x.s('first')} pressed charges.`, `I kept a wallet I found and got caught.`, { karma: -15, count: 'crimes', arrest: { crime: 'Theft', severity: 1 } }, 'bad', '🚓')
        else say(g, x, 'Finders keepers', `You kept the whole thing, including ${money(x.n('cash'))} and a punch card that's one coffee away from a free one.`, `I kept a wallet I found on the sidewalk.`, { money: x.n('cash'), karma: -15 }, 'neutral', '💰')
      },
      leave: (g) => say(g, null, 'Not my problem', 'You left it where it was. Someone else will deal with it.', 'I walked past a lost wallet on the sidewalk.', { karma: -2 }),
    },
  },
  {
    id: 'adult.lostCash',
    emoji: '💸',
    title: 'Sidewalk Cash',
    minAge: 6,
    maxAge: 95,
    setup: (g) => {
      const amt = cash(g, pick(g, [5, 10, 20, 50, 100]))
      return {
        text: `You spot a ${money(amt)} bill blowing down the sidewalk. A ${stranger(g).replace(/^an? /, '')} is eyeing it too. What will you do?`,
        choices: [ch('dive', 'Dive for it'), ch('owner', 'Look for the owner'), ch('leave', 'Let them have it')],
        data: { amt },
      }
    },
    resolve: {
      dive: (g, x) => {
        const won = chance(g, 0.55)
        say(g, x, won ? 'Mine!' : 'Too slow', won ? `You dove and snatched the ${money(x.n('amt'))} bill. You scraped your elbow, but you're richer.` : `You dove for it and missed. The stranger walked away waving your ${money(x.n('amt'))}.`, won ? `I snatched a ${money(x.n('amt'))} bill off the sidewalk.` : `I saw ${money(x.n('amt'))} on the sidewalk, but someone picked it up before me.`, won ? { money: x.n('amt'), health: -1, happiness: 4 } : { happiness: -4, health: -1 }, won ? 'good' : 'bad')
      },
      owner: (g, x) => {
        const found = chance(g, 0.4)
        say(g, x, found ? 'Honest' : 'Unclaimed', found ? 'You found the owner, who thanked you profusely.' : `Nobody claimed it, so you kept the ${money(x.n('amt'))} with a clear conscience.`, found ? 'I returned some cash I found to its owner.' : `I found ${money(x.n('amt'))} and nobody claimed it.`, found ? { karma: 6, happiness: 2 } : { money: x.n('amt'), karma: 2, happiness: 4 }, 'good')
      },
      leave: (g) => say(g, null, 'Generous', 'You let the stranger have it. They looked very confused.', 'I let a stranger take some money blowing down the street.', { karma: 2 }),
    },
  },
  {
    id: 'adult.juryDuty',
    emoji: '⚖️',
    title: 'Jury Duty',
    minAge: 18,
    maxAge: 75,
    cooldown: 15,
    // Only where ordinary citizens sit in judgment: juries (US, UK, France, Brazil...) or
    // lay judges (Germany, Japan, Sweden...). Elsewhere judges decide alone.
    when: (g) => JURY_COUNTRIES.has(g.character.countryId) || LAY_JUDGE_COUNTRIES.has(g.character.countryId),
    setup: (g) => {
      const days = randInt(g, 3, 14)
      const lay = LAY_JUDGE_COUNTRIES.has(g.character.countryId)
      return {
        title: lay ? 'Lay Judge' : 'Jury Duty',
        text: lay
          ? `You've been picked by lottery to serve as a lay judge, deciding a criminal case alongside the professional judges. The trial is expected to last ${days} days. What will you do?`
          : `You've been summoned for jury duty. The trial is expected to last ${days} days. What will you do?`,
        choices: [ch('serve', 'Serve my civic duty'), ch('excuse', 'Try to get out of it'), ch('ignore', 'Ignore the summons')],
        data: { days, lay: lay ? 1 : 0 },
      }
    },
    resolve: {
      serve: (g, x) => {
        const s = strangerName(g)
        const crime = pick(g, [...JURY_CRIMES, isUS(g) ? 'grand theft auto' : 'car theft'])
        const strong = chance(g, 0.6)
        const lay = x.n('lay') === 1
        ask(g, x, {
          title: 'The Verdict',
          text: `The defendant, ${s.first} ${s.last}, is accused of ${crime}. The evidence seems ${strong ? 'pretty damning' : 'flimsy at best'}. ${lay ? 'The judges turn to you for your vote.' : 'The jury is deliberating.'} How do you vote?`,
          choices: [ch('guilty', 'Guilty'), ch('innocent', 'Not guilty'), ch('holdout', lay ? 'Argue with the judges for three days' : 'Hold out for a mistrial')],
          data: { first: s.first, last: s.last, crime, strong: strong ? 1 : 0 },
        })
      },
      excuse: (g, x) => {
        const ok = chance(g, 0.6)
        const duty = x.n('lay') === 1 ? 'lay judge duty' : 'jury duty'
        say(g, x, ok ? 'Dismissed' : 'Selected anyway', ok ? 'You told the judge you can tell guilt by looking at people\'s eyebrows. You were dismissed immediately.' : 'You tried every excuse in the book. You were selected anyway and spent the trial sulking.', ok ? `I got out of ${duty}.` : `I served ${x.n('days')} days of ${duty} against my will.`, ok ? { happiness: 2, smarts: 2 } : { happiness: -6 })
      },
      ignore: (g, x) => {
        const fine = dollars(g, 200, 800)
        say(g, x, 'Contempt of court', `You ignored the summons. The court fined you ${money(fine)}.`, `I ignored a ${x.n('lay') === 1 ? 'lay judge' : 'jury'} summons and was fined ${money(fine)}.`, { money: -fine, karma: -4 }, 'bad', '🧾')
      },
      guilty: (g, x) => {
        const right = x.n('strong') === 1
        const lay = x.n('lay') === 1
        say(g, x, 'Justice?', `The ${lay ? 'court' : 'jury'} found ${x.s('first')} ${x.s('last')} guilty of ${x.s('crime')}. ${right ? 'You feel confident justice was served.' : 'You lay awake wondering if you got it wrong.'}`, `I served on a ${lay ? 'panel of judges' : 'jury'} that convicted ${x.s('first')} ${x.s('last')} of ${x.s('crime')}.`, { karma: right ? 4 : -6, smarts: 4, memory: `Served as a ${lay ? 'lay judge' : 'juror'} in a ${x.s('crime')} trial.` }, right ? 'good' : 'neutral', '🔨')
      },
      innocent: (g, x) => {
        const right = x.n('strong') === 0
        const lay = x.n('lay') === 1
        say(g, x, 'Acquitted', `The ${lay ? 'court' : 'jury'} acquitted ${x.s('first')} ${x.s('last')}. ${right ? 'They hugged their family on the courthouse steps.' : 'They winked at you on their way out. Hmm.'}`, `I served on a ${lay ? 'panel of judges' : 'jury'} that acquitted ${x.s('first')} ${x.s('last')}.`, { karma: right ? 6 : -4, smarts: 4 }, right ? 'good' : 'neutral', '🔨')
      },
      holdout: (g, x) => {
        if (x.n('lay') === 1) return say(g, x, 'Dissenting opinion', 'You argued with the professional judges for three days straight. They outvoted you, thanked you through gritted teeth and never want to see you again.', `I argued with the judges for three days in a ${x.s('crime')} trial.`, { happiness: -2, craziness: 3, smarts: 2 })
        say(g, x, 'Twelve Angry Jurors', 'You refused to budge for three days. The judge declared a mistrial and the other jurors refuse to make eye contact with you.', `I caused a mistrial in a ${x.s('crime')} trial by holding out.`, { happiness: -2, craziness: 3, smarts: 2 })
      },
    },
  },
  {
    id: 'adult.neighborNoise',
    emoji: '🔊',
    title: 'Noisy Neighbors',
    minAge: 18,
    maxAge: 95,
    when: (g) => !livesWithParents(g) && g.character.residence.status !== 'homeless',
    setup: (g) => {
      const noise = pick(g, ['blasting polka music at 2 AM', 'hosting a drum circle every night', 'letting their dog bark for hours', 'doing karaoke until sunrise', 'running a leaf blower at 6 AM'])
      return {
        text: `Your neighbors have been ${noise}. What will you do?`,
        choices: [ch('ask', 'Ask them nicely to stop'), ch('police', 'File a noise complaint'), ch('revenge', 'Blast my own music back'), ch('earplugs', 'Buy earplugs')],
        data: { noise },
      }
    },
    resolve: {
      ask: (g, x) => {
        const ok = chance(g, 0.6)
        if (ok && chance(g, 0.4)) {
          const s = strangerName(g)
          createPerson(g, { relation: 'friend', age: g.character.age + randInt(g, -10, 10), firstName: s.first, lastName: s.last, gender: s.gender, relationship: 55 })
          say(g, x, 'Neighborly', `You knocked and asked nicely. Your neighbor ${s.first} apologized, invited you in, and now you're friends!`, `I asked my neighbor to keep it down and we became friends.`, { happiness: 6, karma: 2 }, 'good')
        } else {
          say(g, x, ok ? 'Peace and quiet' : 'Slammed door', ok ? 'They apologized and turned it down. Sweet silence.' : 'They slammed the door in your face and turned it UP.', 'I asked my neighbors to keep the noise down.', ok ? { happiness: 4 } : { happiness: -6 }, ok ? 'good' : 'bad')
        }
      },
      police: (g) => say(g, null, 'Complaint filed', 'The police paid them a visit. It worked, but they glare at you every morning now.', 'I filed a noise complaint against my neighbors.', { happiness: 2 }),
      revenge: (g) => say(g, null, 'Sound war', 'You aimed your speakers at their wall and played the same song on repeat for six hours. Nobody won.', 'I started a noise war with my neighbors.', { happiness: 2, craziness: 3, karma: -2 }),
      earplugs: (g) => say(g, null, 'Zen', 'You bought industrial earplugs. You now sleep like a baby and miss every alarm.', 'I bought earplugs to deal with my noisy neighbors.', { happiness: 2, money: -Math.min(Math.max(0, g.character.money), 15) }),
    },
  },
  {
    id: 'adult.neighborTree',
    emoji: '🌳',
    title: 'Property Dispute',
    minAge: 21,
    maxAge: 99,
    when: ownsHome,
    setup: (g) => {
      const cost = dollars(g, 400, 3000)
      return {
        text: `A huge branch from your neighbor's tree crashed through your fence. Repairs will cost ${money(cost)}. What will you do?`,
        choices: [ch('ask', 'Ask them to pay'), ch('sue', 'Sue them'), ch('pay', 'Pay for it myself'), ch('ignore', 'Leave the hole')],
        data: { cost },
      }
    },
    resolve: {
      ask: (g, x) => {
        const ok = chance(g, 0.55)
        say(g, x, ok ? 'Good neighbors' : 'Bad neighbors', ok ? 'Your neighbor apologized and paid for the whole repair.' : 'Your neighbor said "trees are acts of God" and shut the door.', ok ? 'My neighbor paid to fix my fence after their tree fell on it.' : 'My neighbor refused to pay for my broken fence.', ok ? { happiness: 4 } : { happiness: -6 }, ok ? 'good' : 'bad')
      },
      sue: (g, x) => {
        const won = chance(g, 0.5)
        const cost = x.n('cost')
        if (won) say(g, x, 'Case closed', `You sued and won ${money(cost * 2)} in damages!`, `I sued my neighbor over a fallen tree and won.`, { money: cost, happiness: 6, count: 'lawsuitsWon' }, 'good', '⚖️')
        else say(g, x, 'Case dismissed', 'You sued and lost. Now you have a broken fence, legal fees and a neighbor who hates you.', 'I sued my neighbor over a fallen tree and lost.', { money: -Math.round(cost / 2), happiness: -8 }, 'bad', '⚖️')
      },
      pay: (g, x) => {
        const cost = x.n('cost')
        if (g.character.money < cost) say(g, x, "Can't afford it", "You don't have the money to fix the fence right now. The hole stays.", "I couldn't afford to fix my fence.", { happiness: -4 }, 'bad')
        else say(g, x, 'Fixed', `You paid ${money(cost)} and fixed the fence yourself.`, `I paid ${money(cost)} to fix my fence.`, { money: -cost })
      },
      ignore: (g) => say(g, null, 'Rustic charm', "You left the hole. The neighbor's dog now visits daily.", 'I left a hole in my fence.', { happiness: -2 }),
    },
  },
  {
    id: 'adult.neighborBbq',
    emoji: '🍖',
    title: 'Block Party',
    minAge: 18,
    maxAge: 95,
    when: (g) => !livesWithParents(g),
    setup: (g) => {
      const party = neighborParty(g)
      return {
        emoji: party.emoji,
        text: party.invite,
        choices: [ch('dish', 'Go and bring a dish'), ch('critique', `Go and critique their ${party.cooking}`), ch('no', 'Politely decline')],
        data: { ...party },
      }
    },
    resolve: {
      dish: (g, x) => {
        const s = strangerName(g)
        const friend = chance(g, 0.4)
        if (friend) createPerson(g, { relation: 'friend', age: g.character.age + randInt(g, -10, 10), firstName: s.first, lastName: s.last, gender: s.gender, relationship: 60 })
        const dish = x.s('dish')
        say(g, null, 'Neighborly', friend ? `You brought ${dish} and hit it off with a neighbor named ${s.first}. New friend!` : `You brought ${dish}. It was a hit. The neighbors love you.`, friend ? `I went to a neighborhood ${x.s('event')} and befriended ${s.first}.` : `I went to a neighborhood ${x.s('event')}.`, { happiness: 8 }, 'good')
      },
      critique: (g, x) => say(g, null, isUS(g) ? 'Grill sergeant' : 'Food critic', `You told the host their ${x.s('food')} ${x.s('food').endsWith('s') ? 'were' : 'was'} overcooked. You have not been invited back.`, `I critiqued my neighbor's ${x.s('cooking')} at their ${x.s('event')}.`, { happiness: 2, karma: -2 }),
      no: (g, x) => say(g, null, 'Hermit', `You stayed home and smelled the ${isUS(g) ? 'barbecue' : x.s('food')} through the window.`, `I declined a ${x.s('event')} invitation from my neighbors.`, {}),
    },
  },
  {
    id: 'adult.carTrouble',
    emoji: '🚘',
    title: 'Car Trouble',
    minAge: 16,
    maxAge: 99,
    when: hasCar,
    setup: (g) => {
      const a = car(g)
      if (!a) return null
      const problem = pick(g, CAR_PROBLEMS)
      const cost = Math.max(80, Math.round(Math.min(Math.max(a.value * 0.08, 150), 2500)))
      return {
        text: `Bad news: ${problem}. The mechanic says fixing your ${carName(a)} will cost ${money(cost)}. What will you do?`,
        choices: [ch('repair', 'Repair it'), ch('later', 'I might fix it later'), ch('diy', 'Fix it myself')],
        data: { assetId: a.id, cost, car: carName(a) },
      }
    },
    resolve: {
      repair: (g, x) => {
        const cost = x.n('cost')
        const a = g.assets.find((v) => v.id === x.s('assetId'))
        if (g.character.money < cost) {
          say(g, x, 'Out of order', "You can't afford the repair right now. Better learn the bus routes.", `I couldn't afford to repair my ${x.s('car')}.`, { happiness: -6 }, 'bad')
          if (a) a.condition = Math.max(0, a.condition - 10)
          return
        }
        if (a) a.condition = Math.min(100, a.condition + 15)
        say(g, x, ['Mmm, that repaired car smell', 'Back on the road'], `You paid ${money(cost)} and your ${x.s('car')} is back in service.`, `I repaired my ${x.s('car')} for ${money(cost)}.`, { money: -cost })
      },
      later: (g, x) => {
        const a = g.assets.find((v) => v.id === x.s('assetId'))
        if (a) a.condition = Math.max(0, a.condition - 15)
        say(g, x, ['Parked until further notice', 'Gotta get a ride'], `Your ${x.s('car')} is out of commission until you fix it.`, `I decided not to repair my ${x.s('car')}.`, { happiness: -4 })
      },
      diy: (g, x) => {
        const a = g.assets.find((v) => v.id === x.s('assetId'))
        const ok = chance(g, 0.3 + g.character.stats.smarts / 300)
        if (a) a.condition = ok ? Math.min(100, a.condition + 10) : Math.max(0, a.condition - 20)
        say(g, x, ok ? 'Grease monkey' : 'Made it worse', ok ? `You watched three online tutorials and fixed it yourself for the price of a wrench!` : `You took the engine apart and now have six extra parts and no idea where they go.`, ok ? `I fixed my ${x.s('car')} myself.` : `I tried to fix my ${x.s('car')} myself and made it worse.`, ok ? { money: -Math.min(Math.max(0, g.character.money), 30), smarts: 4, happiness: 6 } : { money: -Math.min(Math.max(0, g.character.money), 30), happiness: -6 }, ok ? 'good' : 'bad', '🔧')
      },
    },
  },
  {
    id: 'adult.parkingTicket',
    emoji: '🎫',
    title: 'Parking Ticket',
    minAge: 16,
    maxAge: 99,
    when: hasCar,
    setup: (g) => {
      const fine = dollars(g, 40, 150)
      return {
        text: `You came back to your car to find a ${money(fine)} parking ticket under the windshield wiper. What will you do?`,
        choices: [ch('pay', 'Pay it'), ch('contest', 'Contest it in court'), ch('ignore', 'Ignore it')],
        data: { fine },
      }
    },
    resolve: {
      pay: (g, x) => say(g, x, 'Paid', `You paid the ${money(x.n('fine'))} fine. Annoying, but done.`, `I paid a ${money(x.n('fine'))} parking ticket.`, { money: -x.n('fine'), happiness: -2 }),
      contest: (g, x) => {
        const won = chance(g, 0.35 + g.character.stats.smarts / 400)
        say(g, x, won ? 'Dismissed!' : 'Upheld', won ? 'You argued the sign was hidden behind a tree. The judge agreed. Ticket dismissed!' : 'The judge was not moved by your PowerPoint presentation. Pay up, plus court fees.', won ? 'I contested a parking ticket and won.' : 'I contested a parking ticket and lost.', won ? { happiness: 8, smarts: 2 } : { money: -Math.round(x.n('fine') * 1.5), happiness: -6 }, won ? 'good' : 'bad', '⚖️')
      },
      ignore: (g, x) => {
        const later = chance(g, 0.6)
        say(g, x, later ? 'Late fees' : 'Lost in the system', later ? `The ticket doubled with late fees. You paid ${money(x.n('fine') * 2)}.` : 'Somehow the ticket vanished from the system. Lucky.', later ? 'I ignored a parking ticket and it doubled.' : 'I ignored a parking ticket and nothing happened.', later ? { money: -x.n('fine') * 2, happiness: -6 } : { happiness: 2 }, later ? 'bad' : 'neutral')
      },
    },
  },
  {
    id: 'adult.trafficStop',
    emoji: '🚔',
    title: 'Pulled Over',
    minAge: 16,
    maxAge: 95,
    when: (g) => hasCar(g) && g.character.licenses.includes('driver'),
    setup: (g) => {
      const speed = randInt(g, 12, 35)
      return {
        text: `Red and blue lights flash in your mirror. You were going ${speed} over the speed limit. What will you do?`,
        choices: [ch('polite', 'Pull over and be polite'), ch('argue', 'Argue with the officer'), ch('cry', 'Cry'), ch('flee', 'Floor it')],
        data: { speed },
      }
    },
    resolve: {
      polite: (g, x) => {
        const warn = chance(g, 0.45)
        const fine = dollars(g, 100, 300)
        say(g, x, warn ? 'Let off with a warning' : 'Ticketed', warn ? 'You were polite and apologetic. The officer let you off with a warning!' : `You were polite, but the officer still wrote you a ${money(fine)} ticket.`, warn ? 'I got pulled over for speeding and was let off with a warning.' : `I got a ${money(fine)} speeding ticket.`, warn ? { happiness: 4 } : { money: -fine, happiness: -4 }, warn ? 'good' : 'neutral')
      },
      argue: (g, x) => {
        const fine = dollars(g, 200, 450)
        say(g, x, 'Bad idea', `You argued that the speed limit is "more of a suggestion." The officer wrote you a ${money(fine)} ticket and added a few extra violations.`, `I argued with a police officer and got a ${money(fine)} ticket.`, { money: -fine, happiness: -6 }, 'bad')
      },
      cry: (g) => {
        const works = chance(g, 0.5)
        say(g, null, works ? 'Waterworks' : 'Unmoved', works ? 'You burst into tears. The flustered officer let you go with a warning and a tissue.' : 'You sobbed. The officer handed you a tissue and a ticket.', 'I cried when I got pulled over.', works ? { happiness: 2 } : { money: -dollars(g, 100, 250), happiness: -4 })
      },
      flee: (g, x) => {
        const escaped = chance(g, 0.3)
        if (escaped) say(g, x, ['Getaway driver', 'Fast and Furious'], 'You floored it and lost them in a maze of side streets. Your heart is still pounding.', 'I fled from the police during a traffic stop and got away.', { happiness: 6, karma: -10, notoriety: 4, count: 'crimes' }, 'neutral', '💨')
        else say(g, x, 'Spike strips', 'You floored it, ran over spike strips and were surrounded by six squad cars.', 'I fled from the police during a traffic stop and got caught.', { karma: -10, count: 'crimes', arrest: { crime: 'Evading Police', severity: 2 } }, 'bad', '🚓')
      },
    },
  },
  {
    id: 'adult.phoneScam',
    emoji: '📞',
    title: 'Urgent Call',
    minAge: 22,
    maxAge: 99,
    setup: (g) => {
      const amt = dollars(g, 900, 5000)
      const { pay, unit } = scamPayment(g)
      return {
        text: `A caller claiming to be from the national tax agency says you owe ${money(amt)} in back taxes and will be arrested within the hour unless you pay right now... ${pay}. What will you do?`,
        choices: [ch('pay', 'Pay them'), ch('hang', 'Hang up'), ch('waste', 'Waste their time'), ch('report', 'Report them to the police')],
        data: { amt, unit },
      }
    },
    resolve: {
      pay: (g, x) => {
        const lost = Math.min(Math.max(0, g.character.money), x.n('amt'))
        const unit = x.s('unit') || 'gift cards'
        const giftCards = unit === 'gift cards'
        say(g, x, ['Scammed!', giftCards ? 'Gift card fiasco' : 'Transfer fiasco'], lost > 0 ? (giftCards ? `You bought ${money(lost)} in gift cards and read the numbers over the phone. The "tax agency" hung up. It was a scam.` : `You sent ${money(lost)} in ${unit}. The "tax agency" hung up. It was a scam.`) : `You didn't have enough money for the ${unit}. The scammer called you broke and hung up.`, lost > 0 ? `I lost ${money(lost)} to a phone scammer posing as the tax agency.` : 'A phone scammer tried to get money from me, but I was too broke.', { money: -lost, happiness: lost > 0 ? -16 : -2, smarts: -4 }, 'bad', '😱')
      },
      hang: (g, x) => say(g, null, 'Nice try', `You hung up. The tax agency does not take ${x.s('unit') || 'gift cards'}.`, 'I hung up on a phone scammer.', { smarts: 2 }, 'good'),
      waste: (g, x) => say(g, null, ['Scam the scammer', 'Hero of the people'], (x.s('unit') || 'gift cards') === 'gift cards' ? 'You kept them on the line for 47 minutes, pretending your gift card was "in the other pants." They eventually cried.' : 'You kept them on the line for 47 minutes, pretending your banking app was "still loading." They eventually cried.', 'I wasted a phone scammer\'s time for almost an hour.', { happiness: 10, smarts: 2 }, 'good', '😈'),
      report: (g) => say(g, null, 'Reported', 'You reported the number to the police. They said there are thousands of these, but thanked you.', 'I reported a phone scam to the police.', { karma: 4 }, 'good'),
    },
  },
  {
    id: 'adult.emailScam',
    emoji: '📧',
    title: 'Royal Inheritance',
    minAge: 18,
    maxAge: 99,
    setup: (g) => ({
      text: `An email from "${g.character.countryId === 'ng' ? 'Baron Heinrich von Goldbach of the Royal Swiss Treasury' : 'Prince Adewale of the Royal Treasury'}" says he needs to transfer $25 million into your bank account and will give you 20% for your trouble. He just needs your account details first. What will you do?`,
      choices: [ch('send', 'Send my bank details'), ch('delete', 'Delete it'), ch('troll', 'Reply with a meme')],
    }),
    resolve: {
      send: (g) => {
        const lost = Math.min(Math.max(0, g.character.money), dollars(g, 500, 8000))
        say(g, null, 'Royally scammed', lost > 0 ? `Your bank account was emptied of ${money(lost)} by the next morning. The prince has stopped replying.` : 'They tried to drain your account and found nothing in it. The prince unsubscribed from you.', lost > 0 ? `I lost ${money(lost)} to an email scam.` : 'I fell for an email scam, but I had nothing to steal.', { money: -lost, smarts: -6, happiness: lost > 0 ? -16 : -2 }, 'bad', '😱')
      },
      delete: (g) => say(g, null, 'Spam filter', 'You deleted it. Your 20% of $25 million will have to wait.', 'I deleted an obvious email scam.', { smarts: 2 }, 'good'),
      troll: (g) => say(g, null, 'Lol', "You replied with a picture of a dog in sunglasses. The prince never wrote back.", 'I trolled an email scammer.', { happiness: 4 }),
    },
  },
  {
    id: 'adult.scratchTicket',
    emoji: '🎟️',
    title: 'Feeling Lucky?',
    minAge: 18,
    maxAge: 99,
    // Gambling is banned or frowned upon in most Muslim-majority countries.
    when: (g) => !muslimMajority(g),
    setup: (g) => {
      const price = cash(g, 5)
      return {
        text: `The gas station clerk insists today is your lucky day and tries to sell you scratch-off tickets at ${money(price)} each. What will you do?`,
        choices: [ch('one', `Buy one (${money(price)})`), ch('ten', `Buy ten (${money(price * 10)})`), ch('no', 'No thanks')],
        data: { price },
      }
    },
    resolve: {
      one: (g, x) => scratch(g, x, 1),
      ten: (g, x) => scratch(g, x, 10),
      no: (g) => say(g, null, 'Smart money', 'You passed. The odds were never in your favor.', null, {}),
    },
  },
  {
    id: 'adult.strandedDriver',
    emoji: '🛞',
    title: 'Roadside',
    minAge: 18,
    maxAge: 85,
    setup: (g) => {
      const s = strangerName(g)
      return {
        text: `A ${s.gender === 'male' ? 'man' : 'woman'} named ${s.first} is stranded on the side of the road with a flat tire and no spare. What will you do?`,
        choices: [ch('help', 'Help them out'), ch('ride', 'Offer them a ride'), ch('tow', 'Call a tow truck for them'), ch('drive', 'Keep driving')],
        data: { first: s.first, last: s.last, gender: s.gender },
      }
    },
    resolve: {
      help: (g, x) => {
        const reward = chance(g, 0.3) ? cash(g, 50) : 0
        say(g, x, 'Roadside hero', reward ? `You helped ${x.s('first')} patch the tire. They insisted on giving you ${money(reward)} for your trouble.` : `You helped ${x.s('first')} patch the tire. They thanked you a dozen times.`, `I helped a stranded driver named ${x.s('first')} with a flat tire.`, { karma: 8, happiness: 4, money: reward }, 'good', '😇')
      },
      ride: (g, x) => {
        const friend = chance(g, 0.35)
        if (friend) createPerson(g, { relation: 'friend', age: g.character.age + randInt(g, -8, 8), firstName: x.s('first'), lastName: x.s('last'), gender: x.s('gender') === 'male' ? 'male' : 'female', relationship: 65 })
        const weird = !friend && chance(g, 0.25)
        say(g, x, friend ? 'New friend' : weird ? 'Awkward ride' : 'Good deed', friend ? `You gave ${x.s('first')} a ride and talked the whole way. You exchanged numbers!` : weird ? `${x.s('first')} spent the entire ride explaining their theory that birds aren't real.` : `You drove ${x.s('first')} to the nearest gas station. Good deed done.`, `I gave a stranded driver named ${x.s('first')} a ride.`, { karma: 8, happiness: friend ? 6 : 2 }, 'good')
      },
      tow: (g, x) => say(g, x, 'Helpful', `You called a tow truck for ${x.s('first')} and waited with them until it arrived.`, 'I called a tow truck for a stranded driver.', { karma: 5 }, 'good'),
      drive: (g) => say(g, null, 'Not my problem', 'You kept driving. Somebody else will stop. Probably.', 'I drove past a stranded driver.', { karma: -4 }),
    },
  },
  {
    id: 'adult.homeless',
    emoji: '🥫',
    title: 'Spare Change?',
    minAge: 12,
    maxAge: 99,
    setup: (g) => {
      const small = cash(g, 5)
      const big = cash(g, 20)
      return {
        text: 'A homeless man outside the grocery store asks if you can spare some change. What will you do?',
        choices: [ch('five', `Give him ${money(small)}`), ch('twenty', `Give him ${money(big)}`), ch('meal', 'Buy him a meal'), ch('ignore', 'Ignore him')],
        data: { small, big, name: isUS(g) ? 'Walter' : strangerName(g, 'male').first },
      }
    },
    resolve: {
      five: (g, x) => give(g, x.n('small') || 5, false),
      twenty: (g, x) => give(g, x.n('big') || 20, true),
      meal: (g, x) => {
        const meal = cash(g, 12)
        if (g.character.money < meal) return say(g, null, 'Empty pockets', "You wanted to buy him a meal, but you're nearly broke yourself.", null, {})
        const food = isUS(g) ? 'a hot meal' : `a plate of ${lp(g, 'food', 'hot food')}`
        say(g, null, ['Kindness', 'Heart of gold'], `You bought him ${food} and sat with him while he ate. His name is ${x.s('name') || 'Walter'} and he used to be a jazz drummer.`, 'I bought a homeless man a meal.', { money: -meal, karma: 10, happiness: 6 }, 'good', '🍲')
      },
      ignore: (g) => say(g, null, 'Walked past', 'You avoided eye contact and walked past.', 'I ignored a homeless man asking for change.', { karma: -3 }),
    },
  },
  {
    id: 'adult.aliens',
    emoji: '👽',
    title: 'Aliens',
    minAge: 10,
    maxAge: 99,
    setup: (g) => ({
      text: `While waiting for the bus, ${stranger(g)} runs up to you, wild-eyed, and asks if you believe in aliens. What will you say?`,
      choices: [ch('yes', 'Without a doubt'), ch('no', 'No way'), ch('away', 'Get away from me')],
    }),
    resolve: {
      yes: (g) => say(g, null, 'The truth is out there', 'You said absolutely. They handed you a pamphlet and a tinfoil hat. You kept both.', 'I told a stranger that I believe in aliens.', { craziness: 3, happiness: 2 }),
      no: (g) => say(g, null, 'Skeptic', 'You said no. They looked at you with deep pity and whispered, "They\'re already here."', "I told a stranger I don't believe in aliens.", { smarts: 2 }),
      away: (g) => say(g, null, 'Personal space', 'You told them to get away from you. They saluted and ran off.', 'I told a crazy person to get away from me.', {}),
    },
  },
  {
    id: 'adult.godQuestion',
    emoji: '👼',
    title: 'Big Question',
    minAge: 12,
    maxAge: 99,
    setup: (g) => ({
      text: `While walking through the park, ${stranger(g)} stops you and loudly asks if you trust in a higher power. What will you say?`,
      choices: [ch('yes', 'Of course, 100%'), ch('no', 'Absolutely not'), ch('which', 'Which one?')],
    }),
    resolve: {
      yes: (g) => say(g, null, 'Faithful', 'You said yes. They blessed you three times and moved on.', 'I told a stranger I trust in a higher power.', { religiousness: 6, happiness: 2 }),
      no: (g) => say(g, null, 'Nonbeliever', 'You said no. They said they would pray for you anyway.', 'I told a stranger I do not believe in a higher power.', { religiousness: -6 }),
      which: (g) => say(g, null, 'Philosopher', 'You asked "which one?" and they stood frozen in existential thought as you walked away.', 'I posed an existential question to a stranger.', { smarts: 8 }, 'good'),
    },
  },
  {
    id: 'adult.doorToDoor',
    emoji: '🚪',
    title: 'Ding Dong',
    minAge: 18,
    maxAge: 99,
    when: (g) => !livesWithParents(g),
    setup: (g) => {
      const what = pick(g, [
        { item: 'a magazine subscription', price: 40 },
        { item: 'a "revolutionary" vacuum cleaner', price: 600 },
        { item: 'a set of steak knives', price: 120 },
        { item: 'solar panels', price: 9000 },
        { item: 'a security system', price: 300 },
      ])
      const price = dollars(g, what.price, Math.round(what.price * 1.3))
      return {
        text: `A very persistent salesperson is at your door trying to sell you ${what.item} for ${money(price)}. What will you do?`,
        choices: [ch('buy', 'Buy it'), ch('haggle', 'Haggle'), ch('slam', 'Close the door')],
        data: { item: what.item, price },
      }
    },
    resolve: {
      buy: (g, x) => {
        const price = x.n('price')
        if (g.character.money < price) return say(g, x, 'Declined', 'Your card was declined. The salesperson looked at you with pity and left.', null, { happiness: -2 }, 'bad')
        say(g, x, 'Sold!', `You bought ${x.s('item')} for ${money(price)}. You may have been played.`, `I bought ${x.s('item')} from a door-to-door salesperson.`, { money: -price, happiness: 2, count: 'purchases' })
      },
      haggle: (g, x) => {
        const price = Math.round(x.n('price') * 0.6)
        if (g.character.money < price) return say(g, x, 'Broke', 'You haggled hard, but even the discounted price was more than you have.', null, {})
        const ok = chance(g, 0.5)
        say(g, x, ok ? 'Deal!' : 'Walked away', ok ? `You haggled them down to ${money(price)}. Victory!` : 'The salesperson refused to budge and moved on to your neighbor.', ok ? `I haggled a door-to-door salesperson down to ${money(price)}.` : null, ok ? { money: -price, smarts: 2, count: 'purchases' } : {})
      },
      slam: (g) => say(g, null, 'Not interested', 'You closed the door mid-pitch. They kept talking to the door for another minute.', 'I closed the door on a door-to-door salesperson.', {}),
    },
  },
  {
    id: 'adult.streetPerformer',
    emoji: '🎺',
    title: 'Street Performer',
    minAge: 10,
    maxAge: 99,
    setup: (g) => {
      const inst = pick(g, ['kazoo', 'accordion', 'bucket drums', 'bagpipes', 'spoons', 'a saw played with a violin bow'])
      return {
        text: `A street performer wants to play you a song on ${inst}. What will you do?`,
        choices: [ch('tip', 'Listen and tip them'), ch('feedback', 'Listen and give feedback'), ch('dance', 'Dance along'), ch('ignore', 'Ignore them')],
        data: { inst },
      }
    },
    resolve: {
      tip: (g, x) => {
        const coin = cash(g, 5)
        const tip = g.character.money >= coin ? coin : 0
        say(g, x, 'Patron of the arts', tip ? `You listened to their ${x.s('inst')} serenade and dropped ${money(tip)} in their hat.` : 'You listened and gave them a heartfelt thumbs-up, since you had no cash.', `I tipped a street performer playing ${x.s('inst')}.`, { money: -tip, karma: 3, happiness: 4 }, 'good')
      },
      feedback: (g, x) => say(g, x, 'Music critic', 'You offered detailed notes on timbre and phrasing. They did not ask for notes.', `I gave a street performer feedback on their ${x.s('inst')} playing.`, { smarts: 2 }),
      dance: (g) => say(g, null, 'Street party', 'You danced along and a small crowd joined in. It was a beautiful moment.', 'I danced along to a street performer.', { happiness: 8, health: 2 }, 'good', '🕺'),
      ignore: (g) => say(g, null, 'Busy', 'You walked past with your headphones in.', null, {}),
    },
  },
  {
    id: 'adult.mlm',
    emoji: '🧴',
    title: 'Business Opportunity',
    minAge: 20,
    maxAge: 65,
    when: (g) => friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      const buyIn = dollars(g, 300, 1500)
      const product = pick(g, ['essential oils', 'leggings', 'protein shakes', 'kitchen knives', 'anti-aging cream', 'crypto courses'])
      return {
        text: `Your friend ${f.firstName} says they're "their own boss" now and wants you to join their ${product} business. The starter kit is only ${money(buyIn)}! What will you do?`,
        choices: [ch('join', "I'm in!"), ch('decline', 'Politely decline'), ch('expose', 'Tell them it\'s a pyramid scheme')],
        person: f,
        data: { buyIn, product },
      }
    },
    resolve: {
      join: (g, x) => {
        const buyIn = x.n('buyIn')
        if (g.character.money < buyIn) return say(g, x, "Can't afford it", `You couldn't afford the ${x.s('product')} starter kit. Saved by poverty.`, null, { rel: -2 })
        const profit = chance(g, 0.1)
        say(g, x, profit ? 'Boss babe' : 'Garage full of product', profit ? `Against all odds, you actually made money selling ${x.s('product')}!` : `You now have a garage full of ${x.s('product')} that nobody will buy, and three fewer friends.`, `I joined my friend's ${x.s('product')} business.`, profit ? { money: buyIn, happiness: 6, rel: 8 } : { money: -buyIn, happiness: -10, rel: 4 }, profit ? 'good' : 'bad')
      },
      decline: (g, x) => say(g, x, 'Not for me', `You politely declined. ${x.p?.firstName ?? 'Your friend'} said "your loss, hun."`, `I declined to join my friend's ${x.s('product')} business.`, { rel: -3 }),
      expose: (g, x) => say(g, x, 'Truth bomb', `You told ${x.p?.firstName ?? 'your friend'} it's a pyramid scheme. They called it a "reverse funnel system" and unfollowed you.`, `I told my friend their ${x.s('product')} business was a pyramid scheme.`, { rel: -15, smarts: 2 }),
    },
  },
  {
    id: 'adult.fraudAlert',
    emoji: '💳',
    title: 'Fraud Alert',
    minAge: 18,
    maxAge: 99,
    when: (g) => g.character.money > 200,
    setup: (g) => {
      const amt = dollars(g, 60, 900)
      const what = pick(g, ['a jet ski rental in another country', '40 pizzas', 'a premium dating app subscription', 'a vintage lava lamp', 'an online course on becoming a pirate'])
      return {
        text: `Your bank flagged a suspicious ${money(amt)} charge for ${what}. What will you do?`,
        choices: [ch('dispute', 'Dispute the charge'), ch('ignore', 'Ignore it'), ch('mine', 'Wait... that was me')],
        data: { amt, what },
      }
    },
    resolve: {
      dispute: (g, x) => say(g, x, 'Refunded', 'You disputed the charge. The bank refunded it and sent you a new card.', 'I disputed a fraudulent charge on my card.', { smarts: 2 }, 'good'),
      ignore: (g, x) => say(g, x, 'Robbed', `You ignored it. More charges followed. You lost ${money(x.n('amt'))} before you cancelled the card.`, `I lost ${money(x.n('amt'))} to credit card fraud.`, { money: -x.n('amt'), happiness: -8 }, 'bad'),
      mine: (g, x) => say(g, x, 'Late night purchase', `You remembered buying ${x.s('what')} at 3 AM. No regrets. Okay, some regrets.`, `I forgot I bought ${x.s('what')} at 3 AM.`, { money: -x.n('amt'), happiness: 2 }),
    },
  },
  {
    id: 'adult.inheritance',
    emoji: '📜',
    title: 'Mystery Inheritance',
    minAge: 22,
    maxAge: 99,
    once: true,
    weight: 2,
    setup: (g) => {
      const s = strangerName(g)
      const amt = dollars(g, 5000, 60000)
      return {
        text: `A lawyer informs you that a distant relative you never met, ${s.first} ${g.character.lastName}, has passed away and left you ${money(amt)}. What will you do?`,
        choices: [ch('accept', 'Accept it'), ch('donate', 'Donate it to charity'), ch('split', 'Split it with my family')],
        data: { first: s.first, amt },
      }
    },
    resolve: {
      accept: (g, x) => {
        addMoney(g, x.n('amt'))
        say(g, x, ['Windfall', 'Rest in peace'], `You accepted the ${money(x.n('amt'))} inheritance. Thank you, ${x.s('first')}, whoever you were.`, `I inherited ${money(x.n('amt'))} from a distant relative I never met.`, { happiness: 14, memory: `Inherited ${money(x.n('amt'))} from a distant relative.` }, 'good', '💰')
      },
      donate: (g, x) => say(g, x, 'Philanthropist', `You donated the entire ${money(x.n('amt'))} to charity. ${x.s('first')} would be proud. Probably.`, `I donated a ${money(x.n('amt'))} inheritance to charity.`, { karma: 20, happiness: 8, count: 'donated' }, 'good', '😇'),
      split: (g, x) => {
        const fam = peopleBy(g, ['parent', 'sibling', 'spouse', 'child'])
        const share = Math.round(x.n('amt') / (fam.length + 1))
        addMoney(g, share)
        say(g, x, 'Family first', fam.length ? `You split the inheritance with your family. Your share was ${money(share)}, and everyone loves you a little more.` : `With no family to share it with, you kept all ${money(share)}.`, `I split an inheritance with my family.`, { happiness: 10, karma: 8, rels: fam.map((p) => ({ p, d: 10 })) }, 'good', '💰')
      },
    },
  },
  {
    id: 'adult.taxAudit',
    emoji: '🧾',
    title: 'Tax Audit',
    minAge: 23,
    maxAge: 80,
    cooldown: 15,
    weight: 4,
    when: hasJob,
    setup: () => ({
      text: "You've been selected for a random tax audit. What will you do?",
      choices: [ch('cooperate', 'Cooperate fully'), ch('accountant', 'Hire an accountant'), ch('shred', 'Shred my receipts'), ch('ignore', 'Ignore the letters')],
    }),
    resolve: {
      cooperate: (g) => {
        const owe = chance(g, 0.5) ? dollars(g, 200, 2500) : 0
        say(g, null, owe ? 'Pay up' : 'All clear', owe ? `They found a mistake in your return. You owe ${money(owe)}.` : 'Your taxes were in perfect order. The auditor seemed disappointed.', owe ? `I was audited and owed ${money(owe)}.` : 'I was audited and everything checked out.', owe ? { money: -owe, happiness: -6 } : { happiness: 4 }, owe ? 'bad' : 'good')
      },
      accountant: (g) => {
        const fee = dollars(g, 300, 900)
        say(g, null, 'Professional help', `Your accountant handled everything for ${money(fee)}. The audit closed with no penalties.`, 'I hired an accountant to handle a tax audit.', { money: -fee, happiness: 2 }, 'good')
      },
      shred: (g) => {
        const caught = chance(g, 0.2)
        if (caught) say(g, null, 'Obstruction', 'Shredding evidence during an audit turns out to be a crime.', 'I got caught destroying evidence during a tax audit.', { count: 'crimes', arrest: { crime: 'Tax Evasion', severity: 2 } }, 'bad', '🚓')
        else say(g, null, 'Penalty', 'With no receipts, the auditor assumed the worst. You were fined.', 'I was fined after a tax audit.', { money: -dollars(g, 500, 3000), happiness: -8 }, 'bad')
      },
      ignore: (g) => {
        const fine = dollars(g, 1000, 4000)
        say(g, null, 'Penalties and interest', `You ignored every letter. The penalties added up to ${money(fine)}.`, `I ignored a tax audit and was hit with ${money(fine)} in penalties.`, { money: -fine, happiness: -10 }, 'bad')
      },
    },
  },
  {
    id: 'adult.nightNoise',
    emoji: '🌚',
    title: 'Things That Go Bump',
    minAge: 18,
    maxAge: 99,
    when: (g) => !livesWithParents(g) && g.character.residence.status !== 'homeless',
    setup: (g) => {
      const weapon = homeWeapon(g)
      const critter = nightCritter(g)
      return {
        text: 'You hear a loud crash downstairs at 3 AM. What will you do?',
        choices: [ch('investigate', `Investigate with ${weapon}`), ch('police', 'Call the police'), ch('hide', 'Hide under the covers')],
        data: { weapon, critter: critter.what, critterEmoji: critter.emoji },
      }
    },
    resolve: {
      investigate: (g, x) => {
        const r = randInt(g, 1, 10)
        const critter = x.s('critter') || 'a stray cat'
        if (r <= 6) say(g, x, 'False alarm', `You crept downstairs, ${(x.s('weapon') || 'a broom').replace(/^an? /, '')} raised... and found ${critter} eating your bread. It hissed at you.`, `I investigated a noise at night. It was ${critter}.`, { happiness: 2 }, 'neutral', x.s('critterEmoji') || '🐈')
        else if (r <= 9) say(g, null, ['Home defender', 'Burglar busted'], 'You surprised a burglar, who dropped your TV and fled out the window!', 'I scared off a burglar in the middle of the night.', { happiness: 8, karma: 2 }, 'good', '🦹')
        else say(g, null, 'Ambushed', 'A burglar knocked you down and escaped with your laptop.', 'A burglar knocked me down and stole my laptop.', { health: -12, happiness: -10, condition: { name: 'Bruised Ribs', kind: 'injury', severity: 12 } }, 'bad', '🦹')
      },
      police: (g) => say(g, null, 'Better safe', 'The police checked the house. A picture frame had fallen off the wall. They were very polite about it.', 'I called the police about a noise at night. A picture frame had fallen.', { happiness: -2 }),
      hide: (g) => {
        const robbed = chance(g, 0.25)
        say(g, null, robbed ? 'Robbed' : 'Survived the night', robbed ? 'In the morning, you discovered your TV and your car keys were gone.' : 'You hid under the covers until sunrise. It was the cat.', robbed ? 'My home was robbed while I hid under the covers.' : 'I hid under the covers after hearing a noise at night. It was the cat.', robbed ? { money: -Math.min(Math.max(0, g.character.money), dollars(g, 200, 1200)), happiness: -10 } : { happiness: -2 }, robbed ? 'bad' : 'neutral')
      },
    },
  },
  {
    id: 'adult.fluSeason',
    emoji: '🤒',
    title: 'Flu Season',
    minAge: 16,
    maxAge: 99,
    setup: () => ({
      text: "It's flu season and everyone around you is coughing. The pharmacy is offering free flu shots. What will you do?",
      choices: [ch('shot', 'Get the flu shot'), ch('vitamins', 'Load up on vitamins instead'), ch('skip', "I'll take my chances")],
    }),
    resolve: {
      shot: (g) => say(g, null, 'Protected', 'You got the shot. Your arm was sore for a day, but you stayed healthy all season.', 'I got a flu shot.', { health: 4 }, 'good', '💉'),
      vitamins: (g) => {
        const sick = chance(g, 0.4)
        say(g, null, sick ? 'Didn\'t work' : 'Lucky', sick ? 'You took 40 vitamins a day and caught the flu anyway.' : 'You loaded up on vitamins and somehow dodged the flu.', sick ? 'I caught the flu despite taking vitamins.' : 'I stayed healthy during flu season.', sick ? { health: -10, happiness: -6, condition: { name: 'Flu', kind: 'disease', severity: 10 } } : { health: 2 }, sick ? 'bad' : 'neutral')
      },
      skip: (g) => {
        const sick = chance(g, 0.5)
        say(g, null, sick ? 'Bedridden' : 'Dodged it', sick ? 'You caught the flu and spent a week in bed feeling like death.' : 'You skipped it and stayed healthy. This time.', sick ? 'I caught the flu.' : 'I skipped the flu shot and stayed healthy.', sick ? { health: -12, happiness: -8, condition: { name: 'Flu', kind: 'disease', severity: 12 } } : {}, sick ? 'bad' : 'neutral')
      },
    },
  },
  {
    id: 'adult.badMeal',
    emoji: '🍤',
    title: 'Questionable Shrimp',
    minAge: 16,
    maxAge: 99,
    setup: () => ({
      text: 'The shrimp at the restaurant tastes... off. Like, really off. What will you do?',
      choices: [ch('send', 'Send it back'), ch('eat', 'Eat it anyway'), ch('dash', 'Leave without paying')],
    }),
    resolve: {
      send: (g) => say(g, null, 'Good call', 'You sent it back. The manager apologized and comped your meal.', 'I sent back some bad shrimp at a restaurant.', { happiness: 4 }, 'good'),
      eat: (g) => {
        const sick = chance(g, 0.6)
        say(g, null, sick ? 'Regret' : 'Iron stomach', sick ? 'You spent the next two days getting very well acquainted with your bathroom.' : 'You ate it all and felt fine. Your stomach is made of steel.', sick ? 'I got food poisoning from bad shrimp.' : 'I ate some questionable shrimp and was fine.', sick ? { health: -10, happiness: -8, condition: { name: 'Food Poisoning', kind: 'disease', severity: 8 } } : { happiness: 2 }, sick ? 'bad' : 'neutral', sick ? '🤢' : undefined)
      },
      dash: (g) => {
        const caught = chance(g, 0.25)
        say(g, null, caught ? 'Caught' : 'Dine and dash', caught ? 'The waiter chased you down the block. You paid the bill, plus a tip out of shame.' : 'You walked out without paying. Technically a crime, morally... debatable.', caught ? 'I tried to dine and dash and got caught.' : 'I dined and dashed after being served bad shrimp.', caught ? { happiness: -6, money: -Math.min(Math.max(0, g.character.money), 60) } : { karma: -4, happiness: 4, count: 'crimes' }, caught ? 'bad' : 'neutral')
      },
    },
  },
  {
    id: 'adult.blindDate',
    emoji: '💘',
    title: 'Blind Date',
    minAge: 20,
    maxAge: 70,
    when: (g) => !currentPartner(g) && friends(g).length > 0,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      if (!f) return null
      const s = strangerName(g, g.character.sexuality === 'gay' ? g.character.gender : g.character.sexuality === 'bisexual' ? undefined : g.character.gender === 'male' ? 'female' : 'male')
      return {
        text: `Your friend ${f.firstName} wants to set you up on a blind date with someone named ${s.first}. What will you do?`,
        choices: [ch('go', 'Go on the date'), ch('no', 'No thanks')],
        person: f,
        data: { first: s.first, last: s.last, gender: s.gender },
      }
    },
    resolve: {
      go: (g, x) => {
        const r = randInt(g, 1, 10)
        if (r <= 4) {
          createPerson(g, { relation: 'partner', age: Math.max(18, g.character.age + randInt(g, -5, 5)), firstName: x.s('first'), lastName: x.s('last'), gender: x.s('gender') === 'male' ? 'male' : 'female', relationship: 70 })
          say(g, x, ['Sparks!', 'Love at first sight'], `You and ${x.s('first')} talked until the restaurant closed. You're officially dating!`, `I went on a blind date with ${x.s('first')} ${x.s('last')} and we started dating.`, { happiness: 14, rel: 10, count: 'partners' }, 'good', '💕')
        } else if (r <= 8) {
          say(g, x, 'Meh', `${x.s('first')} was nice, but there was zero chemistry. You split the check.`, `I went on a blind date with ${x.s('first')}. No chemistry.`, { happiness: -2 })
        } else {
          say(g, x, 'Disaster', `${x.s('first')} spent two hours talking about their ex and then asked you to pay.`, `I went on a terrible blind date with ${x.s('first')}.`, { happiness: -8, rel: -6, money: -Math.min(Math.max(0, g.character.money), 80) }, 'bad')
        }
      },
      no: (g, x) => say(g, x, 'Single and fine', `You declined. ${x.p?.firstName ?? 'Your friend'} said you'll die alone. Rude.`, 'I turned down a blind date.', { rel: -2 }),
    },
  },
  {
    id: 'adult.exText',
    emoji: '📱',
    title: 'Blast From the Past',
    minAge: 18,
    maxAge: 80,
    when: (g) => peopleBy(g, ['ex', 'exSpouse']).length > 0,
    setup: (g) => {
      const ex = anyOf(g, peopleBy(g, ['ex', 'exSpouse']))
      if (!ex) return null
      return {
        text: `Your ex, ${ex.firstName}, texted you at midnight: "hey... I've been thinking about you." What will you do?`,
        choices: [ch('reply', 'Reply warmly'), ch('ignore', 'Ignore it'), ch('block', 'Block them'), ch('screenshot', 'Screenshot it to my friends')],
        person: ex,
      }
    },
    resolve: {
      reply: (g, x) => say(g, x, 'Rekindled?', `You and ${x.p?.firstName ?? 'your ex'} texted until 3 AM. Old feelings are stirring.`, `My ex, ${x.p?.firstName ?? ''}, reached out and we talked all night.`, { happiness: 6, rel: 15 }, 'neutral', '💬'),
      ignore: (g, x) => say(g, x, 'Left on read', 'You left them on read. Growth.', `I ignored a late-night text from my ex.`, { rel: -5, smarts: 2 }),
      block: (g, x) => say(g, x, 'Blocked', `You blocked ${x.p?.firstName ?? 'your ex'}. Some doors should stay closed.`, 'I blocked my ex after they texted me.', { rel: -25, happiness: 2 }),
      screenshot: (g, x) => say(g, x, 'Group chat gold', 'Your friends roasted the text mercilessly. You laughed until you cried.', 'I shared my ex\'s late-night text with my friends.', { happiness: 6, rel: -8, karma: -2 }),
    },
  },
  {
    id: 'adult.charity',
    emoji: '🎗️',
    title: 'Charity Drive',
    minAge: 16,
    maxAge: 99,
    setup: (g) => {
      const cause = pick(g, ['children\'s hospital', 'animal shelter', 'food bank', 'clean ocean project', 'disaster relief fund', 'local library'])
      const small = cash(g, 20)
      const big = cash(g, 200)
      return {
        text: `A volunteer collecting for the ${cause} asks if you'd like to donate. What will you do?`,
        choices: [ch('small', `Donate ${money(small)}`), ch('big', `Donate ${money(big)}`), ch('sign', 'Just sign the petition'), ch('ignore', 'Pretend I\'m on the phone')],
        data: { cause, small, big },
      }
    },
    resolve: {
      small: (g, x) => donate(g, x.s('cause'), x.n('small') || 20, false),
      big: (g, x) => donate(g, x.s('cause'), x.n('big') || 200, true),
      sign: (g, x) => say(g, x, 'Signed', `You signed the ${x.s('cause')} petition. Every little bit helps.`, `I signed a petition for the ${x.s('cause')}.`, { karma: 2 }),
      ignore: (g) => say(g, null, 'Very busy', 'You pretended to be on an important phone call. Your phone rang mid-call.', 'I pretended to be on the phone to avoid a charity volunteer.', { karma: -3, happiness: -2 }),
    },
  },
  {
    id: 'adult.landlord',
    emoji: '🏢',
    title: 'Rent Increase',
    minAge: 18,
    maxAge: 99,
    when: (g) => g.character.residence.status === 'renting' && (g.character.residence.rent ?? 0) > 0,
    setup: (g) => {
      const pct = pick(g, [8, 10, 12, 15, 20])
      return {
        text: `Your landlord just announced a ${pct}% rent increase starting next year. What will you do?`,
        choices: [ch('accept', 'Accept it'), ch('negotiate', 'Negotiate'), ch('threaten', 'Threaten to move out')],
        data: { pct },
      }
    },
    resolve: {
      accept: (g, x) => {
        const res = g.character.residence
        if (res.rent) res.rent = Math.round(res.rent * (1 + x.n('pct') / 100))
        say(g, x, 'Cost of living', `You accepted. Your rent is now ${money(res.rent ?? 0)} a year.`, `My rent went up ${x.n('pct')}%.`, { happiness: -4 })
      },
      negotiate: (g, x) => {
        const res = g.character.residence
        const ok = chance(g, 0.5)
        const pct = ok ? Math.round(x.n('pct') / 2) : x.n('pct')
        if (res.rent) res.rent = Math.round(res.rent * (1 + pct / 100))
        say(g, x, ok ? 'Meet in the middle' : 'Take it or leave it', ok ? `You talked them down to a ${pct}% increase.` : `Your landlord didn't budge. The ${pct}% increase stands.`, `I negotiated my rent increase down to ${pct}%.`, ok ? { smarts: 2 } : { happiness: -4 }, ok ? 'good' : 'neutral')
      },
      threaten: (g, x) => {
        const res = g.character.residence
        const ok = chance(g, 0.35)
        if (!ok && res.rent) res.rent = Math.round(res.rent * (1 + x.n('pct') / 100))
        say(g, x, ok ? 'Called their bluff' : 'Bluff called', ok ? 'Your landlord panicked and cancelled the increase. Good tenants are hard to find.' : 'Your landlord said "there\'s the door." You quietly accepted the increase.', ok ? 'I convinced my landlord to cancel a rent increase.' : 'My bluff failed and my rent went up.', ok ? { happiness: 8 } : { happiness: -6 }, ok ? 'good' : 'bad')
      },
    },
  },
  {
    id: 'adult.upstairs',
    emoji: '🐘',
    title: 'Upstairs Neighbor',
    minAge: 18,
    maxAge: 99,
    when: (g) => g.character.residence.status === 'renting',
    setup: () => ({
      text: 'Your upstairs neighbor walks like an elephant wearing bowling shoes, every night, until 2 AM. What will you do?',
      choices: [ch('note', 'Leave a polite note'), ch('broom', 'Bang on the ceiling with a broom'), ch('complain', 'Complain to the landlord'), ch('ignore', 'Ignore it')],
    }),
    resolve: {
      note: (g) => {
        const ok = chance(g, 0.5)
        say(g, null, ok ? 'Slippers' : 'Passive aggressive', ok ? 'They left a note back apologizing, along with cookies. They bought slippers!' : 'They left a note back that said "no." Just "no."', 'I left a polite note for my noisy upstairs neighbor.', ok ? { happiness: 6 } : { happiness: -4 })
      },
      broom: (g) => say(g, null, 'Bang bang', 'You banged on the ceiling. They banged back. A rhythm has developed.', 'I banged on the ceiling with a broom.', { happiness: 2, craziness: 2 }),
      complain: (g) => say(g, null, 'Paperwork', 'The landlord said they would "look into it." They did not.', 'I complained to my landlord about my upstairs neighbor.', { happiness: -2 }),
      ignore: (g) => say(g, null, 'White noise', 'You bought a white noise machine. Now you hear ocean waves AND elephants.', 'I ignored my noisy upstairs neighbor.', { happiness: -2 }),
    },
  },
  {
    id: 'adult.reunion',
    emoji: '🎓',
    title: 'Class Reunion',
    minAge: 28,
    maxAge: 70,
    cooldown: 10,
    when: (g) => g.character.education.completed.includes('high'),
    setup: (g) => ({
      text: `You've been invited to your ${Math.max(10, Math.round((g.character.age - 18) / 5) * 5)}-year ${lt(g, 'high', 'high school')} reunion. What will you do?`,
      choices: [ch('go', 'Go and catch up'), ch('brag', 'Go and brag'), ch('skip', 'Skip it')],
    }),
    resolve: {
      go: (g) => {
        const s = strangerName(g)
        const f = chance(g, 0.4)
        if (f) createPerson(g, { relation: 'friend', age: g.character.age, firstName: s.first, lastName: s.last, gender: s.gender, relationship: 60 })
        say(g, null, 'Nostalgia', f ? `You reconnected with your old classmate ${s.first} and promised to stay in touch. You actually meant it.` : 'You caught up with old classmates. The class clown is now a tax attorney.', `I went to my ${lt(g, 'high', 'high school')} reunion.`, { happiness: 8 }, 'good')
      },
      brag: (g) => {
        const rich = g.character.money > 100000 || g.character.job !== null
        say(g, null, rich ? 'Main character' : 'Exposed', rich ? 'You casually mentioned your success roughly 40 times. Your old bully looked miserable.' : 'You bragged about your "investments." Someone asked what you do for work. Silence.', `I went to my ${lt(g, 'high', 'high school')} reunion and bragged.`, rich ? { happiness: 10, karma: -2 } : { happiness: -8 }, rich ? 'good' : 'bad')
      },
      skip: (g) => say(g, null, 'Moving on', 'You skipped it. You saw the photos online. Everyone looks old.', `I skipped my ${lt(g, 'high', 'high school')} reunion.`, {}),
    },
  },
  {
    id: 'adult.midlife',
    emoji: '🏍️',
    title: 'Midlife Crisis',
    minAge: 40,
    maxAge: 55,
    once: true,
    weight: 6,
    setup: () => ({
      text: "You looked in the mirror this morning and realized you're not getting any younger. How will you handle this?",
      choices: [ch('tattoo', 'Get a tattoo'), ch('guitar', 'Learn the electric guitar'), ch('marathon', 'Train for a marathon'), ch('therapy', 'See a therapist')],
    }),
    resolve: {
      tattoo: (g) => {
        const design = pick(g, ['a flaming eagle', 'a dragon wrapped around a sword', "my own name, in case I forget", 'a misspelled inspirational quote', 'a tribal armband'])
        say(g, null, 'Inked', `You got ${design} tattooed on your arm. Your kids are mortified.`, `I got a tattoo of ${design} during a midlife crisis.`, { happiness: 8, looks: chance(g, 0.5) ? 4 : -4, money: -Math.min(Math.max(0, g.character.money), 250) })
      },
      guitar: (g) => say(g, null, 'Rock star dreams', 'You bought a guitar and an amp. You can now play the first four notes of three songs. Loudly.', 'I learned the electric guitar during a midlife crisis.', { happiness: 10, smarts: 2, money: -Math.min(Math.max(0, g.character.money), 600) }, 'good', '🎸'),
      marathon: (g) => {
        const ok = chance(g, 0.6)
        say(g, null, ok ? 'Finisher' : 'DNF', ok ? 'You trained for months and finished the marathon! Your knees have filed a formal complaint.' : 'You pulled a hamstring at mile 4 and were driven to the finish line in a golf cart.', ok ? 'I ran a marathon during my midlife crisis.' : 'I tried to run a marathon and pulled a hamstring.', ok ? { health: 10, happiness: 10, looks: 4 } : { health: -6, happiness: -4 }, ok ? 'good' : 'bad', '🏃')
      },
      therapy: (g) => say(g, null, 'Self-care', "You saw a therapist and talked it through. Turns out you're doing fine.", 'I saw a therapist during my midlife crisis.', { happiness: 10, smarts: 2, money: -Math.min(Math.max(0, g.character.money), 300) }, 'good', '🛋️'),
    },
  },
  {
    id: 'adult.powerOutage',
    emoji: '🕯️',
    title: 'Blackout',
    minAge: 8,
    maxAge: 99,
    setup: () => ({
      text: 'A massive storm knocked out power across the whole city for two days. What will you do?',
      choices: [ch('candles', 'Light candles and play board games'), ch('hotel', 'Check into a hotel'), ch('complain', 'Complain to the power company'), ch('sleep', 'Sleep through it')],
    }),
    resolve: {
      candles: (g) => say(g, null, 'Cozy', 'You lit candles and played board games by candlelight. Honestly, it was kind of nice.', 'I played board games by candlelight during a blackout.', { happiness: 6, smarts: 2 }, 'good'),
      hotel: (g) => {
        const cost = dollars(g, 150, 400)
        if (g.character.money < cost || g.character.age < 18) return say(g, null, 'No vacancy', 'Every hotel in the region was booked solid. You roughed it in the dark.', 'I sat through a two-day blackout.', { happiness: -4 })
        say(g, null, 'Staycation', `You checked into a hotel for ${money(cost)}. Room service and working outlets. Luxury.`, 'I stayed at a hotel during a blackout.', { money: -cost, happiness: 6 })
      },
      complain: (g) => say(g, null, 'On hold', 'You waited on hold with the power company for 3 hours. The power came back while you were on hold.', 'I waited on hold with the power company for 3 hours.', { happiness: -6 }, 'bad'),
      sleep: (g) => say(g, null, 'Hibernation', 'You slept for most of the two days. Peak efficiency.', 'I slept through a blackout.', { health: 4 }),
    },
  },
  {
    id: 'adult.wedding',
    emoji: '💒',
    title: 'Wedding Invitation',
    minAge: 20,
    maxAge: 85,
    when: (g) => friends(g).some((f) => f.age >= 20),
    setup: (g) => {
      const f = anyOf(g, friends(g).filter((p) => p.age >= 20))
      if (!f) return null
      const gift = dollars(g, 50, 250)
      return {
        text: `Your friend ${f.firstName} is getting married and invited you to the wedding. What will you do?`,
        choices: [ch('gift', `Attend and give a ${money(gift)} gift`), ch('attend', 'Attend empty-handed'), ch('skip', 'Make an excuse'), ch('object', 'Attend and object during the ceremony')],
        person: f,
        data: { gift },
      }
    },
    resolve: {
      gift: (g, x) => {
        const gift = x.n('gift')
        if (g.character.money < gift) return say(g, x, 'Heartfelt card', `You couldn't afford a gift, so you wrote a heartfelt card. ${x.p?.firstName ?? 'Your friend'} cried reading it.`, `I went to my friend ${x.p?.firstName ?? ''}'s wedding.`, { happiness: 8, rel: 10 }, 'good')
        say(g, x, ['Happily ever after', 'Open bar'], `You danced all night at ${x.p?.firstName ?? 'your friend'}'s wedding. Your gift was a hit.`, `I went to my friend ${x.p?.firstName ?? ''}'s wedding.`, { money: -gift, happiness: 10, rel: 15 }, 'good', '🥂')
      },
      attend: (g, x) => say(g, x, 'Free dinner', 'You went without a gift. You hoped nobody noticed. Someone noticed.', `I went to my friend ${x.p?.firstName ?? ''}'s wedding without a gift.`, { happiness: 6, rel: 2 }),
      skip: (g, x) => say(g, x, 'No-show', `You told ${x.p?.firstName ?? 'your friend'} you had food poisoning. They saw you at the mall that day.`, `I skipped my friend ${x.p?.firstName ?? ''}'s wedding.`, { rel: -15 }, 'bad'),
      object: (g, x) => say(g, x, ['Speak now...', 'Chaos'], `When the officiant asked if anyone objected, you stood up and said "the cake is dry." You were escorted out.`, `I objected at my friend ${x.p?.firstName ?? ''}'s wedding.`, { rel: -40, craziness: 6, happiness: 4 }, 'bad', '😱'),
    },
  },
  {
    id: 'adult.lostDog',
    emoji: '🐶',
    title: 'Lost Dog',
    minAge: 8,
    maxAge: 99,
    setup: (g) => {
      const name = pick(g, ['Biscuit', 'Captain', 'Pickles', 'Duchess', 'Waffles', 'Bear'])
      return {
        text: `You found a friendly lost dog with a collar that says "${name}." There's a phone number on the tag. What will you do?`,
        choices: [ch('return', 'Call the owner'), ch('keep', 'Keep it'), ch('shelter', 'Drop it off at a shelter'), ch('ignore', 'Ignore it')],
        data: { name },
      }
    },
    resolve: {
      return: (g, x) => {
        const reward = chance(g, 0.5) ? dollars(g, 20, 150) : 0
        say(g, x, 'Reunited', reward ? `The owner sobbed with joy and insisted you take a ${money(reward)} reward.` : `The owner sobbed with joy and hugged ${x.s('name')} for five straight minutes.`, `I returned a lost dog named ${x.s('name')} to its owner.`, { karma: 10, happiness: 8, money: reward }, 'good', '🥹')
      },
      keep: (g, x) => {
        if (g.character.age < 18 && g.character.residence.status === 'parents' && chance(g, 0.5)) {
          return say(g, x, 'Nope', 'Your parents made you call the owner. You cried a little.', `I tried to keep a lost dog, but my parents made me return it.`, { happiness: -4, karma: 2 })
        }
        createPerson(g, { relation: 'pet', age: randInt(g, 1, 8), firstName: x.s('name'), species: 'Dog', relationship: 70, livesWithPlayer: true })
        say(g, x, 'Finders keepers', `You kept ${x.s('name')}. Somewhere, a family is putting up posters.`, `I kept a lost dog named ${x.s('name')}.`, { karma: -10, happiness: 10, count: 'pets' }, 'neutral', '🐕')
      },
      shelter: (g, x) => say(g, x, 'Responsible', `You dropped ${x.s('name')} off at the shelter, where they scanned the microchip and called the owner.`, 'I took a lost dog to the shelter.', { karma: 5 }, 'good'),
      ignore: (g, x) => say(g, x, 'Cold heart', `You walked away. ${x.s('name')} followed you for two blocks, then gave up.`, 'I ignored a lost dog.', { karma: -6, happiness: -2 }),
    },
  },
  {
    id: 'adult.gameShow',
    emoji: '📺',
    title: 'Game Show',
    minAge: 18,
    maxAge: 90,
    once: true,
    weight: 2,
    setup: (g) => ({
      text: `You've been randomly selected to be a contestant on the TV game show "${pick(g, ['Spin That Wheel!', 'Know-It-All', 'Price Is Close Enough', country(g).currency === '$' ? 'Million Dollar Toss' : 'The Million Toss'])}". What will you do?`,
      choices: [ch('go', "Let's play!"), ch('no', 'I get stage fright')],
    }),
    resolve: {
      go: (g) => {
        const r = randInt(g, 1, 100)
        const smart = g.character.stats.smarts
        if (r <= 10 + smart / 10) {
          const prize = dollars(g, 25000, 100000)
          addMoney(g, prize)
          say(g, null, ['Grand prize!', 'Winner!'], `You answered the final question correctly and won ${money(prize)}! Confetti everywhere.`, `I won ${money(prize)} on a TV game show.`, { happiness: 20, fame: 4, memory: `Won ${money(prize)} on a game show.` }, 'good', '🏆')
        } else if (r <= 55) {
          const prize = dollars(g, 500, 5000)
          addMoney(g, prize)
          say(g, null, 'Consolation prize', `You won ${money(prize)} and a jet ski you have nowhere to put.`, `I won ${money(prize)} on a TV game show.`, { happiness: 10, fame: 2 }, 'good', '📺')
        } else {
          say(g, null, 'Lovely parting gifts', 'You froze on the first question and went home with a coupon for a car wash.', 'I lost on a TV game show.', { happiness: -6, fame: 1 }, 'bad')
        }
      },
      no: (g) => say(g, null, 'Missed opportunity', 'You declined. You watched the episode at home and knew every answer.', 'I turned down a chance to be on a game show.', {}),
    },
  },
  {
    id: 'adult.enemyEncounter',
    emoji: '🔪',
    title: 'Enemy Encounter',
    minAge: 14,
    maxAge: 80,
    weight: 5,
    when: (g) => peopleBy(g, ['enemy']).length > 0,
    setup: (g) => {
      const e = anyOf(g, peopleBy(g, ['enemy']))
      if (!e) return null
      const weapon = pick(g, ['a baseball bat', 'a tire iron', 'a lead pipe', 'a broken bottle', 'nunchucks'])
      return {
        text: `Your enemy ${e.firstName} ${e.lastName} cornered you in a parking lot holding ${weapon}. What will you do?`,
        choices: [ch('argue', 'Argue with them'), ch('beg', 'Beg for forgiveness'), ch('reason', 'Reason with them'), ch('run', 'Run away')],
        person: e,
        data: { weapon },
      }
    },
    resolve: {
      argue: (g, x) => {
        const hit = chance(g, 0.5)
        say(g, x, hit ? 'Ambushed' : 'Standoff', hit ? `Arguing only made ${x.p?.firstName ?? 'them'} angrier. They swung ${x.s('weapon')} and broke your arm.` : `You argued until ${x.p?.firstName ?? 'they'} got bored and left.`, hit ? `My enemy, ${x.p?.firstName ?? ''}, attacked me with ${x.s('weapon')}.` : `I had a standoff with my enemy, ${x.p?.firstName ?? ''}.`, hit ? { health: -20, happiness: -10, condition: { name: 'Broken Arm', kind: 'injury', severity: 20 }, rel: -5 } : { happiness: -4 }, hit ? 'bad' : 'neutral')
      },
      beg: (g, x) => {
        const ok = chance(g, 0.5)
        say(g, x, ok ? 'Forgiven' : 'Not today', ok ? `You begged for forgiveness. ${x.p?.firstName ?? 'They'} lowered the weapon and said, "We're done here."` : `${x.p?.firstName ?? 'They'} laughed at your begging and smashed your car window on the way out.`, `I begged my enemy, ${x.p?.firstName ?? ''}, for forgiveness.`, ok ? { rel: 20, happiness: -2 } : { happiness: -10, rel: -5 }, ok ? 'neutral' : 'bad')
      },
      reason: (g, x) => {
        const ok = chance(g, 0.35 + g.character.stats.smarts / 300)
        if (ok && x.p) {
          x.p.relation = 'friend'
          x.p.relationship = Math.max(x.p.relationship, 45)
        }
        say(g, x, ok ? 'Peace treaty' : 'Talk is cheap', ok ? `You talked it out with ${x.p?.firstName ?? 'them'}. Somehow, you're now friends.` : `${x.p?.firstName ?? 'They'} weren't interested in talking and shoved you into a dumpster.`, ok ? `I made peace with my enemy, ${x.p?.firstName ?? ''}.` : `My enemy, ${x.p?.firstName ?? ''}, shoved me into a dumpster.`, ok ? { happiness: 8, karma: 4 } : { health: -6, happiness: -8 }, ok ? 'good' : 'bad')
      },
      run: (g, x) => {
        const ok = chance(g, 0.5 + g.character.hidden.athleticism / 200)
        say(g, x, ok ? 'Escaped' : 'Caught', ok ? 'You sprinted away and lost them in a crowd. Cardio saves lives.' : `${x.p?.firstName ?? 'They'} caught you and landed a few blows before you got away.`, ok ? `I ran away from my enemy, ${x.p?.firstName ?? ''}.` : `My enemy, ${x.p?.firstName ?? ''}, chased me down and beat me up.`, ok ? { health: 2 } : { health: -12, happiness: -6 }, ok ? 'neutral' : 'bad')
      },
    },
  },
  {
    id: 'adult.strangerInsult',
    emoji: '🤬',
    title: 'Insulted',
    minAge: 12,
    maxAge: 99,
    setup: (g) => {
      const who = stranger(g)
      const insult = pick(g, INSULTS)
      const place = pick(g, ['While waiting in line for coffee', 'While walking down the street', 'While pumping gas', 'While shopping for groceries', 'While waiting for the bus'])
      return {
        text: `${place}, ${who} calls you ${insult}! What will you do?`,
        choices: [ch('forgive', 'Forgive them'), ch('insult', 'Insult them back'), ch('assault', 'Assault them'), ch('language', 'Beg them to watch their language')],
        data: { who, insult },
      }
    },
    resolve: {
      forgive: (g, x) => say(g, x, 'Bigger person', 'You shrugged it off. You are better than this.', `${uc(x.s('who'))} called me ${x.s('insult')}. I forgave them.`, { karma: 4, happiness: -2 }),
      insult: (g, x) => {
        const back = pick(g, INSULTS)
        say(g, x, ['Burn', 'Roasted'], `You called ${x.s('who')} ${back}. Bystanders said "ooooh."`, `${uc(x.s('who'))} called me ${x.s('insult')}, so I called them ${back}.`, { happiness: 4, count: 'insults' })
      },
      assault: (g, x) => {
        const won = chance(g, 0.5 + g.character.hidden.athleticism / 300)
        const cops = g.character.age >= 14 && chance(g, 0.15)
        say(g, x, won ? 'Knockout' : 'Lost the fight', won ? `You punched ${x.s('who')} in the nose. They won't be insulting anyone for a while.${cops ? ' Then the police showed up.' : ''}` : `You swung at ${x.s('who')} and missed. They didn't miss.${cops ? ' Then the police showed up.' : ''}`, `I got into a fight with ${x.s('who')} who insulted me.`, { happiness: won ? 4 : -8, health: won ? -2 : -10, karma: -6, count: 'fights', arrest: cops ? { crime: 'Assault', severity: 1 } : undefined }, won ? 'neutral' : 'bad', '👊')
      },
      language: (g, x) => say(g, x, 'Polite', `You asked ${x.s('who')} to please watch their language. They called you a nerd and walked off.`, `I asked ${x.s('who')} to watch their language.`, { happiness: -2 }),
    },
  },
  {
    id: 'adult.witnessCrime',
    emoji: '👀',
    title: 'Witness',
    minAge: 12,
    maxAge: 90,
    setup: (g) => {
      const c = pick(g, crimesWitnessed(g))
      const who = stranger(g)
      return {
        text: `While walking downtown, you witness ${who} ${c.act}! What will you do?`,
        choices: [ch('intervene', 'Intervene'), ch('police', 'Call the police'), ch('ignore', 'Do nothing')],
        data: { who, act: c.act, crime: c.crime },
      }
    },
    resolve: {
      intervene: (g, x) => {
        const r = randInt(g, 1, 10)
        if (r <= 5) say(g, x, ['Vigilante', 'Hero of the street'], `You stopped ${x.s('who')} from ${x.s('act')}. A small crowd applauded.`, `I stopped ${x.s('who')} from ${x.s('act')}.`, { karma: 10, happiness: 8 }, 'good', '🦸')
        else if (r <= 8) say(g, x, 'Ignored', `You told ${x.s('who')} to stop. They laughed and carried on.`, `I tried to stop ${x.s('who')} from committing ${x.s('crime')}.`, { karma: 4, happiness: -2 })
        else say(g, x, 'Assaulted', `${uc(x.s('who'))} punched you in the face and ran off.`, `I was assaulted when I tried to stop ${x.s('who')} from committing ${x.s('crime')}.`, { karma: 6, health: -10, happiness: -8 }, 'bad', '🤕')
      },
      police: (g, x) => {
        const wanted = g.character.wantedLevel > 0 && chance(g, 0.4)
        if (wanted) return say(g, x, 'Plot twist', `The police arrived to arrest ${x.s('who')}... and recognized you from a wanted poster.`, 'I called the police on a criminal and got arrested myself.', { karma: 4, arrest: { crime: 'Outstanding Warrant', severity: 2 } }, 'bad', '🚓')
        const caught = chance(g, 0.5)
        say(g, x, caught ? 'Law enforcement FTW' : 'Too late', caught ? `The police arrived and caught ${x.s('who')} in the act!` : `By the time the police arrived, ${x.s('who')} was long gone.`, `I called the police on ${x.s('who')} for ${x.s('crime')}.`, { karma: caught ? 8 : 4 }, caught ? 'good' : 'neutral', '🚓')
      },
      ignore: (g, x) => say(g, x, 'Not my business', 'You kept walking. Not your circus, not your monkeys.', `I saw ${x.s('who')} committing ${x.s('crime')}. I couldn't be bothered to do anything.`, { karma: -4 }),
    },
  },
  {
    id: 'adult.timeshare',
    emoji: '🏝️',
    title: 'Free Breakfast',
    minAge: 30,
    maxAge: 90,
    when: (g) => g.character.money > 1000,
    setup: () => ({
      text: 'You were lured into a "free breakfast" that turned out to be a 4-hour timeshare presentation. The salesperson won\'t let you leave. What will you do?',
      choices: [ch('buy', 'Buy the timeshare'), ch('no', 'Keep saying no'), ch('escape', 'Fake a medical emergency')],
    }),
    resolve: {
      buy: (g) => {
        const cost = Math.min(Math.max(0, g.character.money), dollars(g, 4000, 15000))
        say(g, null, 'Locked in', `You signed a contract for ${money(cost)}. You now own one week a year at a resort you've never heard of.`, 'I bought a timeshare at a "free breakfast."', { money: -cost, happiness: -4, smarts: -6, count: 'purchases' }, 'bad')
      },
      no: (g) => say(g, null, 'Iron will', 'You said no 63 times. They finally released you with a free keychain. Victory.', 'I survived a timeshare presentation without buying anything.', { willpower: 6, happiness: 2 }, 'good'),
      escape: (g) => say(g, null, 'Oscar-worthy', "You clutched your chest and staggered out. You're pretty sure they're still calling an ambulance.", 'I faked a medical emergency to escape a timeshare presentation.', { happiness: 6, karma: -2 }),
    },
  },
])

function scratch(g: GameState, x: Parameters<typeof say>[1], n: number): void {
  const price = x?.n('price') || 5
  const cost = price * n
  if (g.character.money < cost) return say(g, x, 'Broke', "You don't have enough money for the scratch-offs. The clerk sighed.", null, {}, 'neutral', '💸')
  count(g, 'lotteryTickets', n)
  let won = 0
  for (let i = 0; i < n; i++) {
    const r = randInt(g, 1, 1000)
    if (r === 1) won += price * 2000
    else if (r <= 20) won += price * 20
    else if (r <= 150) won += price * 2
    else if (r <= 300) won += price
  }
  addMoney(g, -cost)
  if (won >= price * 2000) {
    addMoney(g, won)
    count(g, 'lotteryWins')
    say(g, x, ['JACKPOT!', 'Winner winner'], `You scratched off a ${money(won)} winner! The clerk fainted.`, `I won ${money(won)} on a scratch-off ticket.`, { happiness: 20 }, 'good', '🤑')
  } else if (won > cost) {
    addMoney(g, won)
    say(g, x, 'Winner!', `You won ${money(won)} on your scratch-offs. Profit!`, `I won ${money(won)} on scratch-off tickets.`, { happiness: 8 }, 'good', '🎉')
  } else if (won > 0) {
    addMoney(g, won)
    say(g, x, 'Broke even-ish', `You won back ${money(won)} of your ${money(cost)}. The house always wins.`, `I spent ${money(cost)} on scratch-offs and won back ${money(won)}.`, { happiness: -1 })
  } else {
    say(g, x, ['Better luck next time', 'Nothing'], `You scratched off ${n === 1 ? 'the ticket' : `all ${n} tickets`}. Nothing. Not even a free ticket.`, `I wasted ${money(cost)} on scratch-off tickets.`, { happiness: -4 }, 'bad')
  }
}

function give(g: GameState, amt: number, generous: boolean): void {
  if (g.character.money < amt) return say(g, null, 'Empty pockets', "You checked your pockets. You're practically broke yourself.", null, {})
  say(g, null, ['Generous', 'Kindness'], `You gave him ${money(amt)}. He said "bless you" and meant it.`, `I gave ${money(amt)} to a homeless man.`, { money: -amt, karma: generous ? 8 : 4, happiness: 4 }, 'good', '🙏')
}

function donate(g: GameState, cause: string, amt: number, big: boolean): void {
  if (g.character.money < amt) return say(g, null, 'Insufficient funds', "You'd love to donate, but your bank account says no.", null, {}, 'neutral', '💸')
  say(g, null, ['Philanthropist', 'Good karma'], `You donated ${money(amt)} to the ${cause}. You got a sticker!`, `I donated ${money(amt)} to the ${cause}.`, { money: -amt, karma: big ? 10 : 5, happiness: 4, count: 'donated' }, 'good', '💝')
}

function uc(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

