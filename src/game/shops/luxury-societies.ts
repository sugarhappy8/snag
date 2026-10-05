// Luxury Lifestyle › Secret Societies: ten very exclusive, very silly clubs for the very rich.
// Join (fee + an initiation popup), pay yearly dues, collect perks (deals, fame, karma...),
// risk being exposed by the press, leave, or get expelled. State lives in g.flags as plain JSON:
//   'luxury.society'        { id, since, years, rank } while a member
//   'luxury.societyBanned'  ids of societies that expelled you
//   'luxury.societyRejected' { id: year } failed initiations (try again next year)
import { nicePrice } from '../assets'
import { addHidden, addStat, count, earnIncome, formatMoney, inPrison, log, netWorth, notice, remember, scriptChoice, shortMoney, spend, useYearAction } from '../core'
import { localMarket } from '../data/markets'
import { taxAdditionalIncome } from '../finance'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { ChoiceOption, GameState, MenuAction, MenuGroup, MenuNode, StatKey } from '../types'
import { cantAfford, luxuryBlock, luxuryReason, num, obj, str, strList, takePopup, type PopupBudget } from './luxury-common'

type Perk = 'deals' | 'fame' | 'karma' | 'smarts' | 'bliss' | 'tips'

interface InitiationOption {
  id: string
  label: string
  emoji: string
  /** Chance to pass the initiation with this answer. */
  pass: number
}

export interface Society {
  id: string
  name: string
  emoji: string
  motto: string
  blurb: string
  /** One-time initiation fee (US dollars; these are global clubs). */
  fee: number
  /** Yearly dues. */
  dues: number
  perk: Perk
  perkText: string
  /** Base chance per year that the press exposes you as a member. */
  exposure: number
  minWorth: number
  minFame?: number
  minKarma?: number
  maxNotoriety?: number
  initiation: { text: string; options: InitiationOption[] }
}

