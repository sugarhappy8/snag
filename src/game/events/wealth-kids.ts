// What kids (and grandkids) ask a rich parent for, by age and era: pocket money, toys, a game
// console or a phone (only once they exist here), school trips, a car at driving age, spring
// break, university, a wedding, a house, seed money, bail, rehab and gambling debts. Spoiled kids
// ask for more and thank you less; see wealth-core entitlement.
import { notePerson } from '../people'
import { personCash } from '../cash'
import { addRelationship, log, notice, pronouns, scriptInput } from '../core'
import { chance, pick, randInt, uid } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { getCountry, randomFirstName, randomLastName } from '../world'
import { localPick, localTerm } from '../data/locales'
import { hasTech } from '../history/timeline'
import { brandsFor } from '../data/brands'
import { computerEra, computerModel } from '../computer/era'
import { bandName, byEra, cars, eraPick, eraPickPlain, flights, landline } from './era'
import { channel, folks, mayAsk, priced, scaled, spoiledLine, type Ask, type AskDef } from './wealth-ask'
import { changeWill, removeHeir } from './will-act'
import { queueTells } from './will-scenes'
import { holdsFamilyJob } from '../business/nepo-job'
import {
  addEntitlement,
  allowanceMax,
  allowanceNorm,
  allowanceVerdict,
  cap,
  carScale,
  electronicsScale,
  entitlement,
  goodsScale,
  housingScale,
  isDescendant,
  isKid,
  luxuryScale,
  money,
  myOf,
  perceivedWealth,
  personCountry,
  pocketWord,
  readPending,
  readTies,
  round,
  traitIn,
  updateTies,
  writePending,
  yourOf,
} from './wealth-core'
import type { GameState, Person } from '../types'

/** A kid with a real job at your company doesn't need rent money from you (their pay is the answer). */
function onPayroll(p: Person): boolean {
  return holdsFamilyJob(p) && p.age >= 18
}

function pr(p: Person) {
  return pronouns(p.gender)
}

/** "Your son Liam (16)" */
function who(p: Person): string {
  return `${cap(yourOf(p))} (${p.age})`
}

function kidsAged(g: GameState, lo: number, hi: number, grandkids = false): Person[] {
  return folks(g, (p) => (grandkids ? isDescendant(p) : isKid(p)), lo, hi).filter((p) => mayAsk(g, p))
}

function drivingAge(g: GameState, p: Person): number {
  return getCountry(personCountry(g, p)).drivingAge
}

/** Cars are a family thing here, or the family is rich enough to have one early. */
function carsOk(g: GameState, tier: number): boolean {
  return cars(g) || (tier >= 2 && g.year >= 1950)
}

export type CarType = 'economy' | 'luxury' | 'sports' | 'supercar'

const CAR_USD: Record<CarType, number> = { economy: 26_000, luxury: 68_000, sports: 140_000, supercar: 380_000 }

export function carLabel(g: GameState, type: CarType): string {
  switch (type) {
    case 'economy':
      return byEra(g, [['1975', 'a sensible little hatchback']], 'a sensible little car')
    case 'luxury':
      return 'a brand-new luxury sedan'
    case 'sports':
      return byEra(g, [['1930', 'a red convertible sports car']], 'a sporty roadster')
    case 'supercar':
      return byEra(g, [['1970', 'a low, loud supercar']], 'a hand-built racing roadster')
  }
}

export function carPrice(g: GameState, type: CarType, p?: Person): number {
  return round(CAR_USD[type] * carScale(g, type, p ? personCountry(g, p) : g.character.countryId))
}

/** The car a kid wants at this tier (spoiled kids aim one notch higher). */
function wantedCar(tier: number, p: Person): CarType {
  const order: CarType[] = ['economy', 'luxury', 'sports', 'supercar']
  const base = tier >= 4 ? 3 : tier >= 3 ? 2 : tier >= 2 ? 1 : 0
  return order[Math.min(3, base + (entitlement(p) >= 60 ? 1 : 0))]
}

