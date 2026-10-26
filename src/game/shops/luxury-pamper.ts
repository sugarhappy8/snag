// Luxury Lifestyle › Luxury Spa ("Pamper yourself") and VIP Events (Celebrity Chef Dinner,
// Celebrity Wedding, Charity Gala, Movie Premiere, VIP Nightclub). Spa prices follow local
// labor costs; event tickets follow the local luxury price level.
import { addHidden, addMoney, addRelationship, addStat, count, formatMoney, log, netWorth, notice, remember, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { nicePrice } from '../assets'
import { hasTech } from '../history/timeline'
import { createPerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import { authorMut } from '../special/author-state'
import { gdMut, gdPeek } from '../special/gamedev-state'
import { peek } from '../special/common'
import type { ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode, Person, StatKey } from '../types'
import { alcoholBlock } from './luxury-brands-catalog'
import { alcoholMult, cantAfford, localized, luxuryMult, luxuryReason, meetCeleb, rollCeleb, serviceMult, taxLine } from './luxury-common'
import { hasStaffRole } from './luxury-staff'

// ---------------------------------------------------------------------------
// Luxury Spa

export interface SpaTreatment {
  id: string
  label: string
  emoji: string
  /** US price. */
  usd: number
  effects: Partial<Record<StatKey, [number, number]>>
  text: string[]
  oops: string
  oopsStat: StatKey
}

export const SPA_TREATMENTS: SpaTreatment[] = [
  {
    id: 'facial',
    label: '24-Karat Gold Facial',
    emoji: '✨',
    usd: 1_500,
    effects: { looks: [2, 5], happiness: [2, 4] },
    text: ['An aesthetician pressed actual gold leaf onto your face. You glowed like a trophy for a week.', 'Gold leaf, rose water and a lot of gentle humming. Your pores have never felt so expensive.'],
    oops: 'The gold leaf gave you a rash shaped like a small country.',
    oopsStat: 'looks',
  },
  {
    id: 'massage',
    label: 'Hot Stone & Truffle Oil Massage',
    emoji: '💆',
    usd: 900,
    effects: { happiness: [6, 10], health: [1, 3] },
    text: ['Ninety minutes of hot volcanic stones and truffle oil. You now smell faintly like a fancy risotto.', 'The masseuse found knots you did not know you had and politely judged each one.'],
    oops: 'The stones were a little too hot. You have a stone-shaped tan line now.',
    oopsStat: 'happiness',
  },
  {
    id: 'cryo',
    label: 'Cryotherapy Chamber',
    emoji: '🧊',
    usd: 600,
    effects: { health: [3, 6], happiness: [1, 3] },
    text: ['Three minutes at minus 110 °C. You screamed, then felt incredible, then screamed again for good measure.', 'You stood in a frozen tube in a robe and fuzzy socks and came out feeling like a brand-new freezer.'],
    oops: 'You stayed in a minute too long and could not feel your toes until dinner.',
    oopsStat: 'health',
  },
  {
    id: 'caviar',
    label: 'Caviar Body Wrap',
    emoji: '🐟',
    usd: 2_500,
    effects: { looks: [2, 4], happiness: [3, 5] },
    text: ['They wrapped you in caviar like a very rich burrito. Your skin has never been this smooth.', 'You spent an hour wrapped in fish eggs and silk. It was weird. It was wonderful.'],
    oops: 'A spa cat got into the room. It went for the caviar. You were wearing the caviar.',
    oopsStat: 'happiness',
  },
  {
    id: 'saltCave',
    label: 'Himalayan Salt Cave Meditation',
    emoji: '🧘',
    usd: 700,
    effects: { happiness: [4, 8], health: [1, 3] },
    text: ['An hour in a glowing pink salt cave. You reached inner peace for eleven whole minutes.', 'You meditated in a cave made of salt. You licked the wall once when nobody was looking.'],
    oops: 'You fell asleep and snored so loudly that two other guests asked for refunds.',
    oopsStat: 'happiness',
  },
  {
    id: 'ivDrip',
    label: 'Designer IV Vitamin Drip',
    emoji: '💉',
    usd: 1_200,
    effects: { health: [2, 5] },
    text: ['A nurse in a silk scrub top hooked you up to a bag of "Executive Recovery." You felt amazing. It was mostly vitamin C.', 'You sat in a leather recliner with a vitamin drip and a glass of cucumber water, feeling medically rich.'],
    get oops() {
      return `You felt absolutely nothing. You suspect it was a ${formatMoney(1_200)} bag of salt water.`
    },
    oopsStat: 'happiness',
  },
  {
    id: 'retreat',
    label: 'Full-Day "Rebirth" Retreat',
    emoji: '🌸',
    usd: 12_000,
    effects: { happiness: [8, 14], health: [3, 6], looks: [2, 4] },
    text: ['A full day of mud, steam, massages, a sound bath and a private chef. You left feeling like a newborn with a credit card.', 'A guru, a gong and seven different robes. You do not remember most of it, but you feel fantastic.'],
    oops: 'The "rebirth" ritual involved a lot of chanting and one very cold plunge pool you were not warned about.',
    oopsStat: 'happiness',
  },
]

/** Treatments per year (the spa needs time to regrow your eyebrows). */
export const SPA_PER_YEAR = 3

export function spaPrice(g: GameState, t: SpaTreatment): number {
  return localized(t.usd, serviceMult(g))
}

function spaReason(g: GameState): string | null {
  return luxuryReason(g)
}

export function haveTreatment(g: GameState, id: string): boolean {
  const t = SPA_TREATMENTS.find((x) => x.id === id)
  if (!t) return false
  const reason = spaReason(g)
  if (reason) {
    notice(g, 'Luxury Spa', reason, { emoji: '💆' })
    return false
  }
  if (yearActionsUsed(g, 'luxury.spa') >= SPA_PER_YEAR) {
    notice(g, 'Luxury Spa', `You've had ${SPA_PER_YEAR} treatments this year. The spa director gently suggested you go outside for once.`, { emoji: '🧖' })
    return false
  }
  const price = spaPrice(g, t)
  if (g.character.money < price) {
    cantAfford(g, price, `the ${t.label.toLowerCase()}`)
    return false
  }
  useYearAction(g, 'luxury.spa', SPA_PER_YEAR)
  addMoney(g, -price, 'leisure')
  count(g, 'spaVisits')
  if (chance(g, 0.07)) {
    addStat(g, t.oopsStat, -randInt(g, 1, 3))
    log(g, `My ${t.label.toLowerCase()} at the luxury spa went wrong.`, 'bad')
    notice(g, 'Spa Mishap', `${t.oops} (${formatMoney(price)}, non-refundable.)`, { emoji: t.emoji, tone: 'bad' })
    return true
  }
  for (const [key, range] of Object.entries(t.effects) as [StatKey, [number, number]][]) addStat(g, key, randInt(g, range[0], range[1]))
  log(g, `I treated myself to a ${t.label.toLowerCase()} at a luxury spa.`, 'good')
  // Credit cards and sound baths are recent; older spa-goers left feeling like a newborn with a checkbook.
  const line = pick(g, t.text)
  notice(g, t.label, !hasTech(g, 'creditCards') ? line.replace('a newborn with a credit card', 'a newborn with a checkbook') : line, { emoji: t.emoji, tone: 'good' })
  return true
}

export const luxurySpaMenu: MenuGroup = {
  type: 'menu',
  id: 'luxurySpa',
  label: 'Luxury Spa',
  emoji: '🧖',
  subtitle: 'Pamper yourself',
  disabledReason: spaReason,
  header: (g) => {
    const left = Math.max(0, SPA_PER_YEAR - yearActionsUsed(g, 'luxury.spa'))
    return `Robes, cucumber water and treatments with very long names. ${left > 0 ? `You can book ${left} more treatment${left === 1 ? '' : 's'} this year.` : 'You have used up your treatments for this year.'} ${taxLine(g)}`.trim()
  },
  children: (): MenuNode[] =>
    SPA_TREATMENTS.map(
      (t): MenuAction => ({
        type: 'action',
        id: `lux-spa-${t.id}`,
        label: t.label,
        emoji: t.emoji,
        subtitle: (g) => `${formatMoney(spaPrice(g, t))} · ${Object.keys(t.effects).join(', ')}`,
        disabledReason: (g) => spaReason(g) ?? (yearActionsUsed(g, 'luxury.spa') >= SPA_PER_YEAR ? `You've had ${SPA_PER_YEAR} treatments this year.` : null),
        run: (g) => {
          haveTreatment(g, t.id)
        },
      }),
    ),
}

// ---------------------------------------------------------------------------
// Bespoke experiences

export type LuxuryExperienceId = 'familyRetreat' | 'patronSalon' | 'learningSabbatical'

interface LuxuryExperience {
  id: LuxuryExperienceId
  label: string
  emoji: string
  usd: number
  subtitle: string
}

export const LUXURY_EXPERIENCES_PER_YEAR = 2

export const LUXURY_EXPERIENCES: LuxuryExperience[] = [
  { id: 'familyRetreat', label: 'Private Family Retreat', emoji: '🏞️', usd: 80_000, subtitle: 'Bring the family somewhere quiet and repair real bonds' },
  { id: 'patronSalon', label: 'Host a Patron Salon', emoji: '🥂', usd: 120_000, subtitle: 'Gather artists, founders and thinkers; leave with a wider circle' },
  { id: 'learningSabbatical', label: 'Curated Learning Sabbatical', emoji: '📚', usd: 160_000, subtitle: 'Private tutors, deep study and room to recover from creative burnout' },
]

function retreatFamily(g: GameState): Person[] {
  const family = new Set(['parent', 'stepparent', 'sibling', 'halfSibling', 'stepsibling', 'grandparent', 'child', 'stepchild', 'grandchild', 'spouse', 'partner', 'fiance'])
  return g.people.filter((person) => person.alive && family.has(person.relation))
}

export function luxuryExperiencePrice(g: GameState, experience: LuxuryExperience): number {
  const full = localized(experience.usd, luxuryMult(g))
  return hasStaffRole(g, 'concierge') ? nicePrice(full * .85) : full
}

function experienceReason(g: GameState, experience: LuxuryExperience): string | null {
  const blocked = luxuryReason(g)
  if (blocked) return blocked
  if (yearActionsUsed(g, 'luxury.experience') >= LUXURY_EXPERIENCES_PER_YEAR) return `You have already booked ${LUXURY_EXPERIENCES_PER_YEAR} bespoke experiences this year.`
  if (experience.id === 'familyRetreat' && retreatFamily(g).length === 0) return 'You need a living family member or partner to bring on the retreat.'
  return null
}

function recoverCreativeBurnout(g: GameState, amount: number): string[] {
  const recovered: string[] = []
  if (peek<Json>(g, 'author')) {
    const profile = authorMut(g)
    const before = profile.burnout
    profile.burnout = Math.max(0, profile.burnout - amount)
    if (profile.burnout < before) recovered.push(`author burnout −${Math.round(before - profile.burnout)}`)
  }
  if (gdPeek(g)) {
    const profile = gdMut(g)
    const before = profile.burnout
    profile.burnout = Math.max(0, profile.burnout - amount)
    if (profile.burnout < before) recovered.push(`game-development burnout −${Math.round(before - profile.burnout)}`)
  }
  return recovered
}

/** Book one fully revalidated, limited experience. Returns true only after payment and effects. */
export function attendLuxuryExperience(g: GameState, id: LuxuryExperienceId): boolean {
  const experience = LUXURY_EXPERIENCES.find((candidate) => candidate.id === id)
  if (!experience) return false
  const reason = experienceReason(g, experience)
  if (reason) {
    notice(g, experience.label, reason, { emoji: experience.emoji })
    return false
  }
  const price = luxuryExperiencePrice(g, experience)
  if (g.character.money < price) {
    cantAfford(g, price, experience.label.toLowerCase())
    return false
  }
  if (!useYearAction(g, 'luxury.experience', LUXURY_EXPERIENCES_PER_YEAR)) return false
  addMoney(g, -price, 'leisure')
  count(g, 'luxuryExperiences')

  if (id === 'familyRetreat') {
    const family = retreatFamily(g)
    for (const person of family) addRelationship(g, person, randInt(g, 4, 8))
    addStat(g, 'happiness', randInt(g, 6, 10))
    count(g, 'familyRetreats')
    log(g, `I took ${family.length} family member${family.length === 1 ? '' : 's'} on a private retreat.`, 'good')
    notice(g, experience.label, `For once, nobody had an agenda. ${family.map((person) => person.firstName).slice(0, 5).join(', ')}${family.length > 5 ? ' and the rest of the family' : ''} ate together, talked honestly and came home closer.`, { emoji: experience.emoji, tone: 'good' })
    return true
  }

  if (id === 'patronSalon') {
    const existing = g.people.filter((person) => person.alive && (person.relation === 'friend' || person.relation === 'bestFriend'))
    for (const friend of existing.slice(0, 8)) addRelationship(g, friend, randInt(g, 2, 5))
    const guest = createPerson(g, {
      relation: 'friend',
      age: Math.max(18, Math.min(75, g.character.age + randInt(g, -10, 10))),
      relationship: randInt(g, 58, 72),
      occupation: pick(g, ['Gallery Director', 'Architect', 'Publisher', 'Research Fellow', 'Foundation Director', 'Entrepreneur']),
      data: { metAt: 'a private patron salon' },
    })
    addStat(g, 'happiness', randInt(g, 4, 8))
    addHidden(g, 'fame', 1)
    count(g, 'patronSalons')
    log(g, `I hosted a patron salon and became friends with ${guest.firstName} ${guest.lastName}.`, 'good')
    notice(g, experience.label, `Your home filled with arguments about art, science and what comes next. By dessert, ${guest.firstName}, a ${guest.occupation.toLowerCase()}, had become a genuine new friend.`, { emoji: experience.emoji, tone: 'good' })
    return true
  }

  addStat(g, 'smarts', randInt(g, 4, 7))
  addStat(g, 'happiness', randInt(g, 4, 8))
  addHidden(g, 'discipline', 2)
  const recovered = recoverCreativeBurnout(g, 20)
  count(g, 'learningSabbaticals')
  log(g, 'I took a curated learning sabbatical with private tutors.', 'good')
  notice(g, experience.label, `A small faculty built a syllabus around everything you were curious about. You came home sharper and rested${recovered.length ? ` (${recovered.join(', ')})` : ''}.`, { emoji: experience.emoji, tone: 'good' })
  return true
}

function luxuryExperienceAction(experience: LuxuryExperience): MenuAction {
  return {
    type: 'action',
    id: `lux-experience-${experience.id}`,
    label: experience.label,
    emoji: experience.emoji,
    subtitle: (g) => `${formatMoney(luxuryExperiencePrice(g, experience))}${hasStaffRole(g, 'concierge') ? ' · concierge rate' : ''} · ${experience.subtitle}`,
    disabledReason: (g) => experienceReason(g, experience),
    run: (g) => { attendLuxuryExperience(g, experience.id) },
  }
}

export const luxuryExperiencesMenu: MenuGroup = {
  type: 'menu',
  id: 'luxuryExperiences',
  label: 'Bespoke Experiences',
  emoji: '🗺️',
  subtitle: 'Family, ideas and restorative time',
  disabledReason: luxuryReason,
  header: (g) => {
    const left = Math.max(0, LUXURY_EXPERIENCES_PER_YEAR - yearActionsUsed(g, 'luxury.experience'))
    return `Spend on access and time that changes your life rather than another object. ${left} booking${left === 1 ? '' : 's'} left this year.${hasStaffRole(g, 'concierge') ? ' Your concierge negotiated 15% off every itinerary.' : ''} ${taxLine(g)}`.trim()
  },
  children: (): MenuNode[] => LUXURY_EXPERIENCES.map(luxuryExperienceAction),
}

// ---------------------------------------------------------------------------
// VIP Events

export type VipEventId = 'chefDinner' | 'wedding' | 'gala' | 'premiere' | 'nightclub'

export interface VipEvent {
  id: VipEventId
  label: string
  emoji: string
  subtitle: string
  /** US price of a seat / gift / bottle service. */
  usd: number
  priceKind: 'luxury' | 'alcohol'
}

export const VIP_EVENTS: VipEvent[] = [
  { id: 'chefDinner', label: 'Celebrity Chef Dinner', emoji: '👨‍🍳', subtitle: 'Twelve courses, one famous chef, tiny portions', usd: 25_000, priceKind: 'luxury' },
  { id: 'wedding', label: 'Celebrity Wedding', emoji: '💒', subtitle: "You're invited. The gift registry starts at five figures.", usd: 60_000, priceKind: 'luxury' },
  { id: 'gala', label: 'Charity Gala', emoji: '🎗️', subtitle: 'Black tie, silent auctions and tax-deductible guilt', usd: 100_000, priceKind: 'luxury' },
  { id: 'premiere', label: 'Movie Premiere', emoji: '🎬', subtitle: 'Red carpet, flashbulbs and a movie nobody watches', usd: 15_000, priceKind: 'luxury' },
  { id: 'nightclub', label: 'VIP Nightclub', emoji: '🍾', subtitle: 'Bottle service with sparklers', usd: 30_000, priceKind: 'alcohol' },
]

export function vipPrice(g: GameState, e: VipEvent): number {
  return localized(e.usd, e.priceKind === 'alcohol' ? alcoholMult(g) : luxuryMult(g))
}

function eventKey(id: string): string {
  return `luxury.vip.${id}`
}

function vipReason(g: GameState, e: VipEvent): string | null {
  const r = luxuryReason(g)
  if (r) return r
  if (e.priceKind === 'alcohol') {
    const blocked = alcoholBlock(g)
    if (blocked) return blocked
  }
  if (yearActionsUsed(g, eventKey(e.id)) >= 1) return `You already went to a ${e.label.toLowerCase()} this year.`
  return null
}

/** Charity pledges on top of the gala table: a share of net worth. */
export function galaPledges(g: GameState): { id: string; label: string; amount: number; karma: number }[] {
  const worth = Math.max(0, netWorth(g))
  const levels = [
    { id: 'table', label: 'Just the table', share: 0, karma: 4 },
    { id: 'generous', label: 'A generous pledge', share: 0.01, karma: 8 },
    { id: 'lavish', label: 'A jaw-dropping pledge', share: 0.05, karma: 14 },
  ]
  return levels.map((l) => ({ id: l.id, label: l.label, amount: l.share > 0 ? nicePrice(Math.max(50_000, worth * l.share)) : 0, karma: l.karma }))
}

function embarrassment(g: GameState, e: VipEvent): string {
  const lines: Record<VipEventId, string[]> = {
    chefDinner: ['You asked the three-Michelin-star chef for ketchup. The room went silent. Somewhere, a sous-chef wept.', 'You mispronounced "bouillabaisse" four different ways, loudly, and the chef corrected you every time.', 'You sent back the "deconstructed" lasagna because it was "missing the lasagna."'],
    wedding: ['You tripped carrying the gift and fell face-first into the seven-tier cake. The video has 30 million views.', 'You gave an unplanned toast that mentioned the groom\'s ex. Twice.', 'You dove for the bouquet, tackled a bridesmaid and knocked over the champagne tower. You did not catch the bouquet.'],
    gala: ['You scratched your nose during the auction and accidentally bid on a portrait of a llama.', 'You called the guest of honor by the wrong name in your speech. The name of their rival.', 'Your bow tie was a clip-on and it fell into the soup during the keynote.'],
    premiere: ['You stepped on the lead actor\'s gown on the red carpet and ripped the train clean off.', 'You fell asleep during the premiere and snored through the emotional climax. The director noticed.', 'A fashion blog put you at the top of the Worst Dressed list. Their exact words: "a sad disco ball."'],
    nightclub: ['You fell off the VIP booth while dancing on it. The paparazzi got every frame.', 'You tried to DJ. You pressed one button. The music stopped for the whole club.', 'Your sparkler set off the sprinklers. Everyone got soaked, including a very angry pop star.'],
  }
  return pick(g, lines[e.id])
}

const GALA = defineScript('luxury.vip.gala', (g, choice) => {
  if (choice === 'cancel' || !galaPledges(g).some((p) => p.id === choice)) return
  attendVipEvent(g, 'gala', choice)
})

/** Go to a VIP event. For the gala, `pledge` is 'table', 'generous' or 'lavish'. Returns true if attended. */
export function attendVipEvent(g: GameState, id: VipEventId, pledge = 'table'): boolean {
  const e = VIP_EVENTS.find((x) => x.id === id)
  if (!e) return false
  const reason = vipReason(g, e)
  if (reason) {
    notice(g, e.label, reason, { emoji: e.emoji })
    return false
  }
  const p = id === 'gala' ? galaPledges(g).find((x) => x.id === pledge) : undefined
  const price = vipPrice(g, e) + (p?.amount ?? 0)
  if (g.character.money < price) {
    cantAfford(g, price, `the ${e.label.toLowerCase()}`)
    return false
  }
  useYearAction(g, eventKey(e.id), 1)
  addMoney(g, -price, 'leisure')
  count(g, 'vipEvents')

  if (id === 'gala') {
    const karma = p?.karma ?? 4
    addHidden(g, 'karma', karma)
    addHidden(g, 'fame', randInt(g, 1, 3) + (pledge === 'lavish' ? 2 : 0))
    addStat(g, 'happiness', randInt(g, 3, 7))
    count(g, 'charityDonated', price)
    if (p && p.amount > 0) remember(g, `Pledged ${formatMoney(p.amount)} to charity at a black-tie gala.`)
    log(g, p && p.amount > 0 ? `I pledged ${formatMoney(p.amount)} at a charity gala.` : 'I bought a table at a charity gala.', 'good')
  } else {
    addStat(g, 'happiness', randInt(g, 4, 9))
    addHidden(g, 'fame', randInt(g, e.id === 'premiere' || e.id === 'wedding' ? 1 : 0, e.id === 'premiere' ? 4 : 2))
    if (e.id === 'chefDinner') addStat(g, 'health', randInt(g, 0, 2))
    log(g, `I went to a ${e.label.toLowerCase()}.`, 'good')
  }

  if (chance(g, 0.18)) {
    addStat(g, 'happiness', -randInt(g, 3, 6))
    addHidden(g, 'fame', 1)
    if (e.id === 'nightclub' || e.id === 'wedding') addHidden(g, 'notoriety', randInt(g, 0, 2))
    log(g, `I embarrassed myself at a ${e.label.toLowerCase()}.`, 'bad')
    notice(g, 'Embarrassing!', embarrassment(g, e), { emoji: '😳', tone: 'bad' })
    return true
  }

  const metChance = e.id === 'gala' ? 0.3 : e.id === 'nightclub' ? 0.4 : 0.35
  const intro: Record<VipEventId, string> = {
    chefDinner: pickLine(g, ['Twelve courses, each the size of a postage stamp, each somehow perfect.', 'The chef came out to explain the foam. Nobody understood. Everyone applauded.']),
    wedding: pickLine(g, ['The vows made even the security team cry, and the doves arrived on cue.', 'A sunset ceremony on a cliff, a string quartet and a cake taller than you.']),
    gala:
      p && p.amount > 0
        ? `When the host announced your pledge of ${formatMoney(p.amount)}, the ballroom gave you a standing ovation.`
        : 'You ate a tiny salmon mousse, clapped politely for the speeches and felt very charitable.',
    premiere: pickLine(g, ['You walked the red carpet to a storm of flashbulbs. One photographer yelled your name. Probably your name.', 'The movie was three hours long and mostly explosions. The after-party was better.']),
    nightclub: pickLine(g, ['The bottles came out with sparklers and a parade of servers. The DJ shouted your name. You felt like a legend.', 'You danced until 4 AM in a roped-off booth above everyone else, exactly as nature intended.']),
  }
  if (chance(g, metChance)) {
    const occupation = e.id === 'chefDinner' && chance(g, 0.6) ? 'Celebrity Chef' : e.id === 'premiere' && chance(g, 0.6) ? 'Movie Star' : e.id === 'nightclub' && chance(g, 0.5) ? pickLine(g, ['Pop Star', 'Rapper', 'Supermodel']) : undefined
    const romantic = e.id !== 'gala' && chance(g, 0.5)
    meetCeleb(g, rollCeleb(g, occupation, romantic), `a ${e.label.toLowerCase()}`, intro[e.id])
    return true
  }
  notice(g, e.label, intro[e.id], { emoji: e.emoji, tone: 'good' })
  return true
}

function vipEventAction(e: VipEvent): MenuAction {
  return {
    type: 'action',
    id: `lux-vip-${e.id}`,
    label: e.label,
    emoji: e.emoji,
    subtitle: (g) => `${formatMoney(vipPrice(g, e))}${e.id === 'gala' ? ' a table' : e.id === 'wedding' ? ' gift' : e.id === 'nightclub' ? ' bottle service' : ' a seat'} · ${e.subtitle}`,
    disabledReason: (g) => vipReason(g, e),
    run: (g) => {
      if (e.id !== 'gala') {
        attendVipEvent(g, e.id)
        return
      }
      const table = vipPrice(g, e)
      const choices: ChoiceOption[] = galaPledges(g).map((p) => ({ id: p.id, label: p.amount > 0 ? `${p.label}: ${formatMoney(table + p.amount)}` : `${p.label}: ${formatMoney(table)}`, emoji: p.id === 'lavish' ? '💎' : p.id === 'generous' ? '💝' : '🎟️' }))
      choices.push({ id: 'cancel', label: 'Stay home', emoji: '🏠' })
      scriptChoice(g, GALA, '🎗️ Charity Gala', `A black-tie gala for ${pickLine(g, ['children\'s hospitals', 'ocean cleanup', 'clean water', 'animal shelters', 'cancer research', 'literacy'])}. A table costs ${formatMoney(table)}. Will you pledge more during the auction?`, choices, { emoji: '🎗️' })
    },
  }
}

export const vipEventsMenu: MenuGroup = {
  type: 'menu',
  id: 'luxuryVip',
  label: 'VIP Events',
  emoji: '🎟️',
  subtitle: 'Galas, premieres and celebrity parties',
  disabledReason: luxuryReason,
  header: (g) => `The velvet rope lifts for you. Each event comes around once a year. ${taxLine(g)}`.trim(),
  children: (): MenuNode[] => VIP_EVENTS.map(vipEventAction),
}