export const SOCIETIES: Society[] = [
  {
    id: 'walrus',
    name: 'The Order of the Gilded Walrus',
    emoji: '🦭',
    motto: 'Tusks Together, Taxes Never',
    blurb: 'Old money. Very old. Some members still invoice in gold bullion.',
    fee: 12_000_000,
    dues: 600_000,
    perk: 'deals',
    perkText: 'Fellow walruses steer business deals your way',
    exposure: 0.04,
    minWorth: 25_000_000,
    initiation: {
      text: 'In a candlelit hall, the Grand Walrus asks you to prove your worth. A tray is brought in.',
      options: [
        { id: 'oyster', label: 'Swallow an oyster whole, with dignity', emoji: '🦪', pass: 0.85 },
        { id: 'speech', label: 'Give a speech about inherited wealth', emoji: '🎩', pass: 0.6 },
        { id: 'laugh', label: 'Laugh at the walrus costumes', emoji: '😂', pass: 0.15 },
      ],
    },
  },
  {
    id: 'owl',
    name: 'The Fellowship of the Unblinking Owl',
    emoji: '🦉',
    motto: 'We See Everything. We Blink Nothing.',
    blurb: 'Bankers, judges and one very old weather presenter who meet in a forest once a year.',
    fee: 9_000_000,
    dues: 450_000,
    perk: 'tips',
    perkText: 'Whispered market tips that are suspiciously accurate',
    exposure: 0.05,
    minWorth: 10_000_000,
    initiation: {
      text: 'Hooded figures lead you into a forest clearing and challenge you to a staring contest with a stuffed owl.',
      options: [
        { id: 'stare', label: 'Do not blink. Ever.', emoji: '👁️', pass: 0.7 },
        { id: 'hoot', label: 'Hoot respectfully', emoji: '🦉', pass: 0.5 },
        { id: 'blink', label: 'Blink, then wink at the owl', emoji: '😉', pass: 0.1 },
      ],
    },
  },
  {
    id: 'velvet',
    name: 'The Velvet Rope Lodge',
    emoji: '🎭',
    motto: 'Be Seen. Never Be Seen Being Seen.',
    blurb: 'Movie stars, pop royalty and their publicists, in a lodge with excellent lighting.',
    fee: 7_000_000,
    dues: 400_000,
    perk: 'fame',
    perkText: 'Invitations, magazine covers and very famous friends',
    exposure: 0.08,
    minWorth: 5_000_000,
    minFame: 20,
    initiation: {
      text: 'You must walk a pitch-black runway while the members judge your entrance.',
      options: [
        { id: 'strut', label: 'Strut like the cameras are on', emoji: '💃', pass: 0.8 },
        { id: 'humble', label: 'Walk humbly with your head down', emoji: '🙇', pass: 0.35 },
        { id: 'selfie', label: 'Stop halfway for a selfie', emoji: '🤳', pass: 0.5 },
      ],
    },
  },
  {
    id: 'stocks',
    name: 'Skull & Stocks',
    emoji: '💀',
    motto: 'Buy Low. Sell Souls.',
    blurb: 'Hedge fund managers who meet in a vault and speak only in acronyms.',
    fee: 15_000_000,
    dues: 900_000,
    perk: 'deals',
    perkText: 'Lucrative deals, with a faint smell of insider trading',
    exposure: 0.09,
    minWorth: 50_000_000,
    initiation: {
      text: 'You are locked in a vault with a trading terminal and told to turn $1 million into $2 million before the candle burns out.',
      options: [
        { id: 'short', label: 'Short something with a cool name', emoji: '📉', pass: 0.6 },
        { id: 'leverage', label: 'Leverage everything 50x', emoji: '🎰', pass: 0.45 },
        { id: 'index', label: 'Buy an index fund and wait', emoji: '🐢', pass: 0.2 },
      ],
    },
  },
  {
    id: 'bookclub',
    name: 'The Illuminati-Adjacent Book Club',
    emoji: '📚',
    motto: 'We Know Things. Mostly About Books.',
    blurb: 'Not the Illuminati. They are very clear about that. They do share a parking lot.',
    fee: 3_000_000,
    dues: 150_000,
    perk: 'smarts',
    perkText: 'Brilliant debates, first editions and suspiciously good gossip',
    exposure: 0.03,
    minWorth: 5_000_000,
    initiation: {
      text: 'The chairperson hands you a 900-page novel and asks for your honest opinion.',
      options: [
        { id: 'deep', label: 'Discuss the symbolism of the lighthouse', emoji: '🗼', pass: 0.8 },
        { id: 'film', label: 'Say you preferred the movie', emoji: '🎬', pass: 0.2 },
        { id: 'bluff', label: 'Bluff using only the back cover', emoji: '🙃', pass: 0.45 },
      ],
    },
  },
  {
    id: 'croissant',
    name: 'The Circle of the Seventh Croissant',
    emoji: '🥐',
    motto: 'Butter Is Power',
    blurb: 'Gourmets and aristocrats who settle world affairs over pastries at dawn.',
    fee: 6_000_000,
    dues: 300_000,
    perk: 'bliss',
    perkText: 'Secret dinners, vintage wine and pure contentment',
    exposure: 0.03,
    minWorth: 5_000_000,
    initiation: {
      text: 'Seven croissants are placed in front of you. Six are ordinary. One is sacred.',
      options: [
        { id: 'sniff', label: 'Sniff each one like a sommelier', emoji: '👃', pass: 0.75 },
        { id: 'all', label: 'Eat all seven to be sure', emoji: '😋', pass: 0.5 },
        { id: 'gluten', label: 'Ask if there is a gluten-free option', emoji: '🙅', pass: 0.1 },
      ],
    },
  },
  {
    id: 'midnight',
    name: 'The Midnight Philanthropists',
    emoji: '🌙',
    motto: 'Give Big. Tell No One. Mostly.',
    blurb: 'Billionaires who do good deeds anonymously, then hint about them at dinner parties.',
    fee: 5_000_000,
    dues: 500_000,
    perk: 'karma',
    perkText: 'Anonymous good deeds and a warm, smug glow',
    exposure: 0.02,
    minWorth: 5_000_000,
    minKarma: 55,
    initiation: {
      text: 'At midnight, you are handed an envelope of cash and told to make a stranger\'s life better without being seen.',
      options: [
        { id: 'tip', label: 'Leave it as a tip for a night-shift nurse', emoji: '🏥', pass: 0.9 },
        { id: 'bank', label: 'Keep some for "admin costs"', emoji: '🤑', pass: 0.05 },
        { id: 'post', label: 'Do it, but film it for social media', emoji: '📱', pass: 0.25 },
      ],
    },
  },
  {
    id: 'thermostat',
    name: 'The Ancient Order of the Hidden Thermostat',
    emoji: '🌡️',
    motto: 'We Control the Climate. Indoors.',
    blurb: 'A centuries-old society that controls the temperature of every boardroom on Earth.',
    fee: 8_000_000,
    dues: 350_000,
    perk: 'bliss',
    perkText: 'Every room you enter is exactly the right temperature',
    exposure: 0.03,
    minWorth: 10_000_000,
    initiation: {
      text: 'You are shown the Sacred Thermostat. The Elders ask what temperature it should be set to.',
      options: [
        { id: '21', label: '21 °C (70 °F). Perfection.', emoji: '😌', pass: 0.8 },
        { id: '16', label: 'Cold. Bring a sweater.', emoji: '🥶', pass: 0.35 },
        { id: '30', label: 'Tropical. Always tropical.', emoji: '🥵', pass: 0.25 },
      ],
    },
  },
  {
    id: 'avocado',
    name: 'The Brotherhood & Sisterhood of the Golden Avocado',
    emoji: '🥑',
    motto: 'Disrupt Everything, Especially Brunch',
    blurb: 'Tech founders who meet at a ranch to microdose kale and plan the future of humanity.',
    fee: 10_000_000,
    dues: 500_000,
    perk: 'deals',
    perkText: 'Seed rounds, board seats and early access to things that may not be legal yet',
    exposure: 0.07,
    minWorth: 20_000_000,
    initiation: {
      text: 'You must pitch a startup idea to the members in under 30 seconds.',
      options: [
        { id: 'ai', label: 'Uber for houseplants, but with AI', emoji: '🪴', pass: 0.75 },
        { id: 'honest', label: 'A company that pays its taxes', emoji: '🧾', pass: 0.15 },
        { id: 'crypto', label: 'A blockchain for avocados', emoji: '⛓️', pass: 0.55 },
      ],
    },
  },
  {
    id: 'monocle',
    name: 'The League of the Lost Monocle',
    emoji: '🧐',
    motto: 'Find the Monocle. Rule the World.',
    blurb: 'Dukes, oil heirs and one confused lottery winner searching for a monocle lost in 1887.',
    fee: 20_000_000,
    dues: 1_200_000,
    perk: 'fame',
    perkText: 'Titles, portraits and front-row seats at every coronation',
    exposure: 0.05,
    minWorth: 100_000_000,
    maxNotoriety: 60,
    initiation: {
      text: 'The Duke asks you to examine a velvet box and declare whether it contains the Lost Monocle.',
      options: [
        { id: 'yes', label: 'Gasp: "It\'s the Monocle!"', emoji: '😮', pass: 0.4 },
        { id: 'no', label: 'Calmly: "A fake. The real one had a scratch."', emoji: '🧐', pass: 0.8 },
        { id: 'pocket', label: 'Slip it into your pocket', emoji: '🫣', pass: 0.1 },
      ],
    },
  },
]