/** A stable pick from the real-brand registry for this kid this year (no randomness, so asks stay reproducible). */
function houseFor(g: GameState, p: Person, categories: string[]): string | null {
  const pool = categories.flatMap((c) => brandsFor(g, c)).filter((b) => b.tier !== 'budget' && b.tier !== 'mass')
  if (!pool.length) return null
  let h = 0
  for (const ch of `${p.id}|${g.year}`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0
  return pool[Math.abs(h) % pool.length].name
}

function phoneItem(g: GameState): { label: string; usd: number } | null {
  if (hasTech(g, 'smartphone')) {
    // A kid asks for a mainstream phone, not a luxury one that costs ten times the ask.
    const maker = brandsFor(g, 'phone').find((b) => b.tier !== 'luxury' && b.tier !== 'ultra')?.name
    return { label: maker ? `the newest ${maker} smartphone` : 'the newest smartphone', usd: 1_300 }
  }
  if (hasTech(g, 'mobilePhone') && g.year >= 1992) return { label: 'a mobile phone of their own', usd: 700 }
  return null
}

const TOYS = [
  'a shiny new bicycle',
  '@1920 an electric train set',
  'a dollhouse with working lights',
  'a giant stuffed bear',
  '@1955 a remote-control car',
  '@1960 a trampoline',
  'a chemistry set (with the scary chemicals)',
  'a whole box of building blocks',
]

const LAVISH_TOYS = [
  'a real pony',
  'a treehouse with electricity and a doorbell',
  'a playhouse bigger than most apartments',
  '@1950 a go-kart track in the backyard',
  'a backyard ice rink',
]

const BUSINESS_IDEAS = [
  '@2008 a gourmet food truck',
  '@-2008 a lunch counter',
  'a bakery',
  'a recording studio',
  '@1980 a fitness studio',
  'a vintage clothing shop',
  'a car wash',
  '@1982,-2005 a video rental store',
  '@+internet,1997 a website that sells pet costumes',
  '@smartphone an app that rates other apps',
  'a boutique hotel',
  '@2010 a subscription box for socks',
]

const BAIL_REASONS = [
  'a bar fight over a karaoke song',
  '@cars street racing',
  'trespassing at a music festival',
  'shoplifting sunglasses they could easily afford',
  'a prank that got wildly out of hand',
  'climbing a statue in the town square',
]

/** Odds a kid's (or friend's) business pays you back, from who they are (no randomness). */
export function ventureOdds(p: Person): number {
  let o = 0.22 + p.stats.smarts / 400
  if (traitIn(p, 'ambitious', 'nerdy', 'serious')) o += 0.08
  if (traitIn(p, 'lazy', 'dramatic', 'gullible')) o -= 0.08
  o -= entitlement(p) / 400
  return Math.max(0.05, Math.min(0.5, Math.round(o * 100) / 100))
}

export const VENTURE_PARTIAL = 0.25

/** Start tracking an investment that pays out (or doesn't) in a few years. */
export function addVenture(g: GameState, a: Ask, name: string, amount: number, kind: 'venture' | 'tip' = 'venture', p?: Person): void {
  const list = readPending(g)
  list.push({
    id: uid(g, 'wv'),
    kind,
    pid: p?.id,
    name,
    what: a.what,
    amt: Math.max(0, Math.round(amount)),
    due: g.year + randInt(g, 2, 4),
    odds: a.odds ?? 0.1,
    partial: a.partial ?? VENTURE_PARTIAL,
    by: g.character.id,
  })
  writePending(g, list.slice(-12))
}

/** The slider input that lets the player pick an allowance amount (resolved by events/wealth-resolve.ts). */
export const POCKET_SCRIPT = 'wealth.pocket.set'

/**
 * Set someone's yearly allowance / support (0 stops it); it's paid automatically every year in
 * the wealth hook. Raising it pleases them; a lavish allowance spoils a kid a little right away
 * (and a little more every year it's paid). Reports with a popup.
 */
export function setAllowance(g: GameState, p: Person, amount: number): void {
  const amt = Math.max(0, Math.min(allowanceMax(g, p), Math.round(Number.isFinite(amount) ? amount : 0)))
  const before = readTies(g, p).allowance
  updateTies(g, p, (t) => {
    t.allowance = amt
    t.missed = 0
    if (p.age >= 18) t.adultOk = true
  })
  const word = p.age < 18 ? pocketWord(g) : isDescendant(p) ? 'allowance' : 'yearly support'
  const verdict = allowanceVerdict(g, p, amt)
  if (amt === before) {
    notice(g, cap(word), `${p.firstName}'s ${word} stays at ${money(amt)} a year.`, { emoji: '\u{1FA99}' })
    return
  }
  const ratio = amt / Math.max(1, allowanceNorm(g, p))
  if (amt > before) addRelationship(p, Math.min(8, 2 + Math.round(Math.log2(1 + (amt - before) / Math.max(1, allowanceNorm(g, p))) * 2)))
  else addRelationship(p, -Math.min(10, 2 + Math.round(((before - amt) / Math.max(1, before)) * 8)))
  if (isDescendant(p) && p.age < 30 && ratio > 2) addEntitlement(p, Math.min(8, Math.round(Math.log2(ratio) * 2)))
  if (amt === 0) {
    log(g, `I stopped ${myOf(p)}'s ${word}.`)
    notice(g, cap(word), `You stopped ${p.firstName}'s ${word}. ${p.age < 18 ? `${cap(pr(p).he)} slammed a door you didn't know could slam.` : `${cap(pr(p).he)} said "fine." It was not fine.`}`, { emoji: '\u{1FA99}' })
    return
  }
  const per = p.age < 18 ? `about ${money(Math.max(1, Math.round(amt / 52)))} a week` : `about ${money(Math.max(1, Math.round(amt / 12)))} a month`
  log(g, `I set ${myOf(p)}'s ${word} to ${money(amt)} a year.`)
  notice(g, cap(word), `You set ${p.firstName}'s ${word} to ${money(amt)} a year (${per}), paid automatically every year. ${verdict}.`, { emoji: '\u{1FA99}', tone: amt > before ? 'good' : 'neutral' })
}

/** relationships.ts asks a new adult's parent about tuition once (rel.child.tuition); don't ask twice in a year. */
function tuitionQueued(g: GameState, p: Person): boolean {
  return g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'rel.child.tuition' && !!m.data && typeof m.data === 'object' && !Array.isArray(m.data) && m.data.pid === p.id)
}

function markGift(g: GameState, p: Person, key: string): void {
  updateTies(g, p, (t) => {
    t.marks[key] = g.year
  })
}

export const KID_ASKS: AskDef[] = [
  {
    id: 'kid.pocket',
    minTier: 1,
    cooldown: 2,
    people: (g) => kidsAged(g, 6, 17),
    weight: (g, tier, p) => {
      if (!p) return 0
      const cur = readTies(g, p).allowance
      if (cur >= allowanceNorm(g, p) * 3 * (tier + 1)) return 0
      return cur > 0 ? 2.5 : 5
    },
    build: (g, tier, p) => {
      if (!p) return null
      const t = readTies(g, p)
      const norm = allowanceNorm(g, p)
      const want = round(Math.max(norm * (tier >= 3 ? 3 : tier >= 2 ? 2 : 1.5) * (1 + entitlement(p) / 100), t.allowance * 2))
      const word = pocketWord(g)
      const x = pr(p)
      const text =
        t.allowance > 0
          ? `${who(p)} wants a raise: ${x.his} ${word} from ${money(t.allowance)} to ${money(want)} a year. ${x.He} brought a chart.${spoiledLine(p)}`
          : `${who(p)} wants ${word === 'allowance' ? 'an allowance' : word}: ${money(want)} a year, "like everyone else at school gets." Everyone else does not get that.${spoiledLine(p)}`
      return { k: 'kid.pocket', pid: p.id, title: cap(word), emoji: '\u{1FA99}', text: channel(g, p) + text, amt: want, alt: norm > t.allowance ? norm : undefined, what: `more ${word}` }
    },
    custom: true,
    extras: [
      {
        id: 'set',
        ans: 'yes',
        label: (_g, a) => `Make it ${money(a.amt)} a year`,
        emoji: '\u{1F4B0}',
        run: (g, a, p) => {
          if (p) setAllowance(g, p, a.amt)
        },
      },
      {
        id: 'fair',
        ans: 'yes',
        label: (_g, a) => `Make it ${money(a.alt ?? a.amt)} a year (the usual for their age)`,
        emoji: '\u{2696}\u{FE0F}',
        show: (_g, a) => typeof a.alt === 'number' && a.alt > 0 && a.alt < a.amt,
        run: (g, a, p) => {
          if (p) setAllowance(g, p, a.alt ?? a.amt)
        },
      },
      {
        id: 'pick',
        ans: 'yes',
        label: () => 'Choose an amount...',
        emoji: '\u{1F39A}\u{FE0F}',
        run: (g, a, p) => {
          if (!p) return
          const max = allowanceMax(g, p)
          const cur = readTies(g, p).allowance
          scriptInput(g, {
            title: cap(pocketWord(g)),
            emoji: '\u{1FA99}',
            text: `How much ${pocketWord(g)} should ${p.firstName} get a year? ${cap(pr(p).he)} asked for ${money(a.amt)}; kids ${pr(p).his} age usually get about ${money(allowanceNorm(g, p))}.`,
            input: 'slider',
            money: true,
            min: 0,
            max,
            step: 1,
            defaultValue: String(Math.min(max, cur > 0 ? cur : allowanceNorm(g, p))),
            scriptId: POCKET_SCRIPT,
            data: { pid: p.id },
          })
        },
      },
    ],
    spoil: 6,
    thanks: 6,
    hurt: 4,
  },
  {
    id: 'kid.toy',
    minTier: 1,
    cooldown: 1,
    people: (g) => kidsAged(g, 4, 11, true),
    weight: () => 3,
    build: (g, tier, p) => {
      if (!p) return null
      const lavish = tier >= 3 && chance(g, 0.5)
      const item = eraPickPlain(g, lavish ? LAVISH_TOYS : TOYS)
      const amt = lavish ? priced(g, randInt(g, 6, 30) * 1_000 * goodsScale(g, personCountry(g, p)), 0.02) : round(randInt(g, 80, 400) * goodsScale(g, personCountry(g, p)) * (1 + entitlement(p) / 100))
      return { k: 'kid.toy', pid: p.id, title: 'Gimme', emoji: '\u{1F9F8}', text: `${channel(g, p)}${who(p)} wants ${item} (${money(amt)}). ${pickSite(g, [`${cap(pr(p).he)} asked forty times today.`, `${cap(pr(p).he)} drew you a picture of it. And of you, sad, without it.`, `${cap(pr(p).he)} says it's "for school."`], 0x8b5e3d94)}${spoiledLine(p)}`, amt, what: item, buy: true, small: !lavish }
    },
    spoil: 4,
    thanks: 5,
    hurt: 3,
  },
  {
    id: 'kid.console',
    minTier: 1,
    cooldown: 3,
    people: (g) => kidsAged(g, 8, 16, true),
    when: (g) => hasTech(g, 'videoGameConsole'),
    weight: () => 2,
    build: (g, _tier, p) => {
      if (!p) return null
      const amt = round(550 * electronicsScale(g, personCountry(g, p)))
      return { k: 'kid.console', pid: p.id, title: 'Game Console', emoji: '\u{1F3AE}', text: `${channel(g, p)}${who(p)} needs the newest game console (${money(amt)}). "Needs." ${cap(pr(p).his)} friends all have one, apparently including friends ${pr(p).he} has never mentioned before.${spoiledLine(p)}`, amt, what: 'a game console', buy: true, small: true }
    },
    spoil: 5,
    thanks: 7,
    hurt: 4,
  },
  {
    id: 'kid.phone',
    minTier: 1,
    cooldown: 3,
    people: (g) => kidsAged(g, 10, 17, true),
    when: (g) => phoneItem(g) !== null,
    weight: () => 3,
    build: (g, _tier, p) => {
      const item = phoneItem(g)
      if (!p || !item) return null
      const amt = round(item.usd * electronicsScale(g, personCountry(g, p)))
      const label = item.label.replace('their', pr(p).his)
      return { k: 'kid.phone', pid: p.id, title: 'A New Phone', emoji: '\u{1F4F1}', text: `${channel(g, p)}${who(p)} wants ${label} (${money(amt)}). ${pickSite(g, [`${cap(pr(p).his)} current one is "basically a brick."`, `${cap(pr(p).he)} says it's a safety thing. Mostly a games thing.`, `${cap(pr(p).he)} promised to call you more. ${cap(pr(p).he)} won't.`], 0xe925a2af)}${spoiledLine(p)}`, amt, what: item.label.replace(' of their own', ''), buy: true, small: true }
    },
    spoil: 5,
    thanks: 7,
    hurt: 5,
  },
  {
    id: 'kid.computer',
    minTier: 1,
    cooldown: 4,
    people: (g) => kidsAged(g, 11, 20, true),
    when: (g) => computerEra(g) !== 'none',
    weight: () => 1.5,
    build: (g, _tier, p) => {
      if (!p) return null
      const m = computerModel(g)
      const amt = round(m.usd * electronicsScale(g, personCountry(g, p)))
      return { k: 'kid.computer', pid: p.id, title: 'For School', emoji: m.emoji, text: `${channel(g, p)}${who(p)} needs ${m.noun} for school (${money(amt)}). For schoolwork. Definitely not for games.${spoiledLine(p)}`, amt, what: m.noun, buy: true, small: amt < perceivedWealth(g) * 0.002 }
    },
    spoil: 3,
    thanks: 7,
    hurt: 5,
  },
  {
    id: 'kid.trip',
    minTier: 1,
    cooldown: 1,
    people: (g) => kidsAged(g, 8, 17, true),
    weight: () => 2.5,
    build: (g, tier, p) => {
      if (!p) return null
      const abroad = tier >= 2 && flights(g) && p.age >= 12 && chance(g, 0.5)
      const place = abroad ? 'the class trip abroad' : `the school trip to ${localPick(g, 'landmark', personCountry(g, p)) || 'the capital'}`
      const amt = round((abroad ? randInt(g, 2_000, 4_000) : randInt(g, 150, 600)) * goodsScale(g, personCountry(g, p)))
      return { k: 'kid.trip', pid: p.id, title: 'Permission Slip', emoji: '\u{1F68C}', text: `${channel(g, p)}${who(p)} needs ${money(amt)} for ${place}. The permission slip is due tomorrow. It was due last week.`, amt, what: place.replace(/^the /, 'a '), small: !abroad }
    },
    spoil: 2,
    thanks: 5,
    hurt: 4,
  },
  {
    id: 'kid.camp',
    minTier: 1,
    cooldown: 2,
    people: (g) => kidsAged(g, 7, 15, true),
    weight: () => 1.2,
    build: (g, tier, p) => {
      if (!p) return null
      const fancy = tier >= 3
      const amt = round((fancy ? 12_000 : 3_000) * goodsScale(g, personCountry(g, p)))
      const camp = fancy ? pick(g, ['an equestrian camp', 'a sailing camp', 'a tennis camp with a former champion']) : pick(g, ['summer camp', 'sports camp', 'a science camp'])
      return { k: 'kid.camp', pid: p.id, title: 'Summer Camp', emoji: '\u{1F3D5}\u{FE0F}', text: `${channel(g, p)}${who(p)} wants to go to ${camp} this summer (${money(amt)}). Three weeks of lake, songs and mosquito bites.`, amt, what: camp, small: !fancy }
    },
    spoil: 2,
    thanks: 6,
    hurt: 3,
  },
  {
    id: 'kid.party',
    minTier: 2,
    cooldown: 3,
    people: (g) => kidsAged(g, 5, 17),
    weight: () => 1.5,
    build: (g, tier, p) => {
      if (!p) return null
      const sweet = g.character.countryId === 'us' && p.age >= 15 && p.age <= 16 && g.year >= 1950
      const what = sweet ? 'a sweet sixteen party' : p.age >= 13 ? 'a birthday party "everyone" will talk about' : eraPickPlain(g, ['a birthday party with a petting zoo', 'a birthday party with a magician and a pony', '@1960 a birthday party with a bouncy castle and a magician'])
      const amt = scaled(g, sweet ? 12_000 : 4_000, tier, p, 0.01)
      return { k: 'kid.party', pid: p.id, title: 'Party Planning', emoji: '\u{1F389}', text: `${channel(g, p)}${who(p)} wants ${what} (${money(amt)}). There is a theme. There is a guest list. You are on it, conditionally.${spoiledLine(p)}`, amt, what, less: true }
    },
    spoil: 7,
    thanks: 8,
    hurt: 6,
  },
  {
    id: 'kid.clothes',
    minTier: 2,
    cooldown: 2,
    people: (g) => kidsAged(g, 13, 22),
    weight: () => 1.5,
    build: (g, tier, p) => {
      if (!p) return null
      const amt = round(Math.min(perceivedWealth(g) * 0.005, 1_500 * luxuryScale(g, personCountry(g, p)) * (tier >= 3 ? 4 : 1.5) * (1 + entitlement(p) / 100)))
      const house = houseFor(g, p, ['fashion', 'sneakers'])
      const clothes = house ? `${house} clothes` : 'designer clothes'
      return { k: 'kid.clothes', pid: p.id, title: 'Fashion Emergency', emoji: '\u{1F45F}', text: `${channel(g, p)}${who(p)} needs ${house ? `a whole new ${house} wardrobe` : 'designer clothes'} (${money(amt)}). Nothing ${pr(p).he} owns is "wearable," which is a bold claim about a closet you paid for.${spoiledLine(p)}`, amt, what: clothes, less: true, small: amt < perceivedWealth(g) * 0.001 }
    },
    spoil: 7,
    thanks: 5,
    hurt: 4,
  },
  {
    id: 'kid.concert',
    minTier: 1,
    cooldown: 1,
    people: (g) => kidsAged(g, 13, 19, true),
    when: (g) => g.year >= 1925,
    weight: () => 1.5,
    build: (g, _tier, p) => {
      if (!p) return null
      const amt = round(randInt(g, 150, 450) * goodsScale(g, personCountry(g, p)))
      return { k: 'kid.concert', pid: p.id, title: 'Concert Tickets', emoji: '\u{1F3B5}', text: `${channel(g, p)}${who(p)} wants front-row tickets to see ${bandName(g)} (${money(amt)}). This is apparently "the most important night of ${pr(p).his} life." Again.`, amt, what: 'concert tickets', buy: true, small: true }
    },
    spoil: 4,
    thanks: 5,
    hurt: 3,
  },
  {
    id: 'kid.car',
    minTier: 1,
    cooldown: 4,
    prison: true,
    people: (g) => folks(g, isDescendant, 15, 25).filter((p) => p.age >= drivingAge(g, p) && mayAsk(g, p) && !readTies(g, p).car && (isKid(p) || g.year >= 1950)),
    when: (g, tier) => carsOk(g, tier),
    weight: (g, _tier, p) => (p && p.age === drivingAge(g, p) ? 6 : 2.5) * (p && p.relation === 'grandchild' ? 0.5 : 1),
    build: (g, tier, p) => {
      if (!p) return null
      const type = wantedCar(tier, p)
      const want = carPrice(g, type, p)
      const sensible = type === 'economy' ? undefined : carPrice(g, 'economy', p)
      const label = carLabel(g, type)
      const x = pr(p)
      const lead = p.age === drivingAge(g, p) ? `${who(p)} just got ${x.his} license and wants a car` : `${who(p)} wants a car`
      // From prison the ask comes by letter, so no brochures on pillows or walks past dealerships.
      const nudge = g.character.prison
        ? pickSite(g, [`${x.He} taped the brochure to the letter.`, `${x.He} promises to pick you up the day you get out. In style.`], 0x5e9ecc49)
        : pickSite(g, [`${x.He} left the brochure on your pillow.`, `${x.He} has been "accidentally" walking you past the dealership for weeks.`, `${x.He} promises to drive you places. You've seen ${x.him} parallel park.`], 0x8c58d526)
      return {
        k: 'kid.car',
        pid: p.id,
        title: 'Wheels',
        emoji: '\u{1F697}',
        text: `${channel(g, p)}${lead}: ${label} (${money(want)}). ${nudge}${spoiledLine(p)}`,
        amt: want,
        what: label,
        buy: true,
        giveLabel: `Buy ${label.replace(/^an? /, 'the ')}`,
        alt: sensible,
        altWhat: carLabel(g, 'economy'),
        altLabel: 'Buy a sensible car instead',
        x: { type, sensibleType: 'economy' },
      }
    },
    onGive: (g, a, p, amount, full) => {
      if (!p) return ''
      const label = full ? a.what : a.altWhat ?? a.what
      updateTies(g, p, (t) => {
        t.car = { label, price: amount, year: g.year }
        t.marks['gift.car'] = g.year
      })
      notePerson(p, `Got ${label} from you at ${p.age}.`)
      if (!full && entitlement(p) >= 50) return `${cap(pr(p).he)} called it "fine" and parked it around the corner so nobody would see it.`
      return ''
    },
    spoil: 12,
    thanks: 15,
    hurt: 9,
  },
  {
    id: 'kid.newcar',
    minTier: 2,
    cooldown: 3,
    people: (g) => folks(g, isDescendant, 16, 30).filter((p) => mayAsk(g, p, 1) && !readTies(g, p).car && (readTies(g, p).marks.crash ?? 0) >= g.year - 2 && entitlement(p) >= 35),
    when: (g, tier) => carsOk(g, tier),
    weight: () => 5,
    build: (g, tier, p) => {
      if (!p) return null
      const type = wantedCar(Math.min(4, tier + 1), p)
      const want = carPrice(g, type, p)
      const label = carLabel(g, type)
      return { k: 'kid.newcar', pid: p.id, title: 'About the Car...', emoji: '\u{1F4A5}', text: `${channel(g, p)}${who(p)} wants a replacement for the car ${pr(p).he} wrecked. ${cap(pr(p).he)} has "learned a lot" and would now like ${label} (${money(want)}).${spoiledLine(p)}`, amt: want, what: label, buy: true, giveLabel: `Buy ${label.replace(/^an? /, 'the ')}`, alt: carPrice(g, 'economy', p), altWhat: carLabel(g, 'economy'), altLabel: 'Buy a sensible car instead' }
    },
    onGive: (g, a, p, amount, full) => {
      if (!p) return ''
      const label = full ? a.what : a.altWhat ?? a.what
      updateTies(g, p, (t) => {
        t.car = { label, price: amount, year: g.year }
        t.marks['gift.car'] = g.year
      })
      return ''
    },
    spoil: 14,
    thanks: 8,
    hurt: 6,
  },
  {
    id: 'kid.vacation',
    cash: true,
    minTier: 1,
    cooldown: 2,
    people: (g) => kidsAged(g, 16, 25, true),
    weight: () => 2,
    build: (g, tier, p) => {
      if (!p) return null
      const us = personCountry(g, p) === 'us' && g.year >= 1960
      const gap = p.age >= 18 && p.age <= 20 && g.year >= 1970 && flights(g) && chance(g, 0.3)
      const what = gap ? 'a gap year traveling the world' : us ? 'spring break at the beach with friends' : flights(g) ? 'a summer trip abroad with friends' : `a summer trip to ${localPick(g, 'getaway', personCountry(g, p)) || 'the coast'} with friends`
      const amt = scaled(g, gap ? 15_000 : 2_500, tier, p, 0.01)
      return { k: 'kid.vacation', pid: p.id, title: 'Vacation Money', emoji: '\u{1F3D6}\u{FE0F}', text: `${channel(g, p)}${who(p)} wants money for ${what} (${money(amt)}). ${pickLine(g, ['The itinerary is mostly "vibes."', 'You were not invited. You were invoiced.', 'It will be "educational."'])}${spoiledLine(p)}`, amt, what, less: true }
    },
    spoil: 6,
    thanks: 7,
    hurt: 5,
  },
  {
    id: 'kid.tuition',
    minTier: 1,
    cooldown: 2,
    prison: true,
    // Not in the year the family module already asked about this kid's tuition (still in the queue).
    people: (g) => folks(g, isDescendant, 18, 23).filter((p) => p.occupation === 'University Student' && p.data.collegePaid !== true && mayAsk(g, p, 1) && !tuitionQueued(g, p)),
    weight: (_g, _tier, p) => (p && p.data.tuitionAsked === true ? 4 : 2),
    build: (g, tier, p) => {
      if (!p) return null
      const free = getCountry(personCountry(g, p)).freeUniversity
      const base = free ? 12_000 : tier >= 3 ? 70_000 : 40_000
      const amt = round(base * goodsScale(g, personCountry(g, p)))
      const uni = localTerm(g, 'university', personCountry(g, p))
      const text = free
        ? `${who(p)} asked if you'd cover rent and living costs while ${pr(p).he} studies (${money(amt)} a year). The ${uni} is free; the city is not.`
        : `${who(p)} asked if you'd pay this year's ${uni} tuition (${money(amt)}). ${tier >= 3 ? `It's the fancy one with the ivy and the rowing team.` : 'The alternative is a student loan with a terrifying interest rate.'}`
      return { k: 'kid.tuition', pid: p.id, title: free ? 'Living Costs' : 'Tuition', emoji: '\u{1F393}', text: channel(g, p) + text, amt, what: free ? 'living costs at university' : 'university tuition', less: true }
    },
    onGive: (_g, _a, p, _amount, full) => {
      if (!p) return ''
      if (full) p.data.collegePaid = true
      return full ? `${cap(pr(p).he)} promised to study hard (and only party a medium amount).` : ''
    },
    onNo: (_g, _a, p) => (p ? `${cap(pr(p).he)} will be working nights to cover it.` : ''),
    need: true,
    spoil: 0,
    thanks: 12,
    hurt: 10,
  },
  {
    id: 'kid.gradschool',
    minTier: 1,
    cooldown: 6,
    people: (g) => folks(g, isKid, 22, 30).filter((p) => p.stats.smarts >= 55 && p.data.gradPaid !== true && mayAsk(g, p)),
    when: (g) => g.year >= 1930,
    weight: () => 1,
    build: (g, _tier, p) => {
      if (!p) return null
      const school = pick(g, ['law school', 'medical school', 'business school', 'a PhD program'])
      const amt = round(65_000 * goodsScale(g, personCountry(g, p)) * (getCountry(personCountry(g, p)).freeUniversity ? 0.4 : 1))
      return { k: 'kid.gradschool', pid: p.id, title: 'Back to School', emoji: '\u{1F4DA}', text: `${channel(g, p)}${who(p)} got into ${school} and asked for help with the costs (${money(amt)}). ${cap(pr(p).he)} called it "an investment." In ${pr(p).his} defense, it kind of is.`, amt, what: school, less: true }
    },
    onGive: (_g, _a, p, _amount, full) => {
      if (!p) return ''
      if (full) p.data.gradPaid = true
      p.stats.smarts = Math.min(100, p.stats.smarts + 4)
      return ''
    },
    spoil: 0,
    thanks: 10,
    hurt: 7,
  },
  {
    id: 'kid.rent',
    cash: true,
    minTier: 1,
    cooldown: 2,
    prison: true,
    people: (g) => kidsAged(g, 18, 32).filter((p) => !p.livesWithPlayer && (readTies(g, p).marks['gift.house'] ?? 0) === 0 && !onPayroll(p)),
    weight: () => 2,
    build: (g, tier, p) => {
      if (!p) return null
      const amt = scaled(g, 9_000 * housingScale(g, personCountry(g, p)), Math.min(tier, 2), p, 0.01)
      const why = pickLine(g, ['a deposit on an apartment', 'rent until the new job starts', 'rent, because the roommate "moved to find himself"', 'the first and last month on a new place'])
      return { k: 'kid.rent', pid: p.id, title: 'Rent', emoji: '\u{1F3E0}', text: `${channel(g, p)}${who(p)} asked for help with ${why} (${money(amt)}).${spoiledLine(p)}`, amt, what: 'help with rent', less: true, lend: true }
    },
    spoil: 3,
    thanks: 6,
    hurt: 6,
  },
  {
    id: 'kid.wedding',
    minTier: 1,
    cooldown: 6,
    people: (g) => kidsAged(g, 22, 42).filter((p) => p.data.married !== true),
    weight: () => 1.3,
    build: (g, tier, p) => {
      if (!p) return null
      const spouseGender = chance(g, 0.92) ? (p.gender === 'male' ? 'female' : 'male') : p.gender
      const spouse = `${randomFirstName(g, personCountry(g, p), spouseGender)} ${randomLastName(g, personCountry(g, p))}`
      const amt = scaled(g, 30_000, tier, p, 0.03)
      return { k: 'kid.wedding', pid: p.id, title: 'Wedding Bells', emoji: '\u{1F492}', text: `${channel(g, p)}${who(p)} is engaged to ${spouse}! ${cap(pr(p).he)} asked if you'd pay for the wedding (${money(amt)}). There will be a string quartet. There will be a swan, possibly two.${spoiledLine(p)}`, amt, what: 'the wedding', less: true, x: { spouse } }
    },
    onGive: (_g, a, p) => {
      if (!p) return ''
      const spouse = typeof a.x?.spouse === 'string' ? a.x.spouse : ''
      if (spouse && p.data.married !== true) {
        p.data.married = true
        p.data.spouseName = spouse
        notePerson(p, `Married ${spouse} at age ${p.age}; you paid for the wedding.`)
      }
      return 'You cried during the vows. Everyone pretended not to notice.'
    },
    onNo: (_g, a, p) => {
      if (!p) return ''
      const spouse = typeof a.x?.spouse === 'string' ? a.x.spouse : ''
      if (spouse && p.data.married !== true) {
        p.data.married = true
        p.data.spouseName = spouse
        notePerson(p, `Married ${spouse} at age ${p.age} in a small ceremony.`)
      }
      return `They got married anyway, in a small ceremony. ${cap(pr(p).he)} mentioned the price of the cake you didn't pay for twice in the toast.`
    },
    spoil: 2,
    thanks: 15,
    hurt: 12,
  },
  {
    id: 'kid.house',
    minTier: 1,
    cooldown: 5,
    people: (g) => kidsAged(g, 23, 55, true).filter((p) => p.age >= 23 && (readTies(g, p).marks['gift.house'] ?? 0) === 0),
    weight: (_g, tier) => 1 + tier * 0.5,
    build: (g, tier, p) => {
      if (!p) return null
      const base = tier >= 3 ? 1_200_000 : 450_000
      const house = round(base * housingScale(g, personCountry(g, p)))
      const whole = Math.min(house, round(Math.max(house * 0.2, perceivedWealth(g) * 0.15)))
      const deposit = round(Math.min(whole, house * 0.2))
      const married = p.data.married === true
      const what = married && typeof p.data.kids === 'number' && p.data.kids > 0 ? 'a bigger house for the grandkids' : 'a place of their own'
      if (whole < house) {
        return { k: 'kid.house', pid: p.id, title: 'House Hunting', emoji: '\u{1F3E1}', text: `${channel(g, p)}${who(p)} found ${what.replace('their', pr(p).his)} and asked for help with the deposit (${money(deposit)}). The listing calls it "cozy," which means small.`, amt: deposit, what: 'a house deposit', less: true, lend: true }
      }
      return {
        k: 'kid.house',
        pid: p.id,
        title: 'House Hunting',
        emoji: '\u{1F3E1}',
        text: `${channel(g, p)}${who(p)} wants ${what.replace('their', pr(p).his)} (${money(house)}). ${cap(pr(p).he)} asked if you'd "help." ${cap(pr(p).he)} meant the deposit (${money(deposit)}). ${cap(pr(p).he)} would not say no to the whole thing.${spoiledLine(p)}`,
        amt: house,
        what: 'a house',
        giveLabel: 'Buy them the house',
        alt: deposit,
        altWhat: 'a house deposit',
        altLabel: 'Pay the deposit',
      }
    },
    onGive: (g, _a, p, amount, full) => {
      if (!p) return ''
      markGift(g, p, 'gift.house')
      p.livesWithPlayer = false
      p.data.movedOut = true
      notePerson(p, full ? `You bought ${pr(p).him} a house at ${p.age}.` : `You helped with the deposit on ${pr(p).his} house at ${p.age} (${amount > 0 ? 'a big help' : 'a gesture'}).`)
      return ''
    },
    spoil: 8,
    thanks: 18,
    hurt: 9,
  },
  {
    id: 'kid.business',
    minTier: 1,
    cooldown: 6,
    people: (g) => kidsAged(g, 20, 55).filter((p) => !readPending(g).some((x) => x.pid === p.id)),
    weight: () => 1.3,
    build: (g, tier, p) => {
      if (!p) return null
      const idea = eraPickPlain(g, BUSINESS_IDEAS)
      const amt = scaled(g, 45_000, tier, p, 0.05)
      return { k: 'kid.business', pid: p.id, title: 'Seed Money', emoji: '\u{1F4A1}', text: `${channel(g, p)}${who(p)} wants seed money to start ${idea} (${money(amt)}). There's a business plan. Page one is the logo.`, amt, what: idea, less: true, odds: ventureOdds(p), partial: VENTURE_PARTIAL }
    },
    onGive: (g, a, p, amount) => {
      if (!p) return ''
      addVenture(g, a, yourOf(p), amount, 'venture', p)
      notePerson(p, `Started ${a.what} with your money at ${p.age}.`)
      return 'Now you wait and see.'
    },
    spoil: 1,
    thanks: 10,
    hurt: 8,
  },
  {
    id: 'kid.bail',
    minTier: 1,
    cooldown: 5,
    prison: true,
    people: (g) => kidsAged(g, 16, 45, true).filter((p) => p.age >= 16),
    weight: (_g, _tier, p) => 0.5 * (1 + (p ? entitlement(p) : 0) / 30),
    build: (g, tier, p) => {
      if (!p) return null
      const why = eraPick(g, BAIL_REASONS)
      const amt = scaled(g, 8_000, Math.min(tier, 2), p, 0.01)
      const call = landline(g)
      const how = g.character.prison
        ? `With you behind bars yourself, it's a family tradition now.`
        : call
          ? `${cap(pr(p).he)} used ${pr(p).his} one call on you, which is touching, in a way.`
          : `${cap(pr(p).he)} sent a constable to your door with the news, which the neighbors enjoyed.`
      return { k: 'kid.bail', pid: p.id, title: call && !g.character.prison ? 'One Phone Call' : 'Bail', emoji: '\u{1F6A8}', text: `${channel(g, p)}${who(p)} was arrested for ${why} and needs bail (${money(amt)}). ${how}`, amt, what: 'bail' }
    },
    onGive: (g, _a, p) => {
      if (!p) return ''
      notePerson(p, `You bailed ${pr(p).him} out at ${p.age}.`)
      return g.character.prison
        ? `${cap(pr(p).he)} wrote back to say thanks, and to ask if you could also cover the impound fees.`
        : `${cap(pr(p).he)} walked out, hugged you and asked if you could also cover the impound fees.`
    },
    onNo: (g, _a, p) => {
      if (!p) return ''
      p.stats.happiness = Math.max(0, p.stats.happiness - randInt(g, 5, 15))
      notePerson(p, `Spent time in a cell at ${p.age} when you wouldn't post bail.`)
      return `${cap(pr(p).he)} spent a few weeks in a cell with a man named Tiny who wasn't. ${cap(pr(p).he)} came out quieter.`
    },
    need: true,
    spoil: 8,
    thanks: 10,
    hurt: 14,
  },
  {
    id: 'kid.rehab',
    minTier: 1,
    cooldown: 6,
    people: (g) => kidsAged(g, 18, 50, true).filter((p) => p.age >= 18),
    when: (g) => g.year >= 1940,
    weight: (_g, _tier, p) => 0.35 * (1 + (p ? entitlement(p) : 0) / 30),
    build: (g, tier, p) => {
      if (!p) return null
      const place = byEra(g, [['1970', tier >= 3 ? 'a luxury rehab clinic with an ocean view' : 'a good rehab clinic']], 'a quiet sanatorium in the mountains')
      const amt = scaled(g, 25_000, Math.min(tier, 3), p, 0.02)
      return { k: 'kid.rehab', pid: p.id, title: 'Getting Help', emoji: '\u{1F3E5}', text: `${channel(g, p)}${who(p)} has been partying way too hard. ${cap(pr(p).he)} finally agreed to go to ${place}, if you pay (${money(amt)}).`, amt, what: 'rehab' }
    },
    onGive: (g, _a, p) => {
      if (!p) return ''
      p.stats.health = Math.min(100, p.stats.health + randInt(g, 10, 20))
      addEntitlement(p, -5)
      notePerson(p, `Got sober at ${p.age}; you paid for treatment.`)
      return `${cap(pr(p).he)} came back clear-eyed and wrote you a letter you will keep forever.`
    },
    onNo: (g, _a, p) => {
      if (!p) return ''
      p.stats.health = Math.max(0, p.stats.health - randInt(g, 5, 12))
      return `${cap(pr(p).he)} says ${pr(p).he} will "cut back." ${cap(pr(p).he)} did not cut back.`
    },
    need: true,
    spoil: 0,
    thanks: 8,
    hurt: 8,
  },
  {
    id: 'kid.gamble',
    minTier: 1,
    cooldown: 5,
    people: (g) => kidsAged(g, 18, 50, true).filter((p) => p.age >= 18),
    weight: (_g, _tier, p) => 0.4 * (1 + (p ? entitlement(p) : 0) / 30),
    build: (g, tier, p) => {
      if (!p) return null
      const how = eraPick(g, ['a poker game that got out of hand', 'a very bad night at the horse track', '@smartphone a losing streak on a sports betting app', '@1931 a weekend in a casino town', 'a "can\'t lose" bet on the big game'])
      const amt = scaled(g, 6_000, tier, p, 0.01)
      return { k: 'kid.gamble', pid: p.id, title: 'In Over Their Head', emoji: '\u{1F3B2}', text: `${channel(g, p)}${who(p)} owes ${money(amt)} after ${how}. The people ${pr(p).he} owes are not famous for their patience.${spoiledLine(p)}`, amt, what: 'a gambling debt', lend: true }
    },
    onNo: (g, _a, p) => {
      if (!p) return ''
      const t = readTies(g, p)
      if (t.car) {
        updateTies(g, p, (x) => {
          x.car = null
        })
        return `${cap(pr(p).he)} sold the car you bought ${pr(p).him} to pay it off.`
      }
      personCash(g, p, Math.max(0, Math.round(p.money * 0.5)) - p.money, 'gamble', 0)
      return `${cap(pr(p).he)} sold most of what ${pr(p).he} owns to pay it off.`
    },
    spoil: 10,
    thanks: 8,
    hurt: 8,
  },
  {
    id: 'kid.inherit',
    cash: true,
    minTier: 2,
    cooldown: 8,
    people: (g) => kidsAged(g, 25, 80).filter((p) => entitlement(p) >= 50),
    when: (g) => g.character.age >= 58,
    weight: () => 2,
    build: (g, _tier, p) => {
      if (!p) return null
      const amt = round(perceivedWealth(g) * 0.03)
      return { k: 'kid.inherit', pid: p.id, title: 'Early Inheritance', emoji: '\u{1F4DC}', text: `${channel(g, p)}${who(p)} asked for ${pr(p).his} inheritance early (${money(amt)}). "You're not using it." You are, in fact, still alive and using it.${spoiledLine(p)}`, amt, what: 'an early inheritance', less: true }
    },
    extras: [
      {
        id: 'cut',
        ans: 'no',
        label: (_g, _a, p) => `Write ${p ? p.firstName : 'them'} out of the will`,
        emoji: '\u{2702}\u{FE0F}',
        show: (g, _a, p) => !!p && g.people.some((q) => q.alive && q.id !== p.id && isKid(q)),
        run: (g, _a, p) => {
          if (!p) return
          cutFromWill(g, p)
        },
      },
    ],
    spoil: 12,
    thanks: 6,
    hurt: 12,
  },
  {
    id: 'kid.willfight',
    noNo: true,
    minTier: 2,
    cooldown: 10,
    people: (g) => kidsAged(g, 25, 80).filter((p) => entitlement(p) >= 50),
    when: (g) => g.character.age >= 60 && g.people.filter((q) => q.alive && isKid(q) && q.age >= 18).length >= 2,
    weight: () => 1.2,
    build: (_g, _tier, p) => {
      if (!p) return null
      return { k: 'kid.willfight', pid: p.id, title: 'The Will', emoji: '\u{2696}\u{FE0F}', text: `Your kids are already fighting over your will. ${cap(yourOf(p))} has claimed the house, the good china and "probably the boat." The others have hired a lawyer named Chad.`, amt: 0, what: 'a fight over the will' }
    },
    custom: true,
    extras: [
      {
        id: 'even',
        label: () => 'Promise equal shares',
        emoji: '\u{2696}\u{FE0F}',
        run: (g, _a, p) => {
          g.character.willBeneficiaries = []
          for (const q of g.people) if (q.alive && isKid(q)) q.relationship = Math.max(0, Math.min(100, q.relationship + (p && q.id === p.id ? -6 : 3)))
          willNotice(g, 'You told them everything will be split evenly. The lawyer named Chad was disappointed.')
        },
      },
      {
        id: 'favor',
        label: (_g, _a, p) => `Leave ${p ? p.firstName : 'the loud one'} less`,
        emoji: '\u{2702}\u{FE0F}',
        show: (g, _a, p) => !!p && g.people.some((q) => q.alive && q.id !== p.id && isKid(q)),
        run: (g, _a, p) => {
          if (p) cutFromWill(g, p)
        },
      },
      {
        id: 'spend',
        label: () => '"I\'m spending it all first"',
        emoji: '\u{1F6E5}\u{FE0F}',
        run: (g) => {
          for (const q of g.people) if (q.alive && isKid(q)) q.relationship = Math.max(0, q.relationship - 3)
          g.character.stats.happiness = Math.min(100, g.character.stats.happiness + 4)
          willNotice(g, 'You announced you plan to spend every last cent before you go. The fighting stopped. The worrying began.')
        },
      },
    ],
  },
]

function willNotice(g: GameState, text: string): void {
  notice(g, 'The Will', text, { emoji: '\u{1F4DC}' })
}

/** Leave one kid out of the will: the other living kids become the named beneficiaries. */
export function cutFromWill(g: GameState, p: Person): void {
  const others = g.people.filter((q) => q.alive && q.id !== p.id && isKid(q))
  if (!others.length) {
    willNotice(g, `${cap(yourOf(p))} is your only child. Cutting ${pr(p).him} out would leave everything to the government.`)
    return
  }
  // changeWill starts an empty will from the default children, while removeHeir preserves anyone
  // already named (a spouse or selected children) and records the cut for the feud system. If the
  // target was the sole named beneficiary, explicitly name the other children: leaving the list
  // empty would mean "divide evenly among every child" and silently put the target back in line.
  const report = changeWill(g, (gg, w) => {
    removeHeir(gg, w, p)
    if (gg.character.willBeneficiaries.length === 0) gg.character.willBeneficiaries = others.map((q) => q.id)
  })
  const heirs = g.character.willBeneficiaries.map((id) => g.people.find((q) => q.id === id)?.firstName).filter((n): n is string => !!n)
  addEntitlement(p, -15)
  notePerson(p, `You wrote ${pr(p).him} out of your will.`)
  const learned = report.lines.length ? ` ${report.lines.join(' ')}` : ''
  willNotice(g, `You rewrote your will: ${heirs.join(' and ')} will inherit; ${p.firstName} won't.${learned}`)
  queueTells(g, report)
}
