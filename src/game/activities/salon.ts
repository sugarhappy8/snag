// Salon & Spa: hair salon, barber, massage, nails, tanning, waxing.
// Juveniles can only use the hair salon, barber and nail salon, and pay with their own money.
// Services follow the decades: Marcel waves and perms early on, tanning beds from the late
// seventies, spray tans and keratin treatments only recently.
import { addStat, count, log, scriptChoice, useYearAction } from '../core'
import { chance, pick, randInt } from '../rng'
import { pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import type { Avatar, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { addCondition, brokeNotice, gate, localPrice, money, result } from './common'

interface Service {
  id: string
  label: string
  emoji: string
  price: number
  looks: [number, number]
  happiness: [number, number]
  health?: [number, number]
  lines: string[]
  /** Optional mishap: chance, looks/happiness hit and text. */
  mishap?: { chance: number; text: string; log: string; looks: number }
  gender?: 'male' | 'female'
  minAge?: number
  /** Ask for a new hair color afterwards. */
  color?: boolean
  /** Years the service was offered (until = the year it went out of fashion). */
  since?: number
  until?: number
  /** Countries where it was around earlier (Thai massage in Thailand). */
  homeOf?: string[]
}

interface Section {
  id: string
  label: string
  emoji: string
  subtitle: string
  minAge: number
  services: Service[]
  since?: number
}

const SECTIONS: Section[] = [
  {
    id: 'hair',
    label: 'Hair Salon',
    emoji: '\u{1F487}',
    subtitle: 'Get your hair done',
    minAge: 14,
    services: [
      {
        id: 'cutColor',
        label: 'Cut & Color',
        emoji: '\u{1F3A8}',
        price: 65,
        looks: [2, 5],
        happiness: [2, 5],
        color: true,
        since: 1930,
        lines: ['Your stylist gave you a fresh cut and a whole new color. You keep catching yourself in shop windows.'],
        mishap: { chance: 0.08, text: 'Your stylist got distracted gossiping and dyed your hair a shade of green not found in nature.', log: 'My hair dye job went horribly wrong.', looks: -4 },
      },
      {
        id: 'cut',
        label: 'Cut Only',
        emoji: '\u{2702}\u{FE0F}',
        price: 15,
        looks: [1, 3],
        happiness: [1, 3],
        lines: [
          'You got a fresh haircut. You look sharp.',
          'Your stylist said "just a trim" and actually meant it. A miracle.',
          'You got a new haircut and three compliments before lunch.',
        ],
        mishap: { chance: 0.07, text: 'You asked for a trim. Your stylist heard "take it all off."', log: 'My haircut went wrong.', looks: -3 },
      },
      {
        id: 'color',
        label: 'Color Only',
        emoji: '\u{1F58C}\u{FE0F}',
        price: 45,
        looks: [1, 3],
        happiness: [1, 4],
        color: true,
        since: 1930,
        lines: ['Your stylist mixed the color with the precision of a chemist.'],
        mishap: { chance: 0.08, text: 'The color came out pumpkin orange. Your stylist called it "a bold choice."', log: 'My hair color came out orange.', looks: -3 },
      },
      {
        id: 'blowout',
        label: 'Blowout',
        emoji: '\u{1F4A8}',
        price: 12,
        looks: [1, 2],
        happiness: [2, 4],
        since: 1960,
        lines: ['Your stylist gave you a blowout with so much volume it has its own weather system.', 'Your hair looked fantastic. For about six hours, until it rained.'],
      },
      {
        id: 'marcel',
        label: 'Marcel Wave',
        emoji: '\u{1F30A}',
        price: 12,
        looks: [1, 3],
        happiness: [2, 4],
        until: 1945,
        lines: ['Your stylist heated the curling irons on the stove and set perfect waves in your hair. Very glamorous.'],
        mishap: { chance: 0.06, text: 'The curling iron was a little too hot. You can smell your own hair.', log: 'My Marcel wave singed my hair.', looks: -2 },
      },
      {
        id: 'perm',
        label: 'Perm',
        emoji: '\u{1F300}',
        price: 50,
        looks: [1, 4],
        happiness: [1, 4],
        since: 1920,
        lines: ['You walked out with a head full of bouncy curls and the faint smell of chemicals.'],
        mishap: { chance: 0.08, text: 'The perm went wrong. You look like you were electrocuted by a poodle.', log: 'My perm went horribly wrong.', looks: -3 },
      },
      {
        id: 'keratin',
        label: 'Keratin Treatment',
        emoji: '\u{2728}',
        price: 75,
        looks: [2, 4],
        happiness: [1, 3],
        since: 2005,
        lines: ['Your hair is now so smooth that birds keep trying to land on it and sliding off.'],
      },
      {
        id: 'extensions',
        label: 'Extensions',
        emoji: '\u{1F469}\u{200D}\u{1F9B0}',
        price: 200,
        looks: [3, 6],
        happiness: [2, 5],
        minAge: 16,
        since: 1990,
        lines: ['You walked in with short hair and walked out with a mane worthy of a shampoo commercial.'],
      },
    ],
  },
  {
    id: 'barber',
    label: 'Barber',
    emoji: '\u{1F488}',
    subtitle: 'Get a fresh cut',
    minAge: 14,
    services: [
      { id: 'buzz', label: 'Buzz Cut', emoji: '\u{1F488}', price: 10, looks: [0, 2], happiness: [0, 2], lines: ['The barber buzzed it all off in four minutes flat. Aerodynamic.'] },
      { id: 'fade', label: 'Fade', emoji: '\u{1F488}', price: 20, since: 1940, looks: [1, 3], happiness: [1, 3], lines: ['Your barber blended that fade so smooth it looked airbrushed.'], mishap: { chance: 0.05, text: 'Your barber sneezed mid-fade. You now have a bald spot shaped like a lightning bolt.', log: 'My barber messed up my fade.', looks: -3 } },
      { id: 'crew', label: 'Crew Cut', emoji: '\u{1F488}', price: 15, looks: [1, 2], happiness: [1, 2], lines: ['A classic crew cut. You look like you could run a small company.'] },
      { id: 'undercut', label: 'Undercut', emoji: '\u{1F488}', price: 20, looks: [1, 3], happiness: [1, 3], lines: ['Your undercut is crisp. You look like the lead singer of a band nobody has heard of.'] },
      { id: 'mullet', label: 'Mullet', emoji: '\u{1F488}', price: 15, since: 1972, looks: [-2, 3], happiness: [2, 5], lines: ['Business in the front, party in the back. Your barber took a photo for the wall of fame.'] },
      { id: 'pompadour', label: 'Pompadour', emoji: '\u{1F488}', price: 25, looks: [1, 3], happiness: [1, 3], lines: ['Your pompadour is so tall it has its own zip code.'] },
      { id: 'beard', label: 'Beard Trim', emoji: '\u{1F9D4}', price: 15, looks: [1, 2], happiness: [1, 2], gender: 'male', minAge: 16, lines: ['Your barber sculpted your beard into a work of art.'] },
      { id: 'shave', label: 'Hot Towel Shave', emoji: '\u{1FA92}', price: 30, looks: [1, 3], happiness: [2, 4], gender: 'male', minAge: 18, lines: ['A hot towel, a straight razor and total trust. Your face is smoother than a baby dolphin.'], mishap: { chance: 0.04, text: 'Your barber nicked your chin with the straight razor. You left with a tiny piece of tissue stuck to your face.', log: 'My barber cut me while shaving me.', looks: -1 } },
    ],
  },
  {
    id: 'massage',
    label: 'Massage',
    emoji: '\u{1F486}',
    subtitle: 'Relax your muscles',
    minAge: 18,
    services: [
      { id: 'deep', label: 'Deep Tissue', emoji: '\u{1F486}', price: 30, since: 1950, looks: [0, 0], happiness: [3, 6], health: [2, 5], lines: ['The masseuse found knots you didn’t know you had and destroyed every single one.'], mishap: { chance: 0.04, text: 'The masseuse went a little too deep. You walked out with a pulled muscle.', log: 'I pulled a muscle during a deep tissue massage.', looks: 0 } },
      { id: 'hotstone', label: 'Hot Stone', emoji: '\u{1FAA8}', price: 35, since: 1993, looks: [0, 0], happiness: [4, 7], health: [2, 4], lines: ['Warm stones, soft music, and you fell asleep and snored. Twice.'] },
      { id: 'shiatsu', label: 'Shiatsu', emoji: '\u{1F486}', price: 30, since: 1970, homeOf: ['jp'], looks: [0, 0], happiness: [3, 6], health: [2, 5], lines: ['The shiatsu therapist pressed on pressure points you didn’t know existed. You feel brand new.'] },
      { id: 'swedish', label: 'Swedish', emoji: '\u{1F486}', price: 25, looks: [0, 0], happiness: [3, 6], health: [1, 4], lines: ['A long, relaxing Swedish massage. You floated out of the spa like a cloud.'] },
      { id: 'thai', label: 'Thai', emoji: '\u{1F486}', price: 30, since: 1990, homeOf: ['th'], looks: [0, 0], happiness: [3, 6], health: [2, 5], lines: ['The Thai massage therapist folded you like a pretzel. Your spine cracked in eleven places. You feel incredible.'] },
    ],
  },
  {
    id: 'nails',
    label: 'Nail Salon',
    emoji: '\u{1F485}',
    subtitle: 'Get your nails done',
    minAge: 14,
    services: [
      { id: 'mani', label: 'Manicure', emoji: '\u{1F485}', price: 15, looks: [1, 2], happiness: [2, 4], lines: ['Your nails look flawless. You keep tapping them on tables for no reason.'], mishap: { chance: 0.02, text: 'A dirty file gave you a nasty nail fungus. Gross.', log: 'I got a nail fungus from the nail salon.', looks: -1 } },
      { id: 'pedi', label: 'Pedicure', emoji: '\u{1F9B6}', price: 20, looks: [1, 2], happiness: [2, 5], lines: ['Your feet were pampered like royalty. The foot scrub tickled so much you kicked the technician. Sorry.'] },
      { id: 'maniPedi', label: 'Manicure & Pedicure', emoji: '\u{1F485}', price: 30, looks: [1, 3], happiness: [3, 6], lines: ['Fingers and toes, all fabulous. You are now too fancy to do dishes.'] },
    ],
  },
  {
    id: 'tanning',
    label: 'Tanning Salon',
    emoji: '\u{1F31E}',
    subtitle: 'Get a glow',
    minAge: 18,
    since: 1978,
    services: [
      { id: 'spray', label: 'Spray Tan', emoji: '\u{1F9F4}', price: 12, since: 1999, looks: [1, 4], happiness: [1, 3], lines: ['You got a spray tan. You look like you just got back from a beach vacation you never took.'], mishap: { chance: 0.15, text: 'The spray tan came out so orange that a child asked if you were a traffic cone.', log: 'My spray tan turned me orange.', looks: -3 } },
      { id: 'bed', label: 'Tanning Bed', emoji: '\u{1F31E}', price: 15, looks: [2, 4], happiness: [1, 3], lines: ['You baked in the tanning bed for 15 minutes and came out golden.'], mishap: { chance: 0.08, text: 'You fell asleep in the tanning bed and came out looking like a boiled lobster.', log: 'I got a horrible sunburn in a tanning bed.', looks: -3 } },
    ],
  },
  {
    id: 'waxing',
    label: 'Waxing Salon',
    emoji: '\u{1FAD7}',
    subtitle: 'Smooth things over',
    minAge: 18,
    since: 1960,
    services: [
      { id: 'brows', label: 'Eyebrow Wax', emoji: '\u{1F441}\u{FE0F}', price: 15, looks: [1, 2], happiness: [0, 2], lines: ['Your brows are now perfectly arched. You look permanently intrigued.'], mishap: { chance: 0.05, text: 'The technician took off half an eyebrow. You look permanently surprised.', log: 'A waxing accident took off half my eyebrow.', looks: -3 } },
      { id: 'legs', label: 'Leg Wax', emoji: '\u{1F9B5}', price: 40, looks: [1, 2], happiness: [-1, 2], lines: ['Your legs are smooth as glass. The screaming was mostly internal.'] },
      { id: 'back', label: 'Back Wax', emoji: '\u{1FAD7}', price: 45, looks: [1, 3], happiness: [-2, 1], lines: ['You yelped so loudly during your back wax that the front desk called to check on you.'] },
      { id: 'full', label: 'Full Body Wax', emoji: '\u{1FAD7}', price: 70, looks: [1, 3], happiness: [-3, 2], lines: ['You got waxed from head to toe. You are now as hairless as a dolphin and twice as traumatized.'] },
    ],
  },
]

const HAIR_COLORS: { id: Avatar['hair']; label: string; emoji: string }[] = [
  { id: 'black', label: 'Jet Black', emoji: '\u{1F5A4}' },
  { id: 'brown', label: 'Chocolate Brown', emoji: '\u{1F90E}' },
  { id: 'blonde', label: 'Platinum Blonde', emoji: '\u{1F49B}' },
  { id: 'red', label: 'Fiery Red', emoji: '❤\u{FE0F}' },
  { id: 'gray', label: 'Silver', emoji: '\u{1FA76}' },
]

const SERVICE_LIMIT = 2
/** Most looks a salon can add in one year. */
const LOOKS_CAP = 10
const LOOKS_KEY = 'act.salon.looks'

const COLOR_SCRIPT = defineScript('act.salon.color', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const color = HAIR_COLORS.find((h) => h.id === choice) ?? HAIR_COLORS[1]
  const before = g.character.avatar.hair
  g.character.avatar.hair = color.id
  const text = typeof d.text === 'string' ? d.text : 'Your stylist worked their magic.'
  log(g, before === color.id ? 'I got my hair colored.' : `I dyed my hair ${color.label.toLowerCase()}.`, 'good')
  result(g, 'New Look', `${text}\n\nYou're now rocking ${color.label.toLowerCase()} hair.`, color.emoji, 'good')
})

function doService(g: GameState, section: Section, s: Service): void {
  const c = g.character
  const key = `act.salon.${section.id}.${s.id}`
  if ((g.yearActions[key] ?? 0) >= SERVICE_LIMIT) {
    result(g, section.label, pickSite(g, [
      `You've already had a ${s.label.toLowerCase()} twice this year. Give it a rest.`,
      'Your stylist says there is nothing left to improve this year. Come back next year.',
      "The salon won't book you again this year. They need a break from you.",
    ], 0x26d627dc), section.emoji)
    return
  }
  const cost = localPrice(g, s.price)
  if (c.money < cost) {
    brokeNotice(g, cost, `a ${s.label.toLowerCase()}`)
    return
  }
  c.money -= cost
  useYearAction(g, key, SERVICE_LIMIT)
  count(g, 'salonVisits')
  if (s.mishap && chance(g, s.mishap.chance)) {
    addStat(g, 'looks', s.mishap.looks)
    addStat(g, 'happiness', -randInt(g, 3, 7))
    if (s.id === 'mani') addCondition(g, 'Nail Fungus', 'disease', randInt(g, 3, 6), { curable: true, diagnosed: true })
    if (s.id === 'deep') addCondition(g, 'Pulled Muscle', 'injury', randInt(g, 5, 10))
    if (s.id === 'bed' && chance(g, 0.15)) addCondition(g, 'Skin Cancer', 'disease', randInt(g, 25, 40), { curable: true, diagnosed: false })
    log(g, s.mishap.log, 'bad')
    result(g, 'Disaster', s.mishap.text, '\u{1F631}', 'bad')
    return
  }
  // There's only so much a salon can do in one year.
  const gained = g.yearActions[LOOKS_KEY] ?? 0
  let looks = randInt(g, s.looks[0], s.looks[1])
  if (looks > 0) looks = Math.min(looks, Math.max(0, LOOKS_CAP - gained))
  if (looks > 0) g.yearActions[LOOKS_KEY] = gained + looks
  addStat(g, 'looks', looks)
  addStat(g, 'happiness', randInt(g, s.happiness[0], s.happiness[1]))
  if (s.health) addStat(g, 'health', randInt(g, s.health[0], s.health[1]))
  const text = pick(g, s.lines)
  if (s.color) {
    scriptChoice(
      g,
      COLOR_SCRIPT,
      'Pick a Color',
      'Your stylist is mixing the dye. What color do you want?',
      HAIR_COLORS.map((h) => ({ id: h.id, label: h.label, emoji: h.emoji })),
      { emoji: '\u{1F3A8}', data: { text } },
    )
    return
  }
  const verb = section.id === 'massage' ? `got a ${s.label.toLowerCase()} massage` : section.id === 'waxing' ? `got a ${s.label.toLowerCase()}` : `got a ${s.label.toLowerCase()}`
  log(g, `I ${verb}.`, 'good')
  const capped = looks === 0 && s.looks[1] > 0 && gained >= LOOKS_CAP ? "\n\nYou look great, but there's only so much a salon can do in one year." : ''
  result(g, s.label, text + capped, s.emoji, 'good')
}

/** Was this service on offer here this year? */
function offered(g: GameState, s: Service): boolean {
  if (s.until !== undefined && g.year >= s.until) return false
  if (s.since === undefined || g.year >= s.since) return true
  return !!s.homeOf?.includes(g.character.countryId)
}

function sectionMenu(section: Section): MenuGroup {
  return {
    type: 'menu',
    id: `salon.${section.id}`,
    label: section.label,
    emoji: section.emoji,
    subtitle: section.subtitle,
    disabledReason: (g) => gate(g, { minAge: section.minAge }),
    children: (g): MenuNode[] =>
      section.services
        .filter((s) => (!s.gender || s.gender === g.character.gender) && offered(g, s))
        .map(
          (s): MenuAction => ({
            type: 'action',
            id: `salon.${section.id}.${s.id}`,
            label: s.label,
            emoji: s.emoji,
            subtitle: (st) => money(localPrice(st, s.price)),
            disabledReason: (st) => gate(st, { minAge: s.minAge ?? section.minAge }),
            run: (d) => doService(d, section, s),
          }),
        ),
  }
}

export const salonMenu: MenuGroup = {
  type: 'menu',
  id: 'salon',
  label: 'Salon & Spa',
  emoji: '\u{1F487}',
  subtitle: 'Take time for yourself',
  disabledReason: (g) => gate(g, { minAge: 14 }),
  header: (g) => (g.character.age < 18 ? "You'll have to pay with your own money. Your parents only pay for the doctor." : 'Pamper yourself.'),
  children: (g) => SECTIONS.filter((s) => g.year >= (s.since ?? 0)).map(sectionMenu),
}