export const RANKS = ['Initiate', 'Member', 'Elder', 'Grand Poobah']

export interface Membership {
  id: string
  since: number
  years: number
  rank: number
}

const MEMBER_KEY = 'luxury.society'
const BANNED_KEY = 'luxury.societyBanned'
const REJECTED_KEY = 'luxury.societyRejected'

export function societyById(id: string): Society | undefined {
  return SOCIETIES.find((s) => s.id === id)
}

/** The player's current membership, if any (tolerates old or hand-edited saves). */
export function membership(g: GameState): Membership | null {
  const o = obj(g.flags[MEMBER_KEY])
  if (!o) return null
  const id = str(o.id)
  if (!societyById(id)) return null
  return { id, since: num(o.since), years: Math.max(0, num(o.years)), rank: Math.max(0, Math.min(RANKS.length - 1, num(o.rank))) }
}

function saveMembership(g: GameState, m: Membership): void {
  g.flags[MEMBER_KEY] = { id: m.id, since: m.since, years: m.years, rank: m.rank }
}

export function currentSociety(g: GameState): Society | null {
  const m = membership(g)
  return m ? (societyById(m.id) ?? null) : null
}

function bannedFrom(g: GameState): string[] {
  return strList(g.flags[BANNED_KEY])
}

function rejectedThisYear(g: GameState, id: string): boolean {
  const o = obj(g.flags[REJECTED_KEY])
  return !!o && num(o[id], -1) === g.year
}

function rankName(m: Membership): string {
  return RANKS[m.rank] ?? RANKS[0]
}

