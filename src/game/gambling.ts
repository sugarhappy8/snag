// Gambling: the casino (blackjack & slot machines), the racetrack and the lottery.
// The engine decides every random outcome it can (slot reels, race results, lottery draws);
// the minigame UIs only animate them. Blackjack is the exception: the hand is played for real
// in the UI and its result string is settled here.
import { addHidden, addMoney, addRelationship, addStat, count, formatMoney, inPrison, log, minigame, notice, relationLabel, remember, spouse, useYearAction, yearActionsUsed } from './core'
import { hasLuckyCharm, seeded, yearKey } from './assets'
import { chance, pick, rand, randInt, uid } from './rng'
import { defineScript } from './scripts'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode } from './types'
import { getCountry } from './world'

// ---------------------------------------------------------------------------
// Rules & helpers

/** Minimum age for the lottery, and for casinos where the drinking age is lower. */
export const GAMBLING_AGE = 18
export const MIN_BET = 5
const ADMISSION = 10

/** Countries where gambling is illegal (no casinos or racetrack betting). */
export const GAMBLING_ILLEGAL = new Set(['af', 'dz', 'bd', 'bn', 'ir', 'iq', 'kw', 'ly', 'pk', 'qa', 'sa', 'sd', 'ae', 'ye', 'kp', 'id', 'th', 'jo', 'om', 'mv'])

