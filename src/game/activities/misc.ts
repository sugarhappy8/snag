// Smaller Activities entries: Turn Yourself In (when the police are after you), Surrender
// (give up on this life, like the white-flag button at the bottom of the real game's list),
// Pray, and the Sweepstakes.
import { arrestPlayer } from '../crime'
import { killCharacter } from '../death'
import {
  addHidden,
  addMoney,
  addRelationship,
  addStat,
  count,
  currentPartner,
  currentLogYear,
  fullName,
  log,
  remember,
  spend,
  useYearAction,
} from '../core'
import { chance, pick, randInt, uid } from '../rng'
import type { Asset, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { brokeNotice, gate, localPrice, money, result, usesLeft } from './common'

// ---------------------------------------------------------------------------
// Surrender

/** prison.ts stores escaped-convict info under this flag (plain JSON record). */
const FUGITIVE_FLAG = 'fugitive'

function fugitive(g: GameState): Record<string, Json> | null {
  const v = g.flags[FUGITIVE_FLAG]
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : null
}

/** Rough severity of a named crime (1-5), mirroring the crime module's scale. */
export function guessSeverity(crime: string): number {
  const s = crime.toLowerCase()
  if (/murder|killing|homicide|hitman/.test(s)) return /attempt|conspiracy/.test(s) ? 4 : 5
  if (/robbery|extortion|racketeer|wire fraud|kidnap|arson/.test(s)) return 3
  if (/burglary|grand theft|embezzle|fraud|identity|assault|smuggl|drug/.test(s)) return 2
  return 1
}

/** Index of the most serious crime the police don't have you for yet, or -1. */
export function worstUncaught(g: GameState): number {
  const rec = g.character.criminalRecord
  let best = -1
  for (let i = 0; i < rec.length; i++) {
    if (rec[i].caught) continue
    if (best < 0 || guessSeverity(rec[i].crime) >= guessSeverity(rec[best].crime)) best = i
  }
  return best
}

export function canSurrender(g: GameState): boolean {
  const c = g.character
  return c.alive && !c.prison && c.age >= 10 && (c.wantedLevel > 0 || fugitive(g) !== null)
}

function surrender(g: GameState): void {
  const c = g.character
  if (!canSurrender(g)) {
    result(g, 'Turn Yourself In', "Nobody is looking for you. The desk sergeant told you to go home.", '\u{1F46E}')
    return
  }
  count(g, 'surrendered')
  addHidden(g, 'karma', 3)
  const fu = fugitive(g)
  const station = `the ${c.city} police station`
  if (fu) {
    const from = typeof fu.prison === 'string' ? fu.prison : 'prison'
    log(g, 'I turned myself in to the police.', 'neutral')
    remember(g, `Turned myself in after escaping from ${from}.`)
    arrestPlayer(g, 'Felony Escape', 3, {
      evidence: 1,
      noResist: true,
      context: pick(g, [
        `You walked into ${station} and announced that you escaped from ${from}. The officer on duty spilled their coffee.`,
        `Tired of looking over your shoulder, you turned yourself in at ${station}.`,
      ]),
    })
    return
  }
  const idx = worstUncaught(g)
  const crime = idx >= 0 ? c.criminalRecord[idx].crime : 'Disorderly Conduct'
  const severity = Math.max(1, guessSeverity(crime) - 1) // cooperating helps a little
  log(g, `I turned myself in for ${crime.toLowerCase()}.`, 'neutral')
  remember(g, `Turned myself in for ${crime.toLowerCase()}.`)
  arrestPlayer(g, crime, severity, {
    evidence: 0.9,
    noResist: true,
    recordIndex: idx >= 0 ? idx : undefined,
    context: pick(g, [
      `You walked into ${station} and confessed to ${crime.toLowerCase()}. The officer had to find a pen that worked.`,
      `You couldn't take the guilt anymore. You turned yourself in at ${station} for ${crime.toLowerCase()}.`,
      `You walked up to a patrol car, knocked on the window and said "It was me." They arrested you for ${crime.toLowerCase()}.`,
    ]),
  })
}

export const surrenderAction: MenuAction = {
  type: 'action',
  id: 'surrender',
  label: 'Turn Yourself In',
  emoji: '\u{1F46E}',
  subtitle: (g) => (fugitive(g) ? 'Turn yourself in (escaped convict)' : `Turn yourself in · Wanted ${'★'.repeat(Math.max(0, Math.min(5, g.character.wantedLevel)))}`),
  visible: canSurrender,
  disabledReason: (g) => gate(g, { minAge: 10 }),
  confirm: () => 'Turn yourself in to the police? You will be arrested and stand trial.',
  run: surrender,
}

/** Give up on this life: it ends right away, with the death screen and the Wasteful ribbon. */
export function surrenderLife(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  g.flags.surrendered = true
  killCharacter(g, 'Surrender')
  // killCharacter writes "I died from surrender."; the journal should just say it plainly.
  const entries = currentLogYear(g).entries
  const last = entries[entries.length - 1]
  if (last && /^I died from surrender\.$/.test(last.text)) last.text = 'I surrendered.'
}

export const surrenderLifeAction: MenuAction = {
  type: 'action',
  id: 'surrenderLife',
  label: 'Surrender',
  emoji: '\u{1F3F3}\u{FE0F}',
  subtitle: 'Give up on this life',
  visible: (g) => g.character.alive,
  confirm: (g) => `Don't end the life of ${fullName(g.character)}! Surrender now and this life is over for good.`,
  run: surrenderLife,
}

// ---------------------------------------------------------------------------
// Pray

interface Prayer {
  id: string
  label: string
  emoji: string
}

const PRAYERS: Prayer[] = [
  { id: 'fertility', label: 'Fertility', emoji: '\u{1F476}' },
  { id: 'general', label: 'General', emoji: '\u{1F64F}' },
  { id: 'happiness', label: 'Happiness', emoji: '\u{1F60A}' },
  { id: 'health', label: 'Health', emoji: '\u{2764}\u{FE0F}' },
  { id: 'love', label: 'Love', emoji: '\u{1F498}' },
  { id: 'wealth', label: 'Wealth', emoji: '\u{1F4B0}' },
]

const PRAY_MAX = 3
const PRAY_KEY = 'act.pray'

const NOTHING = [
  'You prayed for {topic}. You waited. A bird pooped on your car. Unclear if that was the answer.',
  'You closed your eyes and prayed for {topic}. You feel a little calmer, at least.',
  'You prayed for {topic}. The universe has put you on hold. Your call is important to it.',
  'You knelt down and prayed for {topic}. Your knees cracked loudly. Nothing else happened.',
]

function pray(g: GameState, p: Prayer): void {
  const c = g.character
  if (!useYearAction(g, PRAY_KEY, PRAY_MAX)) {
    result(g, 'Pray', pick(g, ["You've prayed a lot this year. Give the heavens a little time to catch up.", 'Your prayer inbox is full for the year. Try again next year.']), '\u{1F64F}')
    return
  }
  count(g, 'prayers')
  addHidden(g, 'religiousness', randInt(g, 1, 2))
  addStat(g, 'happiness', randInt(g, 0, 2))
  const topic = p.id === 'general' ? 'everything to be okay' : p.label.toLowerCase()
  const blessed = chance(g, 0.25 + c.hidden.karma / 400)
  log(g, `I prayed for ${topic}.`, 'neutral')
  if (!blessed) {
    result(g, 'Pray', pick(g, NOTHING).replace('{topic}', topic), p.emoji)
    return
  }
  switch (p.id) {
    case 'fertility':
      addHidden(g, 'fertility', randInt(g, 2, 5))
      result(g, 'Pray', 'You prayed for fertility. You feel... strangely optimistic about the future of your family tree.', p.emoji, 'good')
      return
    case 'happiness':
      addStat(g, 'happiness', randInt(g, 3, 7))
      result(g, 'Pray', 'You prayed for happiness and woke up the next morning humming. Nobody knows why.', p.emoji, 'good')
      return
    case 'health':
      addStat(g, 'health', randInt(g, 2, 5))
      result(g, 'Pray', 'You prayed for good health. Your nagging back pain disappeared the very next day.', p.emoji, 'good')
      return
    case 'love': {
      const partner = currentPartner(g)
      if (partner) {
        addRelationship(partner, randInt(g, 4, 8))
        result(g, 'Pray', `You prayed for love. ${partner.firstName} surprised you with breakfast in bed the next morning.`, p.emoji, 'good')
      } else {
        addStat(g, 'happiness', randInt(g, 2, 4))
        result(g, 'Pray', 'You prayed for love. A cute stranger smiled at you on the bus. It is a start.', p.emoji, 'good')
      }
      return
    }
    case 'wealth': {
      const found = localPrice(g, randInt(g, 5, 200))
      addMoney(g, found)
      log(g, `I found ${money(found)} on the sidewalk.`, 'good')
      result(g, 'Pray', `You prayed for wealth. The next day you found ${money(found)} on the sidewalk. Not exactly a fortune, but you'll take it.`, p.emoji, 'good')
      return
    }
    default:
      addHidden(g, 'karma', randInt(g, 1, 3))
      addStat(g, 'happiness', randInt(g, 2, 4))
      result(g, 'Pray', 'You prayed for everything to be okay. For the rest of the week, everything was. Mostly.', p.emoji, 'good')
  }
}

function curse(g: GameState): void {
  if (!useYearAction(g, PRAY_KEY, PRAY_MAX)) {
    result(g, 'Curse', "You've already yelled at the sky plenty this year. Your neighbors are concerned.", '\u{26C8}\u{FE0F}')
    return
  }
  addHidden(g, 'karma', -randInt(g, 1, 3))
  addHidden(g, 'religiousness', -randInt(g, 1, 3))
  log(g, 'I shook my fist at the sky and cursed the heavens.', 'neutral')
  if (chance(g, 0.08)) {
    addStat(g, 'health', -randInt(g, 3, 8))
    addStat(g, 'happiness', -randInt(g, 3, 6))
    result(g, 'Curse', 'You cursed the heavens. Seconds later, lightning struck a tree right next to you. Your eyebrows are smoking. Point taken.', '\u{26A1}', 'bad')
    return
  }
  addStat(g, 'happiness', randInt(g, 1, 4))
  result(g, 'Curse', pick(g, [
    'You shook your fist at the sky and yelled for a solid minute. Weirdly therapeutic.',
    'You cursed the heavens. A cloud drifted in front of the sun. Petty, but fair.',
  ]), '\u{26C8}\u{FE0F}')
}

export const prayMenu: MenuGroup = {
  type: 'menu',
  id: 'pray',
  label: 'Pray',
  emoji: '\u{1F64F}',
  subtitle: 'Ask the heavens for a favor',
  disabledReason: (g) => gate(g, { minAge: 18 }),
  header: (g) => `What do you want to pray about? (${usesLeft(g, PRAY_KEY, PRAY_MAX)} left this year)`,
  children: (): MenuNode[] => [
    ...PRAYERS.map(
      (p): MenuAction => ({
        type: 'action',
        id: `pray.${p.id}`,
        label: p.label,
        emoji: p.emoji,
        run: (g) => pray(g, p),
      }),
    ),
    { type: 'action', id: 'pray.curse', label: 'Curse Them Instead', emoji: '\u{26C8}\u{FE0F}', run: curse },
  ],
}

// ---------------------------------------------------------------------------
// Sweepstakes

const SWEEP_MAX = 5
const SWEEP_KEY = 'act.sweepstakes'
const PRIZE_CARS = ['Convertible', 'Sports Car', 'Electric SUV', 'Pickup Truck', 'Luxury Sedan']
const DUD_PRIZES = [
  'a year’s supply of pickles',
  'a novelty toaster that burns a smiley face into bread',
  'a coupon for 10% off your next sweepstakes entry',
  'a signed photo of a local weatherman',
  'a lifetime supply of rubber bands',
  'a fruitcake',
]

function enterSweepstakes(g: GameState): void {
  const c = g.character
  if ((g.yearActions[SWEEP_KEY] ?? 0) >= SWEEP_MAX) {
    result(g, 'Sweepstakes', "You've already entered every sweepstakes in town this year.", '\u{1F39F}\u{FE0F}')
    return
  }
  if (!spend(g, 1)) {
    brokeNotice(g, 1, 'a sweepstakes entry')
    return
  }
  g.yearActions[SWEEP_KEY] = (g.yearActions[SWEEP_KEY] ?? 0) + 1
  count(g, 'sweepstakes')
  const roll = randInt(g, 1, 1000)
  if (roll <= 2) {
    count(g, 'sweepstakesWins')
    if (chance(g, 0.5)) {
      const model = pick(g, PRIZE_CARS)
      const value = localPrice(g, randInt(g, 28_000, 65_000))
      const asset: Asset = {
        id: uid(g, 'a'),
        kind: 'car',
        name: `New ${model}`,
        emoji: model.includes('Truck') ? '\u{1F6FB}' : model.includes('SUV') ? '\u{1F699}' : '\u{1F3CE}\u{FE0F}',
        purchasePrice: 0,
        value,
        condition: 100,
        purchasedAge: c.age,
        upkeep: localPrice(g, 1_200),
        details: { make: 'Sweepstakes', model, year: g.year, prize: true },
      }
      g.assets.push(asset)
      addStat(g, 'happiness', 20)
      remember(g, `Won a ${model.toLowerCase()} in a sweepstakes.`)
      log(g, `I won a brand-new ${model.toLowerCase()} in a sweepstakes!`, 'good')
      result(g, 'You Won!', `Your $1 sweepstakes entry won the grand prize: a brand-new ${model.toLowerCase()} worth ${money(value)}! A guy with a giant novelty key showed up at your door.`, '\u{1F389}', 'good')
      return
    }
    const cash = localPrice(g, pick(g, [25_000, 50_000, 100_000, 250_000]))
    addMoney(g, cash)
    addStat(g, 'happiness', 20)
    remember(g, `Won ${money(cash)} in a sweepstakes.`)
    log(g, `I won ${money(cash)} in a sweepstakes!`, 'good')
    result(g, 'You Won!', `Your $1 sweepstakes entry won the grand prize of ${money(cash)}! They handed you a check the size of a door.`, '\u{1F389}', 'good')
    return
  }
  if (roll <= 40) {
    if (chance(g, 0.5)) {
      const card = localPrice(g, pick(g, [25, 50, 100, 250, 500]))
      addMoney(g, card)
      addStat(g, 'happiness', 4)
      log(g, `I won a ${money(card)} gift card in a sweepstakes.`, 'good')
      result(g, 'Sweepstakes', `You won a ${money(card)} gift card! Not life-changing, but definitely lunch-changing.`, '\u{1F381}', 'good')
      return
    }
    const dud = pick(g, DUD_PRIZES)
    addStat(g, 'happiness', 2)
    log(g, `I won ${dud} in a sweepstakes.`, 'neutral')
    result(g, 'Sweepstakes', `Congratulations! You won ${dud}. You did not read the fine print.`, '\u{1F381}')
    return
  }
  log(g, 'I entered a sweepstakes and lost.', 'neutral')
  result(g, 'Sweepstakes', pick(g, [
    'You entered the sweepstakes. A few weeks later you got an email: "Unfortunately..." You stopped reading there.',
    'You did not win the sweepstakes. You did, however, get signed up for 14 newsletters.',
    'Your sweepstakes entry lost. The winner was someone named Gary. You hate Gary now.',
    'No luck this time. The odds were roughly the same as getting struck by lightning while being bitten by a shark.',
  ]), '\u{1F39F}\u{FE0F}')
}

export const sweepstakesAction: MenuAction = {
  type: 'action',
  id: 'sweepstakes',
  label: 'Sweepstakes',
  emoji: '\u{1F39F}\u{FE0F}',
  subtitle: (g) => `Enter the sweepstakes · $1 · ${usesLeft(g, SWEEP_KEY, SWEEP_MAX)} entries left this year`,
  disabledReason: (g) => gate(g, { minAge: 18 }),
  run: enterSweepstakes,
}