/** Why the player can't ask to join this society (null = they can). */
export function joinReason(g: GameState, s: Society): string | null {
  const r = luxuryReason(g)
  if (r) return r
  const m = membership(g)
  if (m?.id === s.id) return "You're already a member."
  if (m) return `Secret societies don't share members. Leave ${societyById(m.id)?.name ?? 'your society'} first.`
  if (bannedFrom(g).includes(s.id)) return `${s.name} expelled you. They never forget. They have a whole room for grudges.`
  if (rejectedThisYear(g, s.id)) return 'You failed the initiation this year. Try again next year.'
  const c = g.character
  const worth = netWorth(g)
  if (worth < s.minWorth) return `Members need a net worth of at least ${shortMoney(s.minWorth)}. You need ${formatMoney(s.minWorth - worth)} more.`
  if (s.minFame && c.hidden.fame < s.minFame) return 'They only admit people the paparazzi already know. Get more famous first.'
  if (s.minKarma && c.hidden.karma < s.minKarma) return 'They looked into your past deeds and politely declined. Maybe do some good first.'
  if (s.maxNotoriety !== undefined && c.hidden.notoriety > s.maxNotoriety) return 'Your reputation is too scandalous, even for them.'
  if (c.money < s.fee) return `The initiation fee is ${formatMoney(s.fee)} in cash, and you have ${formatMoney(Math.max(0, c.money))}.`
  return null
}

const INITIATE = defineScript('luxury.society.initiate', (g, choice, data) => {
  const id = str(obj(data)?.society)
  const s = societyById(id)
  if (!s || choice === 'flee') {
    if (s) notice(g, 'Second Thoughts', `You backed out of the ${s.name} initiation and walked out into the night. Nobody followed you. Probably.`, { emoji: '🚪' })
    return
  }
  const opt = s.initiation.options.find((o) => o.id === choice)
  if (!opt) return
  const reason = joinReason(g, s)
  if (reason) {
    notice(g, s.name, reason, { emoji: s.emoji })
    return
  }
  if (!chance(g, opt.pass)) {
    const rejected = obj(g.flags[REJECTED_KEY]) ?? {}
    g.flags[REJECTED_KEY] = { ...rejected, [s.id]: g.year }
    addStat(g, 'happiness', -4)
    log(g, `I failed the initiation for a secret society.`, 'bad')
    notice(g, 'Initiation Failed', `The hooded members conferred in whispers, then blew out every candle at once. When the lights came on, your coat had been placed outside the door. ${s.name} will consider you again next year.`, { emoji: s.emoji, tone: 'bad' })
    return
  }
  joinSociety(g, s)
})

/** Pay the fee and become a member (initiation already passed). Returns false when broke. */
export function joinSociety(g: GameState, s: Society): boolean {
  if (!spend(g, s.fee)) {
    cantAfford(g, s.fee, `the ${s.name} initiation fee`)
    return false
  }
  saveMembership(g, { id: s.id, since: g.character.age, years: 0, rank: 0 })
  count(g, 'secretSocieties')
  addStat(g, 'happiness', randInt(g, 6, 10))
  remember(g, `Was initiated into ${s.name}, a secret society for the ultra-rich.`)
  log(g, `I was initiated into ${s.name}.`, 'good')
  notice(g, 'Welcome, Initiate', `You passed! You paid the ${formatMoney(s.fee)} initiation fee, received a hooded robe, a secret handshake and a ring you must never photograph. Dues are ${formatMoney(s.dues)} a year. Motto: "${s.motto}."`, { emoji: s.emoji, tone: 'good' })
  return true
}

function requestAction(s: Society): MenuAction {
  return {
    type: 'action',
    id: `lux-soc-${s.id}`,
    label: s.name,
    emoji: s.emoji,
    subtitle: `${shortMoney(s.fee)} to join · ${shortMoney(s.dues)}/yr · ${s.perkText}`,
    disabledReason: (g) => joinReason(g, s),
    confirm: () => `${s.blurb}\n\nJoining costs ${formatMoney(s.fee)} (paid only if you pass the initiation), then ${formatMoney(s.dues)} a year in dues. Request an invitation?`,
    run: (g) => {
      const reason = joinReason(g, s)
      if (reason) {
        notice(g, s.name, reason, { emoji: s.emoji })
        return
      }
      const choices: ChoiceOption[] = [...s.initiation.options.map((o) => ({ id: o.id, label: o.label, emoji: o.emoji })), { id: 'flee', label: 'Run for the exit', emoji: '🏃' }]
      scriptChoice(g, INITIATE, `${s.emoji} The Initiation`, `A black envelope arrived with no stamp. Tonight you were blindfolded and driven somewhere with a lot of candles. ${s.initiation.text}`, choices, { emoji: s.emoji, data: { society: s.id } })
    },
  }
}