function num(v: Json | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function str(v: Json | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function obj(v: Json | undefined): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function countryName(g: GameState): string {
  return getCountry(g.character.countryId).name
}

/** Casino & racetrack age: the country's drinking age, but never under 18. */
export function casinoAge(g: GameState): number {
  const drinking = getCountry(g.character.countryId).drinkingAge
  return Math.max(GAMBLING_AGE, typeof drinking === 'number' && Number.isFinite(drinking) ? drinking : GAMBLING_AGE)
}

/** Why you can't gamble here right now, or null. */
export function casinoBlock(g: GameState, place: 'casino' | 'track' = 'casino'): string | null {
  const c = g.character
  if (!c.alive) return "You're dead."
  if (c.prison) return "You can't gamble from prison. Well, not legally."
  const age = casinoAge(g)
  if (c.age < age) return place === 'casino' ? `You must be ${age} to enter a casino. The bouncer laughed at your fake ID.` : `You must be ${age} to bet on horse races.`
  if (GAMBLING_ILLEGAL.has(c.countryId)) {
    return place === 'casino' ? `What? There are no casinos in ${countryName(g)} because gambling is illegal.` : `Seriously? There are no horse races in ${countryName(g)} because gambling is illegal.`
  }
  return null
}

function lotteryBlock(g: GameState): string | null {
  const c = g.character
  if (!c.alive) return "You're dead."
  if (c.prison) return "You can't buy lottery tickets in prison."
  if (c.age < GAMBLING_AGE) return `You must be ${GAMBLING_AGE} to buy lottery tickets.`
  return null
}

/** Parse and validate a bet typed by the player. Shows a notice and returns null when invalid. */
function readBet(g: GameState, input: string | undefined, extraCost = 0): number | null {
  const bet = Math.floor(Number(String(input ?? '').replace(/[$,\s]/g, '')))
  if (!Number.isFinite(bet) || bet <= 0) {
    notice(g, 'Invalid Bet', `Enter a bet of at least ${formatMoney(MIN_BET)}.`, { emoji: '🎲' })
    return null
  }
  if (bet < MIN_BET) {
    notice(g, 'Table Minimum', `The minimum bet is ${formatMoney(MIN_BET)}. The dealer looked at your ${formatMoney(bet)} with pity.`, { emoji: '🎲' })
    return null
  }
  if (bet + extraCost > g.character.money) {
    notice(g, 'Insufficient Funds', pick(g, [`You don't have that much money. You have ${formatMoney(Math.max(0, g.character.money))}.`, `The cashier ran your card and shook their head. You only have ${formatMoney(Math.max(0, g.character.money))}.`]), { emoji: '💸', tone: 'bad' })
    return null
  }
  return bet
}

function suggestedBet(g: GameState): string {
  const m = Math.max(0, g.character.money)
  if (m < MIN_BET) return String(MIN_BET)
  const b = m >= 100_000 ? 5_000 : m >= 10_000 ? 500 : m >= 1_000 ? 100 : Math.max(MIN_BET, Math.floor(m / 10))
  return String(Math.min(b, m))
}

function tooMuchGambling(g: GameState, where: 'casino' | 'track'): void {
  notice(
    g,
    where === 'casino' ? 'Cut Off' : 'Track Closed',
    where === 'casino'
      ? pick(g, ['The pit boss has been watching you all year. Security politely suggests you come back next year.', "You've gambled enough this year. Even the slot machines are worried about you.", 'The casino comped you a free buffet on the condition that you go home. Come back next year.'])
      : pick(g, ["You've spent enough time at the track this year. The horses need a break from you.", 'The racing season is over for you. Come back next year.']),
    { emoji: '🛑' },
  )
}

// ---------------------------------------------------------------------------
// Addiction & side effects

export const GAMBLING_ADDICTION = 'Gambling Addiction'

function hasGamblingAddiction(g: GameState): boolean {
  return g.character.conditions.some((c) => c.name === GAMBLING_ADDICTION)
}

/** Each bet carries a small chance of a gambling addiction; bigger and more frequent bets, bigger chance. */
export function maybeGamblingAddiction(g: GameState, stake: number, moneyBefore: number, lottery = false): void {
  const c = g.character
  const existing = c.conditions.find((x) => x.name === GAMBLING_ADDICTION)
  if (existing) {
    existing.severity = Math.min(80, existing.severity + (lottery ? 0 : 1))
    return
  }
  const share = Math.min(1, stake / Math.max(100, moneyBefore))
  const freq = yearActionsUsed(g, 'casino') + yearActionsUsed(g, 'horseRace') + (lottery ? yearActionsUsed(g, 'lottery') * 0.3 : 0)
  let p = lottery ? 0.002 + 0.0015 * freq : 0.01 + 0.06 * share + 0.005 * freq
  p *= Math.max(0.3, 1.3 - c.hidden.willpower / 100)
  if (!chance(g, Math.min(0.15, p))) return
  c.conditions.push({ id: uid(g, 'c'), name: GAMBLING_ADDICTION, kind: 'addiction', severity: randInt(g, 20, 40), yearsHad: 0, curable: true, diagnosed: true, age: c.age })
  addHidden(g, 'willpower', -5)
  log(g, 'I developed a gambling addiction.', 'bad')
  remember(g, 'Developed a gambling addiction.')
  notice(g, 'Gambling Addiction', pick(g, ['You can\'t stop thinking about your next bet. You have developed a gambling addiction.', 'The thrill of winning has its hooks in you. You now have a gambling addiction.', 'You caught yourself calculating odds at the grocery store. You have developed a gambling addiction.']), { emoji: '🎰', tone: 'bad' })
}

/** Spouses notice when you lose big. */
function spouseReaction(g: GameState, lost: number, moneyBefore: number): void {
  const s = spouse(g)
  if (!s || lost < 1_000 || lost < moneyBefore * 0.2 || !chance(g, 0.35)) return
  addRelationship(s, -randInt(g, 6, 14))
  notice(g, 'Busted', `Your ${relationLabel(s).toLowerCase()} ${s.firstName} found out you lost ${formatMoney(lost)} gambling. ${pick(g, [`${s.firstName} isn't speaking to you.`, `${s.firstName} changed the password to the bank account.`, `${s.firstName} said "we'll talk about this later" in a voice that made your blood run cold.`])}`, { emoji: '😠', tone: 'bad' })
}

/** Record a gambling result: counters, money, mood. `net` is the change in money. */
function recordGamble(g: GameState, stake: number, net: number, moneyBefore: number): void {
  count(g, 'moneyGambled', stake)
  if (net > 0) {
    count(g, 'casinoWins')
    count(g, 'casinoWinnings', net)
    addStat(g, 'happiness', net >= stake * 2 ? randInt(g, 6, 12) : randInt(g, 3, 7))
  } else if (net < 0) {
    count(g, 'casinoLosses')
    addStat(g, 'happiness', -(hasGamblingAddiction(g) ? randInt(g, 4, 8) : randInt(g, 1, 5)))
    spouseReaction(g, -net, moneyBefore)
  }
  maybeGamblingAddiction(g, stake, moneyBefore)
}

// ---------------------------------------------------------------------------
// Casinos

const CASINO_NAMES = ['The Golden Mirage', 'Lucky Horseshoe Casino', 'Royal Flush Resort & Casino', 'The Silver Dollar', 'Neon Palms Casino', 'The Grand Monarch', 'High Roller Hotel & Casino', 'Starlight Casino', 'The Gilded Ace', 'Crystal Palace Casino', 'Diamond Jubilee Casino', 'The Velvet Rope', 'Wild River Casino', 'Pharaoh\'s Fortune']

/** The two casinos in your city (they don't change from year to year). */
export function localCasinos(g: GameState): [string, string] {
  const r = seeded(`${g.lifeId}|${g.character.countryId}|${g.character.city}|casinos`)
  const a = r.pick(CASINO_NAMES)
  let b = r.pick(CASINO_NAMES)
  while (b === a) b = r.pick(CASINO_NAMES)
  return [a, b]
}

// --- Blackjack

export type BlackjackOutcome = 'win' | 'lose' | 'push' | 'blackjack'

export interface BlackjackResult {
  outcome: BlackjackOutcome
  doubled: boolean
  charlie: boolean
  bust: boolean
}

/** Result strings look like "win", "lose:double:bust", "win:charlie", "blackjack". */
export function parseBlackjackResult(result: string): BlackjackResult | null {
  const parts = result.split(':')
  const outcome = parts[0]
  if (outcome !== 'win' && outcome !== 'lose' && outcome !== 'push' && outcome !== 'blackjack') return null
  return { outcome, doubled: parts.includes('double') && outcome !== 'blackjack', charlie: parts.includes('charlie'), bust: parts.includes('bust') }
}

/** Net money change for a blackjack hand (BitLife pays 2x on a win and 3x on a blackjack, i.e. +bet / +2×bet). */
export function blackjackNet(bet: number, r: BlackjackResult): number {
  const stake = bet * (r.doubled ? 2 : 1)
  switch (r.outcome) {
    case 'blackjack':
      return bet * 2
    case 'win':
      return stake
    case 'push':
      return 0
    case 'lose':
      return -stake
  }
}

/** Settle a finished blackjack hand. Exported for tests. */
export function settleBlackjack(g: GameState, result: string, data: Json | undefined): void {
  const d = obj(data)
  const bet = Math.max(0, Math.floor(num(d.bet)))
  const casino = str(d.casino, 'the casino')
  const r = parseBlackjackResult(result)
  if (!r || bet <= 0) return
  const c = g.character
  const before = c.money
  let net = blackjackNet(bet, r)
  // Never take more than you have (the UI only allows doubling when you can cover it).
  if (net < 0) net = -Math.min(-net, Math.max(0, c.money))
  addMoney(g, net)
  const stake = bet * (r.doubled ? 2 : 1)
  recordGamble(g, stake, net, before)
  const amt = formatMoney(Math.abs(net))
  switch (r.outcome) {
    case 'blackjack':
      log(g, `I hit blackjack and won ${amt} at ${casino}.`, 'good')
      notice(g, 'Blackjack!', pick(g, [`An ace and a face card! You hit blackjack and won ${amt}.`, `Blackjack! The table erupted as you collected ${amt}.`, `Twenty-one on the deal. The dealer slid ${amt} across the felt with a sigh.`]), { emoji: '🃏', tone: 'good' })
      return
    case 'win':
      log(g, `I won ${amt} playing blackjack at ${casino}.`, 'good')
      notice(
        g,
        'Winner!',
        r.charlie
          ? `Five Card Charlie! You drew five cards without busting and won ${amt}.`
          : pick(g, [`You beat the dealer and won ${amt}!`, `You walked away from the blackjack table ${amt} richer.`, `Lady Luck was on your side. You won ${amt}${r.doubled ? ' after doubling down' : ''}!`]),
        { emoji: '🤑', tone: 'good' },
      )
      return
    case 'push':
      log(g, 'I tied the dealer at blackjack.')
      notice(g, 'Push', pick(g, [`You tied the dealer and got your ${formatMoney(stake)} back.`, `A push. Nobody wins, nobody loses. The most boring outcome in gambling.`]), { emoji: '🤝' })
      return
    case 'lose':
      log(g, `I lost ${amt} playing blackjack at ${casino}.`, 'bad')
      notice(
        g,
        'Dealer Wins',
        r.bust
          ? pick(g, [`You busted and lost ${amt}.`, `You went over 21. The dealer raked in your ${amt} without even looking up.`])
          : pick(g, [`The dealer beat your hand. You lost ${amt}.`, `The house always wins. You lost ${amt}${r.doubled ? ' after doubling down' : ''}.`, `You lost ${amt} at blackjack. You blamed the guy who sat down at your table.`]),
        { emoji: '😩', tone: 'bad' },
      )
      return
  }
}

const BLACKJACK = defineScript('casino.blackjack.result', (g, choice, data) => settleBlackjack(g, choice, data))

export function startBlackjack(g: GameState, casino: string, input: string | undefined): void {
  const block = casinoBlock(g)
  if (block) {
    notice(g, 'Casino', block, { emoji: '🎰' })
    return
  }
  const bet = readBet(g, input)
  if (bet === null) return
  if (!useYearAction(g, 'casino', 12)) {
    tooMuchGambling(g, 'casino')
    return
  }
  minigame(g, 'blackjack', `Blackjack · ${casino}`, BLACKJACK, { bet, casino, canDouble: g.character.money >= bet * 2 })
}

// --- Slot machines

export interface SlotSymbol {
  id: string
  emoji: string
  name: string
  weight: number
  precious: boolean
  fruit: boolean
  three: number
  two: number
}

/**
 * Reel symbols (weights are per reel stop). Pays on the center line, as multiples of the bet
 * (stake included): three of a kind, two of a precious symbol, any three precious symbols,
 * or any three fruits.
 */
export const SLOT_SYMBOLS: SlotSymbol[] = [
  { id: 'star', emoji: '⭐', name: 'Lucky Star', weight: 2, precious: true, fruit: false, three: 20, two: 5 },
  { id: 'diamond', emoji: '💎', name: 'Diamond', weight: 3, precious: true, fruit: false, three: 18, two: 4 },
  { id: 'coin', emoji: '🪙', name: 'Gold Coin', weight: 4, precious: true, fruit: false, three: 15, two: 3 },
  { id: 'grape', emoji: '🍇', name: 'Grapes', weight: 9, precious: false, fruit: true, three: 12, two: 0 },
  { id: 'melon', emoji: '🍉', name: 'Melon', weight: 10, precious: false, fruit: true, three: 10, two: 0 },
  { id: 'lemon', emoji: '🍋', name: 'Lemon', weight: 12, precious: false, fruit: true, three: 8, two: 0 },
  // The house's best friend: pays nothing and breaks up every line it lands on.
  { id: 'skull', emoji: '💀', name: 'Skull', weight: 12, precious: false, fruit: false, three: 0, two: 0 },
]

/** Any three precious symbols (mixed) pay this. */
export const SLOT_MIXED_PRECIOUS = 6
/** Any three fruits (mixed) pay this. */
export const SLOT_MIXED_FRUIT = 3

/** Payout multiplier (total return / bet) for three reel symbol ids. */
export function slotPayout(reels: string[]): number {
  const syms = reels.map((id) => SLOT_SYMBOLS.find((s) => s.id === id))
  if (syms.length !== 3 || syms.some((s) => !s)) return 0
  const [a, b, c] = syms as SlotSymbol[]
  if (a.id === b.id && b.id === c.id) return a.three
  let best = 0
  for (const s of SLOT_SYMBOLS) {
    if (s.two > 0 && reels.filter((r) => r === s.id).length === 2) best = Math.max(best, s.two)
  }
  if (a.precious && b.precious && c.precious) best = Math.max(best, SLOT_MIXED_PRECIOUS)
  if (a.fruit && b.fruit && c.fruit) best = Math.max(best, SLOT_MIXED_FRUIT)
  return best
}

/** Expected return per $1 bet (the machine's RTP), computed exactly. */
export function slotRtp(): number {
  const total = SLOT_SYMBOLS.reduce((s, x) => s + x.weight, 0)
  let ev = 0
  for (const a of SLOT_SYMBOLS) for (const b of SLOT_SYMBOLS) for (const c of SLOT_SYMBOLS) ev += ((a.weight * b.weight * c.weight) / total ** 3) * slotPayout([a.id, b.id, c.id])
  return ev
}

function spinReel(g: GameState): SlotSymbol {
  const total = SLOT_SYMBOLS.reduce((s, x) => s + x.weight, 0)
  let roll = rand(g) * total
  for (const s of SLOT_SYMBOLS) {
    roll -= s.weight
    if (roll < 0) return s
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1]
}

export function settleSlots(g: GameState, data: Json | undefined): void {
  const d = obj(data)
  const bet = Math.max(0, Math.floor(num(d.bet)))
  if (bet <= 0) return
  const reelIds = Array.isArray(d.reelIds) ? d.reelIds.filter((x): x is string => typeof x === 'string') : []
  const mult = slotPayout(reelIds)
  const casino = str(d.casino, 'the casino')
  const c = g.character
  const before = c.money
  let net = Math.round(bet * mult) - bet
  if (net < 0) net = -Math.min(-net, Math.max(0, c.money))
  addMoney(g, net)
  recordGamble(g, bet, net, before)
  const emojis = reelIds.map((id) => SLOT_SYMBOLS.find((s) => s.id === id)?.emoji ?? '❔').join(' ')
  if (mult >= 15) {
    log(g, `I hit a ${formatMoney(net)} jackpot on the slots at ${casino}!`, 'good')
    notice(g, 'JACKPOT!', `${emojis}\nBells! Lights! Sirens! You hit the big one and won ${formatMoney(net)} on the slot machine!`, { emoji: '🎰', tone: 'good' })
  } else if (net > 0) {
    log(g, `I won ${formatMoney(net)} on the slots at ${casino}.`, 'good')
    notice(g, 'Winner!', `${emojis}\nThe machine chimed and paid out ${formatMoney(bet * mult)}. You're up ${formatMoney(net)}!`, { emoji: '🎰', tone: 'good' })
  } else if (net === 0) {
    notice(g, 'Break Even', `${emojis}\nYou got your ${formatMoney(bet)} back. The machine is toying with you.`, { emoji: '🎰' })
  } else {
    log(g, `I lost ${formatMoney(-net)} on the slots at ${casino}.`, 'bad')
    notice(g, 'No Luck', `${emojis}\n${pick(g, [`Nothing. The machine swallowed your ${formatMoney(-net)}.`, `So close! (Not really.) You lost ${formatMoney(-net)}.`, `You lost ${formatMoney(-net)}. The old lady at the next machine just won. Of course.`])}`, { emoji: '🎰', tone: 'bad' })
  }
}

const SLOTS = defineScript('casino.slots.result', (g, _choice, data) => settleSlots(g, data))

export function startSlots(g: GameState, casino: string, input: string | undefined): void {
  const block = casinoBlock(g)
  if (block) {
    notice(g, 'Casino', block, { emoji: '🎰' })
    return
  }
  const bet = readBet(g, input)
  if (bet === null) return
  if (!useYearAction(g, 'casino', 12)) {
    tooMuchGambling(g, 'casino')
    return
  }
  let reels = [spinReel(g), spinReel(g), spinReel(g)]
  // The family's lucky dice give a losing spin one more chance.
  if (slotPayout(reels.map((s) => s.id)) < 1 && hasLuckyCharm(g) && chance(g, 0.2)) reels = [spinReel(g), spinReel(g), spinReel(g)]
  const reelIds = reels.map((s) => s.id)
  minigame(g, 'slots', `Slots · ${casino}`, SLOTS, {
    bet,
    casino,
    reelIds,
    reels: reels.map((s) => s.emoji),
    payout: slotPayout(reelIds),
    symbols: SLOT_SYMBOLS.map((s) => s.emoji),
    paytable: SLOT_SYMBOLS.filter((s) => s.three > 0).map((s) => ({ emoji: s.emoji, three: s.three, two: s.two })),
    mixedPrecious: SLOT_MIXED_PRECIOUS,
    mixedFruit: SLOT_MIXED_FRUIT,
    precious: SLOT_SYMBOLS.filter((s) => s.precious).map((s) => s.emoji),
    fruits: SLOT_SYMBOLS.filter((s) => s.fruit).map((s) => s.emoji),
  })
}

function casinoGroup(name: string, idx: number): MenuGroup {
  return {
    type: 'menu',
    id: `casino-${idx}`,
    label: name,
    emoji: idx === 0 ? '🎰' : '🃏',
    subtitle: idx === 0 ? 'Blackjack and slot machines' : 'Slots, blackjack and a very sad buffet',
    header: (g) => `Welcome to ${name}! You have ${formatMoney(Math.max(0, g.character.money))}. Table minimum ${formatMoney(MIN_BET)}.`,
    children: (): MenuNode[] => [
      {
        type: 'action',
        id: `blackjack-${idx}`,
        label: 'Blackjack',
        emoji: '🃏',
        subtitle: 'Win 2x, blackjack pays 3x',
        input: { kind: 'number', label: 'How much do you want to bet?', min: MIN_BET, defaultValue: suggestedBet },
        run: (g, input) => startBlackjack(g, name, input),
      },
      {
        type: 'action',
        id: `slots-${idx}`,
        label: 'Slot Machines',
        emoji: '🎰',
        subtitle: 'Three stars pays 20x',
        input: { kind: 'number', label: 'How much do you want to bet on this spin?', min: MIN_BET, defaultValue: suggestedBet },
        run: (g, input) => startSlots(g, name, input),
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Horse races

const HORSE_NAMES = [
  'Neigh Sayer', 'Hay Girl Hay', 'Mane Event', 'Gallop Poll', 'Sir Trots-a-Lot', 'Unstable Genius', 'Pony Express', 'Mare-y Poppins', 'Night Mare', 'Stirrup Trouble',
  'Hoofington Post', 'Feed Me Carrots', 'Bridle Party', 'Thunderhooves', 'Lightning Bolt', 'Midnight Express', 'Dashing Dancer', 'Lucky Clover', 'Long Shot Larry', 'Glue Factory Dodger',
  'Oats & Ends', 'Saddle Up Sally', 'Running Late', 'Furlong Shot', 'Tax Refund', 'Second Mortgage', 'Photo Finish', 'Turf Wars', 'Galloping Gertie', 'Fast & Furlong',
  'My Little Bony', 'Clip Clop', 'Rein Man', 'Hold Your Horses', 'Apple of My Eye', 'Sugar Cube', 'Blue Ribbon', 'Iron Horse', 'Stud Muffin', 'Hay Fever',
  'Barn Burner', 'Horse Radish', 'Crazy Legs', 'Wild Card', 'Dark Horse', 'Gift Horse', 'Charley Horse', 'Trojan Horse', 'Pegasus Wannabe', 'Unicorn in Denial',
  'Chestnut Charlie', 'Golden Oats', 'Whinny the Pooh', 'Seabiscuit Junior', 'Spoiled Rotten', 'Mortgage Payment', 'College Fund', 'Last Paycheck', 'Kentucky Fried Dreams', 'Nacho Average Horse',
  'Usain Colt', 'Forrest Jump', 'Bet the Farm', 'Sure Thing', 'Not a Donkey', 'Mr. Sparkles', 'Velvet Thunder', 'Silver Lining', 'Morning Glory', 'Big Spender',
]

const RACE_COLORS = ['#e5413a', '#1d6fd8', '#2fbf5b', '#f2b705', '#8a4fd6']
const RACE_DOTS = ['🔴', '🔵', '🟢', '🟡', '🟣']
const TRACKS = ['Sunnybrook Downs', 'Thunder Valley Racecourse', 'Royal Meadows', 'Silverlake Park', 'Hollow Creek Downs', 'Bluegrass Fields', 'Windmere Racetrack']
const RACE_NAMES = ['Maiden Stakes', 'Derby Trial', 'Sprint Handicap', 'Classic Stakes', 'Allowance Race', 'Golden Cup', 'Turf Mile']
const DISTANCES = ['5 furlongs', '6 furlongs', '7 furlongs', '1 mile', '1 1/8 miles', '1 1/4 miles']

/** Fractional odds ladder [numerator, denominator]. */
const ODDS_LADDER: [number, number][] = [
  [1, 2], [4, 5], [1, 1], [6, 5], [3, 2], [2, 1], [5, 2], [3, 1], [7, 2], [4, 1], [9, 2], [5, 1], [6, 1], [7, 1], [8, 1], [10, 1], [12, 1], [15, 1], [20, 1], [25, 1], [33, 1], [50, 1],
]

export interface RaceHorse {
  name: string
  color: string
  dot: string
  strength: number
  oddsNum: number
  oddsDen: number
  odds: string
  form: string
}

export interface RaceCard {
  track: string
  race: string
  distance: string
  horses: RaceHorse[]
}

export function oddsLabel(n: number, d: number): string {
  if (n === d) return 'Evens'
  return `${n}-${d}`
}

/** This race's card: five horses with odds. Stable until a race is run. */
export function raceCard(g: GameState): RaceCard {
  const r = seeded(yearKey(g, `race:${yearActionsUsed(g, 'horseRace')}`))
  const names: string[] = []
  while (names.length < 5) {
    const n = r.pick(HORSE_NAMES)
    if (!names.includes(n)) names.push(n)
  }
  const strengths = names.map(() => Math.pow(r.float(1, 10), 1.6))
  const total = strengths.reduce((s, x) => s + x, 0)
  const horses = names.map((name, i): RaceHorse => {
    const p = strengths[i] / total
    const fair = 0.82 / p - 1
    let best = ODDS_LADDER[0]
    for (const o of ODDS_LADDER) if (Math.abs(o[0] / o[1] - fair) < Math.abs(best[0] / best[1] - fair)) best = o
    const form = [0, 1, 2].map(() => Math.max(1, Math.min(9, Math.round(r.float(1, 7) - p * 8 + 1)))).join('-')
    return { name, color: RACE_COLORS[i], dot: RACE_DOTS[i], strength: Math.round(strengths[i] * 100) / 100, oddsNum: best[0], oddsDen: best[1], odds: oddsLabel(best[0], best[1]), form }
  })
  return { track: r.pick(TRACKS), race: r.pick(RACE_NAMES), distance: r.pick(DISTANCES), horses }
}

/** Decide the race: winner by strength, the rest in a weighted order, maybe a fall. */
export function runRace(g: GameState, card: RaceCard): { order: number[]; winner: number; dnf: number } {
  const remaining = card.horses.map((_, i) => i)
  const order: number[] = []
  while (remaining.length) {
    const total = remaining.reduce((s, i) => s + card.horses[i].strength, 0)
    let roll = rand(g) * total
    let chosen = remaining[remaining.length - 1]
    for (const i of remaining) {
      roll -= card.horses[i].strength
      if (roll < 0) {
        chosen = i
        break
      }
    }
    order.push(chosen)
    remaining.splice(remaining.indexOf(chosen), 1)
  }
  let dnf = -1
  if (chance(g, 0.07)) {
    dnf = order[randInt(g, 1, order.length - 1)]
    order.splice(order.indexOf(dnf), 1)
    order.push(dnf)
  }
  return { order, winner: order[0], dnf }
}

export function settleRace(g: GameState, data: Json | undefined): void {
  const d = obj(data)
  const horses = Array.isArray(d.horses) ? d.horses.map(obj) : []
  const pickIdx = Math.floor(num(d.pick, -1))
  const winner = Math.floor(num(d.winner, -1))
  const bet = Math.max(0, Math.floor(num(d.bet)))
  const winName = str(horses[winner]?.name, 'A long shot')
  const track = str(d.track, 'the track')
  if (pickIdx < 0 || bet <= 0) {
    addStat(g, 'happiness', randInt(g, 1, 4))
    log(g, `I watched the horse races at ${track}. ${winName} won.`)
    notice(g, 'Off to the Races', pick(g, [`You watched the races at ${track}. ${winName} won by a nose.`, `${winName} won the race while you ate an overpriced hot dog. Good times.`]), { emoji: '🏇' })
    return
  }
  const mine = horses[pickIdx]
  const myName = str(mine?.name, 'your horse')
  const c = g.character
  const before = c.money
  let net: number
  if (pickIdx === winner) {
    net = Math.round((bet * num(mine?.oddsNum, 1)) / Math.max(1, num(mine?.oddsDen, 1)))
  } else {
    net = -Math.min(bet, Math.max(0, c.money))
  }
  addMoney(g, net)
  recordGamble(g, bet, net, before)
  if (net > 0) {
    log(g, `I won ${formatMoney(net)} at the horse races by betting on ${myName}!`, 'good')
    notice(g, 'You Won!', pick(g, [`${myName} crossed the finish line first! Your ${formatMoney(bet)} bet at ${str(mine?.odds)} paid ${formatMoney(net)}.`, `${myName} won! You screamed so loud the people next to you moved. You won ${formatMoney(net)}.`]), { emoji: '🏆', tone: 'good' })
  } else {
    const fell = Math.floor(num(d.dnf, -1)) === pickIdx
    log(g, `${winName} won the race. I lost ${formatMoney(-net)} betting on a losing horse!`, 'bad')
    notice(g, 'You Lost', fell ? `${myName} stumbled and fell and did not finish. You lost your ${formatMoney(-net)} bet. (The horse is fine. Your wallet is not.)` : `${winName} won the race. ${myName} ${pick(g, ['was still thinking about it at the starting gate.', 'stopped to eat some grass.', 'gave it their all, which was not much.'])} You lost ${formatMoney(-net)}.`, { emoji: '🐴', tone: 'bad' })
  }
}

const RACE = defineScript('track.race.result', (g, _choice, data) => settleRace(g, data))

/** Bet on horse `idx` of the current card (or watch with idx -1). */
export function startRace(g: GameState, idx: number, input: string | undefined): void {
  const block = casinoBlock(g, 'track')
  if (block) {
    notice(g, 'Horse Races', block, { emoji: '🏇' })
    return
  }
  const card = raceCard(g)
  let bet = 0
  if (idx >= 0) {
    const b = readBet(g, input, ADMISSION)
    if (b === null) return
    bet = b
  } else if (g.character.money < ADMISSION) {
    notice(g, 'Horse Races', `Admission is ${formatMoney(ADMISSION)} and you can't afford it.`, { emoji: '🎟️' })
    return
  }
  if (!useYearAction(g, 'horseRace', 6)) {
    tooMuchGambling(g, 'track')
    return
  }
  addMoney(g, -ADMISSION)
  const race = runRace(g, card)
  // Lucky dice in your pocket: a runner-up pick sometimes finds an extra gear.
  if (idx >= 0 && race.order[1] === idx && idx !== race.dnf && hasLuckyCharm(g) && chance(g, 0.25)) {
    race.order = [idx, race.order[0], ...race.order.slice(2)]
    race.winner = idx
  }
  const { order, winner, dnf } = race
  minigame(g, 'horseRace', `${card.race} · ${card.track}`, RACE, {
    horses: card.horses.map((h) => ({ name: h.name, color: h.color, dot: h.dot, odds: h.odds, oddsNum: h.oddsNum, oddsDen: h.oddsDen })),
    pick: idx,
    bet,
    winner,
    order,
    dnf,
    track: card.track,
    race: card.race,
    distance: card.distance,
  })
}

export const horseRacesMenu: MenuGroup = {
  type: 'menu',
  id: 'horseRaces',
  label: 'Horse Races',
  emoji: '🏇',
  subtitle: 'Bet on a horse or just watch',
  disabledReason: (g) => casinoBlock(g, 'track'),
  header: (g) => {
    const card = raceCard(g)
    return `${card.race} at ${card.track} · ${card.distance}. Admission ${formatMoney(ADMISSION)}. Only a win pays out.`
  },
  children: (g): MenuNode[] => {
    const card = raceCard(g)
    return [
      {
        type: 'action',
        id: 'watchRace',
        label: 'Just Watch',
        emoji: '👀',
        subtitle: `${formatMoney(ADMISSION)} admission`,
        run: (gg) => startRace(gg, -1, undefined),
      },
      { type: 'heading', id: 'raceCard', label: 'Place a Bet' },
      ...card.horses.map(
        (h, i): MenuAction => ({
          type: 'action',
          id: `horse-${i}`,
          label: h.name,
          emoji: h.dot,
          subtitle: `Odds ${h.odds} · Recent form ${h.form}`,
          input: { kind: 'number', label: `How much do you want to bet on ${h.name} (${h.odds})?`, min: MIN_BET, defaultValue: suggestedBet },
          run: (gg, input) => startRace(gg, i, input),
        }),
      ),
    ]
  },
}

// ---------------------------------------------------------------------------
// The casino menu

export const casinoMenu: MenuGroup = {
  type: 'menu',
  id: 'casino',
  label: 'Casino',
  emoji: '🎰',
  subtitle: 'Blackjack, slots and the racetrack',
  visible: (g) => !inPrison(g),
  disabledReason: (g) => casinoBlock(g),
  header: (g) => (hasGamblingAddiction(g) ? 'Your hands are shaking with excitement. Maybe just one more bet...' : 'Pick a casino. Please gamble responsibly.'),
  children: (g): MenuNode[] => {
    const [a, b] = localCasinos(g)
    return [casinoGroup(a, 0), casinoGroup(b, 1), { type: 'heading', id: 'trackHeading', label: 'Racetrack' }, horseRacesMenu]
  },
}

// ---------------------------------------------------------------------------
// Lottery

interface PrizeTier {
  /** 1 in `odds` per ticket. */
  odds: number
  prize: number | 'jackpot'
  label: string
}

export interface LotteryGame {
  id: string
  name: string
  emoji: string
  price: number
  scratch: boolean
  jackpot?: [number, number]
  tiers: PrizeTier[]
  blurb: string
}

export const LOTTERY_GAMES: LotteryGame[] = [
  {
    id: 'lotto',
    name: 'Lucky 6 Lotto',
    emoji: '🎱',
    price: 2,
    scratch: false,
    jackpot: [1_000_000, 20_000_000],
    blurb: 'Pick six numbers. Match them all for the jackpot.',
    tiers: [
      { odds: 2_000_000, prize: 'jackpot', label: 'all six numbers' },
      { odds: 150_000, prize: 25_000, label: 'five numbers' },
      { odds: 6_000, prize: 500, label: 'four numbers' },
      { odds: 120, prize: 20, label: 'three numbers' },
      { odds: 15, prize: 2, label: 'two numbers' },
    ],
  },
  {
    id: 'mega',
    name: 'MegaFortune',
    emoji: '💰',
    price: 5,
    scratch: false,
    jackpot: [40_000_000, 800_000_000],
    blurb: 'The giant multi-state jackpot. Astronomical odds.',
    tiers: [
      { odds: 30_000_000, prize: 'jackpot', label: 'every number plus the MegaBall' },
      { odds: 5_000_000, prize: 1_000_000, label: 'five numbers' },
      { odds: 200_000, prize: 10_000, label: 'four numbers plus the MegaBall' },
      { odds: 12_000, prize: 500, label: 'four numbers' },
      { odds: 700, prize: 50, label: 'three numbers' },
      { odds: 60, prize: 10, label: 'two numbers' },
      { odds: 20, prize: 5, label: 'the MegaBall' },
    ],
  },
  {
    id: 'scratch1',
    name: 'Lucky Clover Scratcher',
    emoji: '🍀',
    price: 1,
    scratch: true,
    blurb: 'Top prize $1,000',
    tiers: [
      { odds: 25_000, prize: 1_000, label: 'the top prize' },
      { odds: 800, prize: 50, label: 'three clovers' },
      { odds: 80, prize: 10, label: 'three horseshoes' },
      { odds: 10, prize: 2, label: 'three coins' },
      { odds: 6, prize: 1, label: 'a free ticket' },
    ],
  },
  {
    id: 'scratch5',
    name: 'Cash Blast Scratcher',
    emoji: '💥',
    price: 5,
    scratch: true,
    blurb: 'Top prize $100,000',
    tiers: [
      { odds: 1_500_000, prize: 100_000, label: 'the top prize' },
      { odds: 12_000, prize: 1_000, label: 'three money bags' },
      { odds: 400, prize: 100, label: 'three dollar signs' },
      { odds: 40, prize: 20, label: 'three stars' },
      { odds: 7, prize: 5, label: 'your money back' },
    ],
  },
  {
    id: 'scratch20',
    name: 'Millionaire Maker Scratcher',
    emoji: '💎',
    price: 20,
    scratch: true,
    blurb: 'Top prize $1,000,000',
    tiers: [
      { odds: 3_000_000, prize: 1_000_000, label: 'the top prize' },
      { odds: 150_000, prize: 25_000, label: 'three diamonds' },
      { odds: 4_000, prize: 1_000, label: 'three crowns' },
      { odds: 120, prize: 100, label: 'three gold bars' },
      { odds: 18, prize: 40, label: 'double your money' },
      { odds: 7, prize: 20, label: 'your money back' },
    ],
  },
]

/** This year's advertised jackpot for a draw game. */
export function lotteryJackpot(g: GameState, game: LotteryGame): number {
  if (!game.jackpot) return 0
  const r = seeded(yearKey(g, `jackpot:${game.id}`))
  const [lo, hi] = game.jackpot
  const v = lo + (hi - lo) * Math.pow(r.next(), 2.2)
  return Math.round(v / 1_000) * 1_000 + r.int(0, 999)
}

/** Draw one ticket. Returns the prize (0 if nothing) and the tier label. */
export function drawTicket(g: GameState, game: LotteryGame, jackpot: number, luck = 1): { prize: number; label: string; jackpot: boolean } {
  const roll = rand(g) / Math.max(1, luck)
  let cum = 0
  for (const t of game.tiers) {
    cum += 1 / t.odds
    if (roll < cum) return t.prize === 'jackpot' ? { prize: jackpot, label: t.label, jackpot: true } : { prize: t.prize, label: t.label, jackpot: false }
  }
  return { prize: 0, label: '', jackpot: false }
}

/** Expected prize value per ticket (for balance tests). */
export function lotteryExpectedValue(game: LotteryGame, jackpot: number): number {
  return game.tiers.reduce((s, t) => s + (t.prize === 'jackpot' ? jackpot : t.prize) / t.odds, 0)
}

export interface LotteryOutcome {
  spent: number
  won: number
  biggest: number
  biggestLabel: string
  jackpot: boolean
}

/** Buy `n` tickets of a game. Returns the outcome (null when the purchase was refused). */
export function buyLottery(g: GameState, gameId: string, n: number): LotteryOutcome | null {
  const game = LOTTERY_GAMES.find((x) => x.id === gameId)
  if (!game) return null
  const block = lotteryBlock(g)
  if (block) {
    notice(g, 'Lottery', block, { emoji: '🎟️' })
    return null
  }
  const c = g.character
  const cost = game.price * n
  if (c.money < cost) {
    notice(g, 'Insufficient Funds', `You can't afford ${n === 1 ? 'a ticket' : `${n} tickets`} (${formatMoney(cost)}). Maybe that's the universe protecting you.`, { emoji: '💸', tone: 'bad' })
    return null
  }
  if (!useYearAction(g, 'lottery', 15)) {
    notice(g, 'Lottery', pick(g, ['The gas station clerk refused to sell you any more tickets this year. "Go home, buddy."', "You've bought enough tickets this year. Your recycling bin is full of losing scratchers."]), { emoji: '🎟️' })
    return null
  }
  const before = c.money
  addMoney(g, -cost)
  count(g, 'lotteryTickets', n)
  count(g, 'moneyGambled', cost)
  const jackpot = lotteryJackpot(g, game)
  const luck = hasLuckyCharm(g) ? 1.5 : 1
  let won = 0
  let biggest = 0
  let biggestLabel = ''
  let hitJackpot = false
  for (let i = 0; i < n; i++) {
    const t = drawTicket(g, game, jackpot, luck)
    if (t.jackpot && hitJackpot) continue // one jackpot per batch is plenty
    if (t.prize > 0) {
      won += t.prize
      if (t.prize > game.price) count(g, 'lotteryWins')
      if (t.prize > biggest) {
        biggest = t.prize
        biggestLabel = t.label
      }
      if (t.jackpot) hitJackpot = true
    }
  }
  addMoney(g, won)
  const what = game.scratch ? (n === 1 ? 'a scratch-off ticket' : `${n} scratch-off tickets`) : n === 1 ? 'a lottery ticket' : `${n} lottery tickets`
  if (hitJackpot) {
    count(g, 'lotteryJackpots')
    addHidden(g, 'fame', randInt(g, 15, 30))
    addStat(g, 'happiness', 40)
    log(g, `I won the ${formatMoney(biggest)} ${game.name} jackpot!`, 'good')
    remember(g, `Won the ${formatMoney(biggest)} ${game.name} jackpot.`)
    notice(g, 'JACKPOT!!!', `You matched ${biggestLabel} and won the ${formatMoney(biggest)} ${game.name} jackpot! Your face is on the evening news, and long-lost relatives you've never heard of are already calling.`, { emoji: '🤑', tone: 'good' })
  } else if (biggest >= 100_000) {
    addHidden(g, 'fame', randInt(g, 5, 12))
    addStat(g, 'happiness', 25)
    log(g, `I won ${formatMoney(biggest)} on the ${game.name}!`, 'good')
    remember(g, `Won ${formatMoney(biggest)} on the ${game.name}.`)
    notice(g, 'Big Winner!', `You bought ${what} and one of them hit ${biggestLabel}! You won ${formatMoney(biggest)}! The local paper wants an interview.`, { emoji: '💰', tone: 'good' })
  } else if (biggest >= 1_000) {
    addStat(g, 'happiness', 10)
    log(g, `I won ${formatMoney(won)} playing the ${game.name}.`, 'good')
    notice(g, 'Winner!', `You bought ${what} for ${formatMoney(cost)} and matched ${biggestLabel}. You won ${formatMoney(won)}!`, { emoji: game.emoji, tone: 'good' })
  } else if (won > 0) {
    log(g, `I bought ${what} and won ${formatMoney(won)}.`)
    notice(g, won >= cost ? 'Small Win' : 'So Close', `You bought ${what} for ${formatMoney(cost)} and won ${formatMoney(won)} back${won > cost ? `. You're up ${formatMoney(won - cost)}!` : won === cost ? '. You broke even.' : '. Better luck next time.'}`, { emoji: game.emoji, tone: won > cost ? 'good' : 'neutral' })
  } else {
    addStat(g, 'happiness', -1)
    log(g, `I bought ${what} and won nothing.`)
    notice(g, 'No Luck', pick(g, [`You bought ${what} for ${formatMoney(cost)} and won absolutely nothing.`, `${capitalize(what)}. ${formatMoney(cost)}. Zero winners. The odds were never in your favor.`, `You scratched and checked and squinted. Nothing. ${formatMoney(cost)} gone.`]), { emoji: '🗑️' })
  }
  if (cost >= 20) maybeGamblingAddiction(g, cost, before, true)
  return { spent: cost, won, biggest, biggestLabel, jackpot: hitJackpot }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function lotteryActions(game: LotteryGame): MenuNode[] {
  const one: MenuAction = {
    type: 'action',
    id: `lottery-${game.id}-1`,
    label: game.scratch ? `Buy a ${game.name}` : 'Buy a Ticket',
    emoji: game.emoji,
    subtitle: formatMoney(game.price),
    run: (g) => {
      buyLottery(g, game.id, 1)
    },
  }
  const ten: MenuAction = {
    type: 'action',
    id: `lottery-${game.id}-10`,
    label: game.scratch ? 'Buy 10 Scratchers' : 'Buy 10 Tickets',
    emoji: '🎟️',
    subtitle: formatMoney(game.price * 10),
    run: (g) => {
      buyLottery(g, game.id, 10)
    },
  }
  return [one, ten]
}

export const lotteryMenu: MenuGroup = {
  type: 'menu',
  id: 'lottery',
  label: 'Lottery',
  emoji: '🎟️',
  subtitle: 'Tickets and scratch-offs',
  visible: (g) => !inPrison(g),
  disabledReason: lotteryBlock,
  header: (g) => `You have ${formatMoney(Math.max(0, g.character.money))}. Winning is very rare. That's what makes it exciting.`,
  children: (g): MenuNode[] => {
    const nodes: MenuNode[] = []
    for (const game of LOTTERY_GAMES.filter((x) => !x.scratch)) {
      nodes.push({ type: 'heading', id: `lh-${game.id}`, label: game.name })
      nodes.push({ type: 'info', id: `li-${game.id}`, emoji: game.emoji, text: `This year's jackpot: ${formatMoney(lotteryJackpot(g, game))}. ${game.blurb}` })
      nodes.push(...lotteryActions(game))
    }
    nodes.push({ type: 'heading', id: 'lh-scratch', label: 'Scratch-Offs' })
    for (const game of LOTTERY_GAMES.filter((x) => x.scratch)) {
      nodes.push({
        type: 'menu',
        id: `scratch-${game.id}`,
        label: game.name,
        emoji: game.emoji,
        subtitle: `${formatMoney(game.price)} · ${game.blurb}`,
        children: () => lotteryActions(game),
      })
    }
    return nodes
  },
}
