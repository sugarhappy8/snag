// What the rest of the family asks a rich relative for: the partner's lifestyle (luxury trips,
// jewelry, renovations, a bigger house, a postnup talk), parents' medical bills and retirement,
// siblings' failing restaurants, in-laws, the cousin with a can't-miss investment, relatives you
// have never met at the door, and family abroad asking you to send money home.
import { addRelationship, notice, pronouns, spouse as spouseOf } from '../core'
import { notePerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { getCountry, randomFirstName, randomLastName } from '../world'
import { byEra, eraPickPlain, landline } from './era'
import { channel, folks, mayAsk, scaled, type AskDef } from './wealth-ask'
import { addVenture, carLabel, carPrice, ventureOdds, VENTURE_PARTIAL } from './wealth-kids'
import {
  cap,
  housingScale,
  isAbroad,
  isKid,
  isParent,
  isPartner,
  isSibling,
  luxuryScale,
  money,
  perceivedWealth,
  personCountry,
  round,
  typicalIncome,
  updateTies,
  yourOf,
} from './wealth-core'
import type { GameState, Person } from '../types'

function pr(p: Person) {
  return pronouns(p.gender)
}

function who(p: Person): string {
  return cap(yourOf(p))
}

/** The player's home, if they own the place they live in. */
function ownedHome(g: GameState) {
  const r = g.character.residence
  if (r.status !== 'owned' || !r.assetId) return undefined
  return g.assets.find((a) => a.id === r.assetId && a.kind === 'house')
}

/** "Your mother-in-law Ngozi": a spouse's parent who isn't in your contacts. */
function inLaw(g: GameState, sp: Person): { name: string; gender: 'male' | 'female' } {
  const gender = chance(g, 0.5) ? 'male' : 'female'
  return { name: `your ${gender === 'male' ? 'father' : 'mother'}-in-law ${randomFirstName(g, personCountry(g, sp), gender)}`, gender }
}

function cousin(g: GameState): { name: string; first: string } {
  const gender = chance(g, 0.5) ? 'male' : 'female'
  const first = randomFirstName(g, g.character.countryId, gender)
  return { name: `your cousin ${first}`, first }
}

const PARTNER_TRIPS = [
  'a week at a five-star resort',
  '@flights a private island getaway',
  '@flights a first-class trip around the world',
  'a month on a luxury yacht charter',
  '@flights a ski chalet for the winter season',
  '@-1960 a grand tour on an ocean liner',
]

const JEWELRY_F = ['a diamond necklace', 'a ruby bracelet', 'a watch that costs more than a car', 'emerald earrings', 'a pearl choker "like the old movie stars"']
const JEWELRY_M = ['a watch that costs more than a car', 'gold cufflinks', 'a diamond tie pin', 'a signet ring with a family crest you just made up']

const RESTAURANT = ['restaurant', 'bakery', 'bar', 'barbershop', 'hardware store', 'bowling alley']

const TIPS = [
  'shares in a gold mine nobody has seen',
  'a sure-thing racehorse',
  '@crypto a brand-new coin',
  '@1933 a chain of drive-in theaters',
  'beachfront land that is mostly sea',
  '@+internet,1996 a revolutionary website',
  'a perpetual motion machine (prototype pending)',
  'ostrich farming',
]

export const FAMILY_ASKS: AskDef[] = [
  // ----- Spouse / partner ----------------------------------------------------
  {
    id: 'partner.trip',
    minTier: 1,
    cooldown: 2,
    people: (g) => folks(g, isPartner, 18).filter((p) => mayAsk(g, p)),
    weight: () => 2.5,
    build: (g, tier, p) => {
      if (!p) return null
      const trip = eraPickPlain(g, PARTNER_TRIPS)
      const amt = scaled(g, 12_000, tier, p, 0.02)
      return { k: 'partner.trip', pid: p.id, title: 'Getaway', emoji: '\u{1F3DD}\u{FE0F}', text: `${channel(g, p)}${who(p)} has been "so stressed" and thinks ${trip} would help (${money(amt)}). ${pick(g, [`${cap(pr(p).he)} already packed.`, `There's a brochure taped to the bathroom mirror.`, `${cap(pr(p).he)} says you can come too, if you behave.`])}${postnupLine(g, p)}`, amt, what: trip, less: true }
    },
    onGive: (g, _a, p) => {
      if (!p) return ''
      g.character.stats.happiness = Math.min(100, g.character.stats.happiness + 3)
      return `${cap(pr(p).he)} came back tanned, rested and already planning the next one.`
    },
    thanks: 9,
    hurt: 6,
  },
  {
    id: 'partner.jewelry',
    minTier: 1,
    cooldown: 2,
    people: (g) => folks(g, isPartner, 18).filter((p) => mayAsk(g, p)),
    weight: () => 2,
    build: (g, tier, p) => {
      if (!p) return null
      const item = pick(g, p.gender === 'male' ? JEWELRY_M : JEWELRY_F)
      const amt = round(Math.min(perceivedWealth(g) * 0.02, 6_000 * luxuryScale(g, personCountry(g, p)) * [1, 1, 2.5, 6, 15][tier]))
      return { k: 'partner.jewelry', pid: p.id, title: 'Sparkle', emoji: '\u{1F48E}', text: `${channel(g, p)}${who(p)} has been admiring ${item} (${money(amt)}). Loudly. At dinner. In front of the waiter.${postnupLine(g, p)}`, amt, what: item, buy: true }
    },
    thanks: 9,
    hurt: 6,
  },
  {
    id: 'partner.reno',
    minTier: 1,
    cooldown: 4,
    people: (g) => folks(g, isPartner, 18).filter((p) => mayAsk(g, p) && p.livesWithPlayer),
    when: (g) => !!ownedHome(g) && !g.character.prison,
    weight: () => 1.8,
    build: (g, tier, p) => {
      const home = ownedHome(g)
      if (!p || !home) return null
      const room = pick(g, ['the kitchen', 'the bathrooms', 'the whole ground floor', 'the backyard (with a pool)', 'the attic into a home theater'])
      const amt = round(Math.min(Math.max(home.value * 0.15, 20_000 * housingScale(g)) * (tier >= 3 ? 2 : 1), perceivedWealth(g) * 0.05))
      return { k: 'partner.reno', pid: p.id, title: 'Renovation', emoji: '\u{1F6E0}\u{FE0F}', text: `${who(p)} wants to redo ${room} (${money(amt)}). ${cap(pr(p).he)} has a mood board. You are not on the mood board.`, amt, what: `renovating ${room}`, less: true, x: { assetId: home.id } }
    },
    onGive: (g, a, _p, amount) => {
      const id = typeof a.x?.assetId === 'string' ? a.x.assetId : ''
      const home = g.assets.find((x) => x.id === id)
      if (!home) return ''
      // Renovations add some resale value, never as much as they cost.
      home.value = Math.round(home.value + amount * 0.5)
      home.condition = Math.min(100, home.condition + 15)
      return 'It took twice as long as promised. It looks amazing.'
    },
    thanks: 8,
    hurt: 5,
  },
  {
    id: 'partner.house',
    noLabel: 'Tell them the house is fine',
    minTier: 2,
    cooldown: 6,
    people: (g) => folks(g, isPartner, 18).filter((p) => mayAsk(g, p) && p.livesWithPlayer),
    when: (g) => !g.character.prison && (!ownedHome(g) || (ownedHome(g)?.value ?? 0) < perceivedWealth(g) * 0.04),
    weight: () => 1.5,
    build: (g, _tier, p) => {
      if (!p) return null
      return { k: 'partner.house', pid: p.id, title: 'More Room', emoji: '\u{1F3DB}\u{FE0F}', text: `${who(p)} says your place is "fine for normal people." ${cap(pr(p).he)} wants a bigger house: a real one, with a wing. ${cap(pr(p).he)} has already been to three open houses without you.${postnupLine(g, p)}`, amt: 0, what: 'a bigger house' }
    },
    custom: true,
    extras: [
      {
        id: 'hunt',
        label: () => 'Start house hunting together',
        emoji: '\u{1F3E1}',
        run: (g, _a, p) => {
          if (!p) return
          addRelationship(p, randInt(g, 4, 8))
          notice(g, 'More Room', `You promised ${p.firstName} you'd look at bigger places together. The listings are under Assets › Real Estate. ${cap(pr(p).he)} has already bookmarked twelve.`, { emoji: '\u{1F3E1}', tone: 'good' })
        },
      },
    ],
    hurt: 6,
  },
  {
    id: 'partner.car',
    minTier: 2,
    cooldown: 5,
    people: (g) => folks(g, isPartner, 18).filter((p) => mayAsk(g, p)),
    when: (g) => g.year >= 1950,
    weight: () => 1.2,
    build: (g, tier, p) => {
      if (!p) return null
      const type = tier >= 4 ? 'supercar' : tier >= 3 ? 'sports' : 'luxury'
      const label = carLabel(g, type)
      const amt = carPrice(g, type, p)
      return { k: 'partner.car', pid: p.id, title: 'New Wheels', emoji: '\u{1F3CE}\u{FE0F}', text: `${channel(g, p)}${who(p)} wants ${label} (${money(amt)}). "For errands."${postnupLine(g, p)}`, amt, what: label, buy: true, giveLabel: `Buy ${label.replace(/^an? /, 'the ')}`, alt: carPrice(g, 'luxury', p) < amt ? carPrice(g, 'luxury', p) : undefined, altWhat: carLabel(g, 'luxury'), altLabel: 'Buy a nice sedan instead' }
    },
    thanks: 9,
    hurt: 5,
  },
  {
    id: 'partner.horse',
    minTier: 3,
    cooldown: 8,
    people: (g) => folks(g, isPartner, 18).filter((p) => mayAsk(g, p)),
    weight: () => 0.6,
    build: (g, tier, p) => {
      if (!p) return null
      const amt = scaled(g, 60_000, tier, p, 0.01)
      return { k: 'partner.horse', pid: p.id, title: 'Equestrian Dreams', emoji: '\u{1F40E}', text: `${who(p)} wants a horse (${money(amt)}, stable fees not included). ${cap(pr(p).he)} has never ridden a horse. ${cap(pr(p).he)} has, however, seen a movie about one.`, amt, what: 'a horse', buy: true }
    },
    thanks: 8,
    hurt: 4,
  },
  {
    id: 'partner.postnup',
    noNo: true,
    minTier: 3,
    cooldown: 12,
    people: (g) => folks(g, (p) => p.relation === 'spouse', 18).filter((p) => p.data.prenup !== true),
    when: (g) => g.year >= 1970 && !g.character.prison,
    weight: () => 1,
    build: (g, _tier, p) => {
      if (!p) return null
      return { k: 'partner.postnup', pid: p.id, title: 'Your Accountant Coughs', emoji: '\u{1F4DC}', text: `Your accountant pointed out, for the fifth time, that you married ${p.firstName} without a prenup and you are now worth ${money(perceivedWealth(g))}. A postnuptial agreement is "just good housekeeping."`, amt: 0, what: 'a postnup' }
    },
    custom: true,
    extras: [
      {
        id: 'ask',
        label: (_g, _a, p) => `Ask ${p ? p.firstName : 'your spouse'} to sign one`,
        emoji: '\u{270D}\u{FE0F}',
        run: (g, _a, p) => {
          if (!p) return
          const yes = chance(g, Math.max(0.15, Math.min(0.8, p.relationship / 120)))
          if (yes) {
            p.data.prenup = true
            addRelationship(p, -randInt(g, 4, 9))
            notePerson(p, 'Signed a postnup.')
            notice(g, 'Postnup', `${p.firstName} signed it, slowly, while maintaining eye contact. Your assets are protected. Dinner will be quiet for a while.`, { emoji: '\u{1F4DC}' })
          } else {
            addRelationship(p, -randInt(g, 12, 20))
            notice(g, 'Postnup', `${p.firstName} read the first page and asked if you were planning to leave. You were not, until about four minutes ago. ${cap(pr(p).he)} refused to sign.`, { emoji: '\u{1F4DC}', tone: 'bad' })
          }
        },
      },
      {
        id: 'trust',
        label: () => 'Tell the accountant you trust your spouse',
        emoji: '\u{1F91D}',
        run: (g, _a, p) => {
          if (p) addRelationship(p, randInt(g, 1, 3))
          notice(g, 'Postnup', 'You told your accountant you trust your spouse completely. Your accountant made a small note in a file labeled "Later."', { emoji: '\u{1F91D}' })
        },
      },
    ],
  },
  // ----- Parents & grandparents ---------------------------------------------
  {
    id: 'parent.medical',
    minTier: 1,
    cooldown: 3,
    prison: true,
    people: (g) => folks(g, (p) => isParent(p) || p.relation === 'grandparent', 55).filter((p) => mayAsk(g, p, 1)),
    weight: (_g, _tier, p) => (p && p.stats.health < 50 ? 4 : 2),
    build: (g, tier, p) => {
      if (!p) return null
      const what = eraPickPlain(g, ['@1965 a hip replacement', '@1955 heart surgery', 'a long hospital stay', 'cataract surgery', 'months of care after a bad fall', 'a specialist across the country'])
      const universal = getCountry(personCountry(g, p)).universalHealthcare
      const amt = scaled(g, universal ? 8_000 : 30_000, Math.min(tier, 2), p, 0.03)
      const why = universal ? 'The public waiting list is eight months; a private clinic can do it next week.' : `${cap(pr(p).his)} insurance covers "a portion," which turns out to be a small one.`
      return { k: 'parent.medical', pid: p.id, title: 'Medical Bills', emoji: '\u{1F3E5}', text: `${channel(g, p)}${who(p)} needs ${what} (${money(amt)}). ${why}`, amt, what: `${what}`, less: true }
    },
    onGive: (g, _a, p) => {
      if (!p) return ''
      p.stats.health = Math.min(100, p.stats.health + randInt(g, 8, 18))
      return `${cap(pr(p).he)} is recovering well and telling every nurse about you.`
    },
    onNo: (g, _a, p) => {
      if (!p) return ''
      p.stats.health = Math.max(1, p.stats.health - randInt(g, 4, 10))
      return `${cap(pr(p).he)} is on the waiting list.`
    },
    need: true,
    thanks: 12,
    hurt: 12,
  },
  {
    id: 'parent.retire',
    cash: true,
    minTier: 1,
    cooldown: 5,
    prison: true,
    people: (g) => folks(g, isParent, 60).filter((p) => mayAsk(g, p) && p.money < typicalIncome(g, personCountry(g, p)) * 3),
    weight: () => 2,
    build: (g, tier, p) => {
      if (!p) return null
      const amt = scaled(g, 20_000, Math.min(tier, 3), p, 0.02)
      return { k: 'parent.retire', pid: p.id, title: 'Retirement', emoji: '\u{1F474}', text: `${channel(g, p)}${who(p)} admitted the pension doesn't stretch as far as it used to and asked if you could help (${money(amt)}). ${cap(pr(p).he)} hated asking. ${cap(pr(p).he)} also mentioned all those years of driving you to practice.`, amt, what: 'help with retirement', less: true }
    },
    extras: [
      {
        id: 'support',
        label: (_g, a) => `Support them yearly (${money(round(a.amt / 4))} a year)`,
        emoji: '\u{1F4C6}',
        run: (g, a, p) => {
          if (!p) return
          const yearly = round(a.amt / 4)
          updateTies(g, p, (t) => {
            t.allowance = Math.max(t.allowance, yearly)
            t.adultOk = true
            t.missed = 0
          })
          addRelationship(p, randInt(g, 8, 14))
          notice(g, 'Retirement', `You set up ${money(yearly)} a year for ${p.firstName}, paid automatically. ${cap(pr(p).he)} cried a little and then asked if it's adjusted for inflation.`, { emoji: '\u{1F4C6}', tone: 'good' })
        },
      },
    ],
    need: true,
    thanks: 12,
    hurt: 10,
  },
  {
    id: 'parent.mortgage',
    minTier: 2,
    cooldown: 8,
    people: (g) => folks(g, isParent, 45, 80).filter((p) => mayAsk(g, p)),
    weight: () => 1.2,
    build: (g, _tier, p) => {
      if (!p) return null
      const amt = round(Math.min(perceivedWealth(g) * 0.05, 120_000 * housingScale(g, personCountry(g, p))))
      return { k: 'parent.mortgage', pid: p.id, title: 'The Old House', emoji: '\u{1F3E0}', text: `${channel(g, p)}${who(p)} still owes ${money(amt)} on the house you grew up in. Nobody asked outright. The bank statement was just left very visibly on the kitchen table.`, amt, what: 'paying off their mortgage', less: true }
    },
    thanks: 14,
    hurt: 6,
  },
  {
    id: 'parent.cruise',
    minTier: 1,
    cooldown: 4,
    people: (g) => folks(g, isParent, 50).filter((p) => mayAsk(g, p)),
    weight: () => 1.2,
    build: (g, tier, p) => {
      if (!p) return null
      const amt = scaled(g, 9_000, Math.min(tier, 3), p, 0.01)
      return { k: 'parent.cruise', pid: p.id, title: 'Anniversary', emoji: '\u{1F6F3}\u{FE0F}', text: `${channel(g, p)}${who(p)} has always dreamed of a cruise for a big anniversary (${money(amt)}). There will be a captain's dinner. There will be a buffet. There will be photos of the buffet.`, amt, what: 'an anniversary cruise', small: false }
    },
    thanks: 10,
    hurt: 5,
  },
  {
    id: 'parent.dream',
    minTier: 2,
    cooldown: 8,
    people: (g) => folks(g, isParent, 50, 75).filter((p) => mayAsk(g, p)),
    weight: () => 0.8,
    build: (g, tier, p) => {
      if (!p) return null
      const idea = eraPickPlain(g, ['a little bakery', '@1970 a bed-and-breakfast', 'a vineyard (one row of grapes, for now)', 'an antique shop', 'a bait-and-tackle shop'])
      const amt = scaled(g, 40_000, Math.min(tier, 3), p, 0.03)
      return { k: 'parent.dream', pid: p.id, title: 'Second Act', emoji: '\u{1F9C1}', text: `${channel(g, p)}${who(p)} wants to finally open ${idea} and asked you to invest (${money(amt)}). "It's my dream, and you're the only one in the family with money," ${pr(p).he} said, while three other relatives nodded.`, amt, what: idea, less: true, odds: ventureOdds(p), partial: VENTURE_PARTIAL }
    },
    onGive: (g, a, p, amount) => {
      if (!p) return ''
      addVenture(g, a, yourOf(p), amount, 'venture', p)
      p.stats.happiness = Math.min(100, p.stats.happiness + 10)
      return ''
    },
    thanks: 12,
    hurt: 8,
  },
  {
    id: 'grandparent.care',
    minTier: 1,
    cooldown: 4,
    prison: true,
    people: (g) => folks(g, (p) => p.relation === 'grandparent' || isParent(p), 78).filter((p) => mayAsk(g, p, 1)),
    weight: () => 2,
    build: (g, tier, p) => {
      if (!p) return null
      const what = byEra(g, [['1960', 'a home nurse']], 'a live-in nurse')
      const amt = scaled(g, 35_000, Math.min(tier, 2), p, 0.03)
      return { k: 'grandparent.care', pid: p.id, title: 'Care', emoji: '\u{1F9D3}', text: `${channel(g, p)}${who(p)} can't manage alone anymore. The family wants to hire ${what} (${money(amt)} a year) and everyone is looking at you.`, amt, what, less: true }
    },
    onGive: (g, _a, p) => {
      if (!p) return ''
      p.stats.health = Math.min(100, p.stats.health + randInt(g, 4, 10))
      p.stats.happiness = Math.min(100, p.stats.happiness + 10)
      return ''
    },
    need: true,
    thanks: 12,
    hurt: 10,
  },
  // ----- Siblings -------------------------------------------------------------
  {
    id: 'sibling.restaurant',
    minTier: 1,
    cooldown: 5,
    prison: true,
    people: (g) => folks(g, isSibling, 22).filter((p) => mayAsk(g, p)),
    weight: () => 2.2,
    build: (g, tier, p) => {
      if (!p) return null
      const shop = pick(g, RESTAURANT)
      const amt = scaled(g, 35_000, tier, p, 0.04)
      return { k: 'sibling.restaurant', pid: p.id, title: 'Family Business', emoji: '\u{1F35D}', text: `${channel(g, p)}${who(p)} needs ${money(amt)} to keep ${pr(p).his} ${shop} open "just one more year." It has been "just one more year" for six years. ${cap(pr(p).he)} swears it's a loan.`, amt, what: `keeping the ${shop} open`, less: true, lend: true }
    },
    thanks: 10,
    hurt: 9,
  },
  {
    id: 'sibling.rent',
    cash: true,
    minTier: 1,
    cooldown: 3,
    prison: true,
    people: (g) => folks(g, isSibling, 20).filter((p) => mayAsk(g, p)),
    weight: () => 1.6,
    build: (g, tier, p) => {
      if (!p) return null
      const amt = scaled(g, 6_000 * housingScale(g, personCountry(g, p)), Math.min(tier, 2), p, 0.01)
      return { k: 'sibling.rent', pid: p.id, title: 'Rough Patch', emoji: '\u{1F4C9}', text: `${channel(g, p)}${who(p)} is behind on rent (${money(amt)}). ${pick(g, [`${cap(pr(p).he)} got laid off.`, `${cap(pr(p).he)} "invested" in something.`, `${cap(pr(p).his)} landlord discovered the four cats.`])}`, amt, what: 'help with rent', less: true, lend: true }
    },
    need: true,
    thanks: 8,
    hurt: 8,
  },
  {
    id: 'sibling.wedding',
    minTier: 1,
    cooldown: 8,
    people: (g) => folks(g, isSibling, 22, 50).filter((p) => mayAsk(g, p) && p.data.married !== true),
    weight: () => 0.8,
    build: (g, tier, p) => {
      if (!p) return null
      const amt = scaled(g, 15_000, tier, p, 0.01)
      const spouse = spouseFor(g, p)
      return { k: 'sibling.wedding', pid: p.id, title: 'Sibling Wedding', emoji: '\u{1F470}', text: `${who(p)} is marrying ${spouse} and asked you to "chip in" on the wedding (${money(amt)}). Your chip would be the size of the venue.`, amt, what: `${pr(p).his} wedding`, less: true, x: { spouse } }
    },
    // The wedding happens either way (so the same sibling doesn't "get married" again in 8 years).
    onGive: (_g, a, p) => {
      if (p) markMarried(p, a.x?.spouse, 'you chipped in on the wedding')
      return ''
    },
    onNo: (_g, a, p) => {
      if (p) markMarried(p, a.x?.spouse, 'a smaller wedding than planned')
      return ''
    },
    thanks: 10,
    hurt: 8,
  },
  {
    id: 'sibling.kids',
    minTier: 1,
    cooldown: 4,
    people: (g) => folks(g, isSibling, 25, 60).filter((p) => mayAsk(g, p) && p.data.married === true),
    weight: () => 1,
    build: (g, tier, p) => {
      if (!p) return null
      const nk = chance(g, 0.5) ? 'nephew' : 'niece'
      const amt = scaled(g, 8_000, Math.min(tier, 3), p, 0.01)
      return { k: 'sibling.kids', pid: p.id, title: `Your ${cap(nk)}`, emoji: '\u{1F392}', text: `${channel(g, p)}${who(p)} asked if you'd help with your ${nk}'s school fees (${money(amt)}). There was a report card attached, with the good grades circled.`, amt, what: `your ${nk}'s school fees`, less: true }
    },
    thanks: 9,
    hurt: 7,
  },
  {
    id: 'sibling.venture',
    minTier: 2,
    cooldown: 6,
    people: (g) => folks(g, isSibling, 22, 65).filter((p) => mayAsk(g, p)),
    weight: () => 0.9,
    build: (g, tier, p) => {
      if (!p) return null
      const idea = eraPickPlain(g, ['@1985 a craft brewery', '@1970 a dog-grooming van', '@1927 a mini-golf course', '@1975 a gym for seniors', '@1960 a franchise of a franchise', 'a hat shop', 'a dance hall'])
      const amt = scaled(g, 50_000, tier, p, 0.04)
      return { k: 'sibling.venture', pid: p.id, title: 'Big Idea', emoji: '\u{1F4BC}', text: `${channel(g, p)}${who(p)} wants you to invest in ${idea} (${money(amt)}). "You'll double your money." ${cap(pr(p).he)} said the same thing about the last two.`, amt, what: idea, less: true, odds: ventureOdds(p), partial: VENTURE_PARTIAL }
    },
    onGive: (g, a, p, amount) => {
      if (!p) return ''
      addVenture(g, a, yourOf(p), amount, 'venture', p)
      return ''
    },
    thanks: 9,
    hurt: 7,
  },
  // ----- Family abroad ----------------------------------------------------------
  {
    id: 'abroad.remit',
    cash: true,
    minTier: 1,
    cooldown: 2,
    prison: true,
    people: (g) => folks(g, (p) => isParent(p) || isSibling(p) || isKid(p) || p.relation === 'grandparent', 18).filter((p) => isAbroad(g, p) && mayAsk(g, p)),
    weight: () => 3,
    build: (g, tier, p) => {
      if (!p) return null
      const where = getCountry(personCountry(g, p)).name
      const why = pick(g, ['a new roof before the rainy season', 'school fees for the little ones', 'the family land', 'a medical bill', 'a cousin\'s wedding that "the whole family" is attending'])
      const amt = scaled(g, 4_000, Math.min(tier, 3), p, 0.01)
      return { k: 'abroad.remit', pid: p.id, title: 'Money Home', emoji: '\u{1F4EE}', text: `${channel(g, p)}${who(p)} asked you to send money home to ${where} for ${why} (${money(amt)}). Everyone back home knows you "made it."`, amt, what: `money home for ${why}`, less: true }
    },
    thanks: 10,
    hurt: 8,
  },
  // ----- In-laws, cousins and relatives you've never met ----------------------
  {
    id: 'inlaw.help',
    minTier: 1,
    cooldown: 4,
    when: (g) => !!spouseOf(g),
    weight: () => 1.4,
    build: (g, tier) => {
      const sp = spouseOf(g)
      if (!sp) return null
      const il = inLaw(g, sp)
      const what = eraPickPlain(g, ['@1965 a new hip', '@cars a new truck after the old one finally died', 'a roof that no longer leaks onto the bed', 'a trip to see the grandkids'])
      const amt = scaled(g, 12_000, Math.min(tier, 3), undefined, 0.02)
      return { k: 'inlaw.help', name: il.name, title: 'In-Laws', emoji: '\u{1F475}', text: `${cap(il.name)} needs ${what} (${money(amt)}). ${sp.firstName} didn't ask directly. ${cap(pr(sp).he)} just sighed every time the topic came up, which was often.`, amt, what, less: true, x: { spouseId: sp.id } }
    },
    onGive: (g, a) => {
      const sp = typeof a.x?.spouseId === 'string' ? g.people.find((q) => q.id === a.x?.spouseId && q.alive) : undefined
      if (sp) addRelationship(sp, randInt(g, 6, 12))
      return sp ? `${sp.firstName} kissed you in front of everyone. Your in-law called you "the good one."` : ''
    },
    onNo: (g, a) => {
      const sp = typeof a.x?.spouseId === 'string' ? g.people.find((q) => q.id === a.x?.spouseId && q.alive) : undefined
      if (sp) addRelationship(sp, -randInt(g, 5, 10))
      return sp ? `${sp.firstName} will be bringing this up at every holiday until one of you dies.` : ''
    },
    thanks: 0,
    hurt: 0,
  },
  {
    id: 'cousin.tip',
    minTier: 2,
    cooldown: 4,
    weight: () => 1.3,
    build: (g, tier) => {
      const c = cousin(g)
      const tip = eraPickPlain(g, TIPS)
      const amt = scaled(g, 25_000, tier, undefined, 0.03)
      const odds = 0.08
      return { k: 'cousin.tip', name: c.name, title: "Can't Miss", emoji: '\u{1F911}', text: `${cap(c.name)} has a can't-miss opportunity: ${tip}. ${c.first} needs ${money(amt)} from you by Friday and "can't say more ${landline(g) ? 'over the phone' : 'in a letter'}."`, amt, what: tip, less: true, odds, partial: 0.15 }
    },
    onGive: (g, a, _p, amount) => {
      addVenture(g, a, a.name ?? 'your cousin', amount, 'tip')
      return `${a.name ? cap(a.name.replace(/^your cousin /, '')) : 'Your cousin'} promised you'll "thank me later."`
    },
    thanks: 0,
    hurt: 0,
  },
  {
    id: 'relative.door',
    minTier: 2,
    cooldown: 3,
    when: (g) => !g.character.prison && !boundary(g, 'door'),
    weight: (_g, tier) => 0.8 + tier * 0.3,
    build: (g, tier) => {
      const gender = chance(g, 0.5) ? 'male' : 'female'
      const first = randomFirstName(g, g.character.countryId, gender)
      const kin = pick(g, gender === 'male' ? ['second cousin twice removed', 'great-uncle by marriage', "half-aunt's stepson", 'long-lost cousin from the other side of the family'] : ['second cousin twice removed', 'great-aunt by marriage', "half-uncle's stepdaughter", 'long-lost cousin from the other side of the family'])
      const amt = scaled(g, 5_000, tier, undefined, 0.005)
      // The name reads "your second cousin twice removed Ana" so the log can say "my ... Ana".
      return { k: 'relative.door', name: `your ${kin} ${first}`, title: 'Long-Lost Family', emoji: '\u{1F6AA}', text: `A ${gender === 'male' ? 'man' : 'woman'} named ${first} showed up at your door claiming to be your ${kin}. ${gender === 'male' ? 'He' : 'She'} brought a casserole, a family tree drawn on a napkin and a request for ${money(amt)}. The family resemblance is mostly in the asking.`, amt, what: 'a "family emergency"', less: true, x: { first } }
    },
    extras: [
      {
        id: 'gate',
        label: () => 'Stop answering the door',
        emoji: '\u{1F512}',
        run: (g) => {
          g.flags['wealth.bound.door'] = g.year + 6
          notice(g, 'Long-Lost Family', 'You hired a doorman, installed a gate and stopped answering knocks. Long-lost relatives will have to stay lost for a while.', { emoji: '\u{1F512}' })
        },
      },
    ],
    thanks: 0,
    hurt: 0,
  },
]

/** A local name for the person someone is marrying (most marry the other gender). */
export function spouseFor(g: GameState, p: Person): string {
  const gender = chance(g, 0.92) ? (p.gender === 'male' ? 'female' : 'male') : p.gender
  return `${randomFirstName(g, personCountry(g, p), gender)} ${randomLastName(g, personCountry(g, p))}`
}

/** Record a relative's or friend's wedding (relationships.ts reads data.married / spouseName). */
export function markMarried(p: Person, spouse: unknown, how: string): void {
  if (p.data.married === true || typeof spouse !== 'string' || !spouse) return
  p.data.married = true
  p.data.spouseName = spouse
  notePerson(p, `Married ${spouse} at age ${p.age} (${how}).`)
}

/** True while the player has shut out this kind of asker ('door', 'charity', 'strangers'). */
export function boundary(g: GameState, key: string): boolean {
  const v = g.flags[`wealth.bound.${key}`]
  return typeof v === 'number' && v > g.year
}

/** A dry note about the missing prenup for very rich married players ('' otherwise). */
function postnupLine(g: GameState, p: Person): string {
  if (p.relation !== 'spouse' || p.data.prenup === true || g.year < 1970) return ''
  if (perceivedWealth(g) < typicalIncome(g) * 400 || !chance(g, 0.35)) return ''
  return ' (Your accountant, somewhere, felt a chill: there is still no prenup.)'
}