/** Leave voluntarily (no refunds). */
export function leaveSociety(g: GameState): boolean {
  const s = currentSociety(g)
  if (!s) return false
  delete g.flags[MEMBER_KEY]
  addStat(g, 'happiness', -2)
  log(g, `I left ${s.name}.`)
  notice(g, 'You Left', pick(g, [`You handed back your robe and ring. ${s.name} thanked you for your service. A black car followed you home for a week, just to be sure.`, `You resigned from ${s.name}. Someone slid a note under your door: "We'll be watching. Respectfully."`, `You quit ${s.name}. Your former brothers and sisters now pretend not to know you at galas, which is honestly a relief.`]), { emoji: '🚪' })
  return true
}

/** Expel the player (unpaid dues, prison, scandal). Always shows a notice. */
export function expelFromSociety(g: GameState, why: string): void {
  const s = currentSociety(g)
  if (!s) return
  delete g.flags[MEMBER_KEY]
  g.flags[BANNED_KEY] = [...bannedFrom(g).filter((x) => x !== s.id), s.id]
  addStat(g, 'happiness', -6)
  log(g, `I was expelled from ${s.name}.`, 'bad')
  remember(g, `Was expelled from the secret society ${s.name}.`)
  notice(g, 'Expelled!', `${why} ${s.name} has expelled you. They burned your robe in a small, dignified ceremony and changed the secret handshake.`, { emoji: s.emoji, tone: 'bad' })
}

function meetingAction(): MenuAction {
  return {
    type: 'action',
    id: 'lux-soc-meeting',
    label: 'Attend a Secret Meeting',
    emoji: '🕯️',
    subtitle: 'Robes, candles and networking',
    disabledReason: luxuryBlock,
    run: (g) => {
      const m = membership(g)
      const s = currentSociety(g)
      if (!m || !s) return
      if (!useYearAction(g, 'luxury.societyMeeting', 1)) {
        notice(g, 'Secret Meeting', 'The next meeting is next year. The location will be sent by carrier pigeon.', { emoji: '🕊️' })
        return
      }
      const scene = pick(g, [
        'You chanted in Latin, voted on the price of gold and ate tiny sandwiches.',
        'The members debated whether to cancel a small country\'s weekend. It was tabled until next year.',
        'You sat in a circle of candles while an Elder read the minutes from 1743.',
        'The meeting was mostly about the parking situation at the secret lair.',
      ])
      applyPerk(g, s, m, 0.5, true)
      addStat(g, 'happiness', randInt(g, 2, 5))
      log(g, `I attended a secret meeting of ${s.name}.`)
      notice(g, 'Secret Meeting', `${scene} ${perkLine(s)}`, { emoji: '🕯️', tone: 'good' })
    },
  }
}

function leaveAction(): MenuAction {
  return {
    type: 'action',
    id: 'lux-soc-leave',
    label: 'Leave the Society',
    emoji: '🚪',
    subtitle: 'No refunds. No questions. Some questions.',
    visible: (g) => !!membership(g),
    disabledReason: (g) => (g.character.alive ? null : "You're dead."),
    confirm: (g) => `Leave ${currentSociety(g)?.name ?? 'the society'}? Your initiation fee is not refundable.`,
    run: (g) => {
      leaveSociety(g)
    },
  }
}

function perkLine(s: Society): string {
  return `Perk: ${s.perkText.charAt(0).toLowerCase()}${s.perkText.slice(1)}.`
}

/** How much a deal or tip is worth this year: grows with rank and local "connections". */
export function dealValue(g: GameState, s: Society, m: Membership, scale: number): number {
  const corruption = Math.max(0, Math.min(100, num(localMarket(g).corruption, 40)))
  const base = s.dues * (1.2 + m.rank * 0.6) * (1 + corruption / 200)
  return nicePrice(Math.max(10_000, base * scale))
}

/**
 * Apply the society's perk (scale 1 for the yearly perk, 0.5 for a meeting). Money that arrives
 * after this year's taxes were settled (meetings, popups) is taxed right away (`taxNow`).
 */
function applyPerk(g: GameState, s: Society, m: Membership, scale: number, taxNow: boolean): void {
  const stat = (key: StatKey, lo: number, hi: number) => addStat(g, key, Math.max(1, Math.round(randInt(g, lo, hi) * scale)))
  switch (s.perk) {
    case 'deals':
    case 'tips': {
      const amount = nicePrice(dealValue(g, s, m, scale) * randInt(g, s.perk === 'tips' ? 40 : 60, s.perk === 'tips' ? 260 : 200) / 100)
      earnIncome(g, amount)
      if (taxNow) taxAdditionalIncome(g, amount)
      count(g, 'societyIncome', amount)
      log(g, s.perk === 'tips' ? `A tip from ${s.name} earned me ${formatMoney(amount)}.` : `Fellow members of ${s.name} sent a deal my way worth ${formatMoney(amount)}.`, 'good')
      return
    }
    case 'fame':
      addHidden(g, 'fame', Math.max(1, Math.round(randInt(g, 2, 4) * scale)))
      return
    case 'karma':
      addHidden(g, 'karma', Math.max(1, Math.round(randInt(g, 2, 5) * scale)))
      stat('happiness', 1, 3)
      return
    case 'smarts':
      stat('smarts', 2, 4)
      return
    case 'bliss':
      stat('happiness', 3, 6)
      stat('health', 1, 2)
      return
  }
}

// ---------------------------------------------------------------------------
// Menu

function memberNodes(g: GameState): MenuNode[] {
  const m = membership(g)
  const s = currentSociety(g)
  if (!m || !s) return []
  const rows = [
    `${s.emoji} ${s.name} · "${s.motto}"`,
    `🎖️ Rank: ${rankName(m)} · member since age ${m.since} (${m.years} year${m.years === 1 ? '' : 's'})`,
    `🧾 Dues: ${formatMoney(s.dues)} a year, paid every birthday`,
    `🎁 ${s.perkText}`,
  ]
  return [
    { type: 'heading', id: 'lux-soc-mine', label: 'Your Society' },
    ...rows.map((text, i): MenuNode => ({ type: 'info', id: `lux-soc-info-${i}`, text })),
    meetingAction(),
    leaveAction(),
  ]
}

export const secretSocietiesMenu: MenuGroup = {
  type: 'menu',
  id: 'luxurySocieties',
  label: 'Secret Societies',
  emoji: '🕯️',
  subtitle: (g) => {
    const s = currentSociety(g)
    return s ? `Member of ${s.name}` : 'Robes, rituals and very good connections'
  },
  disabledReason: (g) => luxuryBlock(g) ?? (membership(g) ? null : luxuryReason(g)),
  header: () => 'They do not exist. They meet on Thursdays. Fees are paid in cash, dues every birthday, and nobody talks about it. Ever.',
  children: (g) => {
    const mine = membership(g)
    const others = SOCIETIES.filter((s) => s.id !== mine?.id)
    return [...memberNodes(g), { type: 'heading', id: 'lux-soc-all', label: mine ? 'Other Societies' : 'Request an Invitation' }, ...others.map(requestAction)]
  },
}

// ---------------------------------------------------------------------------
// Yearly: dues, perks, rank, exposure and expulsion

const SUMMONS = defineScript('luxury.society.summons', (g, choice, data) => {
  const s = currentSociety(g)
  const m = membership(g)
  if (!s || !m || str(obj(data)?.society) !== s.id) return
  if (choice === 'comply') {
    addHidden(g, 'craziness', 2)
    applyPerk(g, s, m, 1, true)
    if (m.rank < RANKS.length - 1 && chance(g, 0.4)) {
      m.rank += 1
      saveMembership(g, m)
      notice(g, 'Promoted', `You did it without asking a single question. The Elders were impressed and raised you to ${rankName(m)}.`, { emoji: s.emoji, tone: 'good' })
      return
    }
    notice(g, 'Loyal Member', `You did as you were told. Nobody explained why. ${perkLine(s)}`, { emoji: s.emoji, tone: 'good' })
  } else if (choice === 'question') {
    if (chance(g, 0.5)) {
      notice(g, 'Fair Question', 'The Elders conferred and admitted nobody remembers why they do this. The tradition was quietly retired.', { emoji: s.emoji })
    } else if (m.rank > 0) {
      m.rank -= 1
      saveMembership(g, m)
      notice(g, 'Demoted', `Asking questions is frowned upon. You've been demoted to ${rankName(m)}.`, { emoji: s.emoji, tone: 'bad' })
    } else {
      notice(g, 'Noted', 'Asking questions is frowned upon. Your name was written in a very small, very old book.', { emoji: s.emoji, tone: 'bad' })
    }
  } else {
    if (chance(g, 0.35)) {
      expelFromSociety(g, 'You ignored a summons from the Elders.')
      return
    }
    notice(g, 'Ignored', 'You ignored the summons. A raven has been sitting on your windowsill ever since, staring.', { emoji: '🐦‍⬛' })
  }
})

const SUMMONS_TASKS = [
  'deliver a sealed envelope to a lighthouse at 3 AM',
  'wear a powdered wig to a business meeting and not mention it',
  'buy an entire vineyard and leave it empty',
  'learn to play the oboe by the next full moon',
  'host a dinner where everyone must speak in rhyme',
  'carry a live goose to the annual meeting',
]

/** Yearly: dues, rank, perks, exposure and expulsion. Mandatory notices ignore the popup budget. */
export function yearlySocieties(g: GameState, budget: PopupBudget): void {
  const m = membership(g)
  const s = currentSociety(g)
  if (!m || !s) return
  const c = g.character
  if (inPrison(g)) {
    expelFromSociety(g, 'Members are not allowed to be convicted of anything. Getting caught is the one unforgivable sin.')
    return
  }
  if (c.money < s.dues) {
    expelFromSociety(g, `You couldn't pay this year's ${formatMoney(s.dues)} in dues.`)
    return
  }
  spend(g, s.dues)
  count(g, 'societyDues', s.dues)
  log(g, `I paid ${formatMoney(s.dues)} in dues to a club that does not exist.`)
  m.years += 1
  if (m.rank < RANKS.length - 1 && m.years >= (m.rank + 1) * 4) {
    m.rank += 1
    log(g, `I was promoted to ${RANKS[m.rank]} in ${s.name}.`, 'good')
  }
  saveMembership(g, m)
  applyPerk(g, s, m, 1, false)

  if (s.maxNotoriety !== undefined && c.hidden.notoriety > s.maxNotoriety + 15) {
    expelFromSociety(g, 'Your scandals have become an embarrassment to the brotherhood and sisterhood.')
    return
  }

  // A freer press digs harder: exposure is likelier where corruption is low.
  const corruption = Math.max(0, Math.min(100, num(localMarket(g).corruption, 40)))
  const exposure = s.exposure * (0.6 + (100 - corruption) / 125) * (1 + c.hidden.fame / 100)
  if (chance(g, exposure)) {
    addHidden(g, 'fame', randInt(g, 2, 4))
    addHidden(g, 'notoriety', randInt(g, 3, 7))
    addStat(g, 'happiness', -randInt(g, 3, 6))
    log(g, `The press exposed me as a member of ${s.name}.`, 'bad')
    if (chance(g, 0.25)) {
      expelFromSociety(g, `A newspaper published a photo of you in your ${s.name} robe, holding a candle and a very confused goose.`)
      return
    }
    if (takePopup(budget)) {
      notice(g, 'Exposed!', `${pick(g, ['An investigative journalist', 'A tabloid', 'A podcast with 40 million listeners'])} revealed that you are a member of ${s.name}, complete with a blurry photo of you in a hooded robe. Your publicist is "handling it." The Elders are "reviewing your position," which means you're still in. For now.`, { emoji: '📰', tone: 'bad' })
    }
    return
  }

  if (chance(g, 0.18) && takePopup(budget)) {
    scriptChoice(g, SUMMONS, `${s.emoji} A Summons`, `A wax-sealed letter from the Elders of ${s.name} arrived. You must ${pick(g, SUMMONS_TASKS)}. No reason given.`, [
      { id: 'comply', label: 'Do it. No questions.', emoji: '🫡' },
      { id: 'question', label: 'Ask why', emoji: '❓' },
      { id: 'ignore', label: 'Ignore it', emoji: '🗑️' },
    ], { emoji: s.emoji, data: { society: s.id } })
  }
}

/** One-line description for the AI context and tests. */
export function societySummary(g: GameState): string | null {
  const m = membership(g)
  const s = currentSociety(g)
  return m && s ? `${rankName(m)} of ${s.name}` : null
}
