// Crypto from the home computer: launch your own meme coin (name it, hype it, ride the pump,
// then dump it or rug-pull it) and the other side of the trade, aping into a coin someone else
// is shilling. Dumping on your own holders costs karma and draws angry holders, online sleuths,
// lawsuits and, sometimes years later, the local securities regulator. Rug pulls are crimes.
import { arrestPlayer } from '../crime'
import { addHidden, addMoney, addRelationship, addStat, canAfford, count, formatMoney, log, notice, parents, relationLabel, remember, scriptChoice, scriptInput, shortMoney, spend, useYearAction } from '../core'
import { localPick } from '../data/locales'
import { cryptoYear } from '../invest/engine'
import { chance, pick, rand, randInt, uid } from '../rng'
import { defineScript } from '../scripts'
import { totalFollowers } from '../special/social'
import type { GameState, Json, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { addScreenTime, codingSkill } from './skills'
import {
  anchor,
  blockReason,
  canAct,
  cap,
  clampNum,
  cryptoBanned,
  dollars,
  enforcement,
  fam,
  isRecord,
  local,
  minorBusted,
  moneyState,
  num,
  parentsCatch,
  payOrBorrow,
  paidText,
  readState,
  regulator,
  scale,
  str,
  stranger,
  years,
  type CoinRecord,
  type MoneyState,
  type News,
  type Probe,
} from './money-common'
import { bankGain } from './money-options'

export const CRYPTO_MIN_AGE = 13
const MAX_STEPS = 3

// ---------------------------------------------------------------------------
// Names

const COIN_ANIMALS = ['Llama', 'Gecko', 'Possum', 'Toad', 'Goose', 'Walrus', 'Pigeon', 'Raccoon', 'Capybara', 'Hamster', 'Moose', 'Sloth', 'Penguin', 'Ferret', 'Axolotl', 'Pug', 'Yeti', 'Turnip', 'Noodle', 'Pickle', 'Waffle', 'Gremlin', 'Badger', 'Lobster']
const COIN_SUFFIX = ['Coin', 'Cash', 'Moon', 'Rocket', 'Inu', 'Token', 'Bucks', 'Gold', 'Verse', 'Mania', 'Swap', 'X']
const SHILLS = ['MoonMaxi', 'LamboLarry', 'DiamondPaws', 'WAGMI_Wendy', 'ChartWizard', 'AlphaLeaks', 'GigaBrainGains', 'CryptoCaptain', 'NotFinancialAdvice', 'TrustMeBro']
const CELEB_POSTERS = ['DJ Ruckus', 'Brick Stallworth', 'Tiffani Glamourton', 'Chaz Brightwater', 'Madame Velvet', 'Kenzie Sparks']
const EXCHANGES = ['Coinucopia', 'BlockBarn', 'HODLHub', 'Satoshi Safe', 'CryptoCastle', 'MoonBase Exchange']
const LAUNCHPADS = ['MemeForge', 'LaunchGoblin', 'Coinkiln', 'TokenToaster']
const VICTIM_JOBS = ['nurse', 'bus driver', 'retired teacher', 'college student', 'line cook', 'accountant', 'dental hygienist', 'security guard', 'barista', 'plumber']

function titleWord(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

/** A random meme-coin name, sometimes named after a local snack. */
export function coinNameIdea(g: GameState): string {
  const food = chance(g, 0.25) ? localPick(g, 'food') : ''
  const base = food && /^[A-Za-z\s]{3,16}$/.test(food) ? titleWord(food) : pick(g, COIN_ANIMALS)
  return `${base} ${pick(g, COIN_SUFFIX)}`
}

/** Clean a typed coin name: letters, digits and spaces, 2-24 chars ('' if unusable). */
export function cleanCoinName(input: string): string {
  return String(input ?? '')
    .replace(/^\s*\$+/, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
    .trim()
}

/** '$LLAMA' style ticker from a coin name: the first word, or its first 4 letters when long. */
export function tickerFor(name: string): string {
  const words = String(name ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
    .filter(Boolean)
  const first = words[0] ?? ''
  const t = first.length >= 3 ? first : words.join('')
  const out = t.length <= 5 ? t : t.slice(0, 4)
  return out.length >= 2 ? out : 'COIN'
}

// ---------------------------------------------------------------------------
// Hype inputs

function followersTerm(g: GameState): number {
  const f = Math.max(0, totalFollowers(g))
  return clampNum(Math.log10(f + 1) * 7, 0, 50)
}

/** The crypto market's mood this year (the Investments menu's crypto market). */
function mood(g: GameState): { bonus: number; label: string; winter: boolean; mania: boolean } {
  const cy = cryptoYear(fam(g), anchor(g), g.year)
  if (cy.mania) return { bonus: 10, label: 'Crypto is in a full-blown mania this year: people are buying anything with a dog on it.', winter: false, mania: true }
  if (cy.winter) return { bonus: -12, label: "It's a crypto winter: nobody is buying anything, least of all a coin named after an animal.", winter: true, mania: false }
  if (cy.ret > 0.5) return { bonus: 4, label: 'Crypto had a strong year, and the meme coin crowd is feeling lucky.', winter: false, mania: false }
  if (cy.ret < -0.3) return { bonus: -4, label: 'Crypto had a rough year. The degenerates are cautious. Ish.', winter: false, mania: false }
  return { bonus: 0, label: '', winter: false, mania: false }
}

/** Past launches make the next one harder to sell (people check who's behind a coin). */
function reputationPenalty(st: MoneyState): number {
  let p = 0
  for (const c of st.coins) p += c.outcome === 'rugged' ? (c.exposed ? 15 : 6) : c.exposed ? 8 : 3
  return Math.min(40, p)
}

export function launchFee(g: GameState): number {
  return local(g, 250)
}

function shillCost(g: GameState): number {
  return local(g, 1_500)
}

function celebCost(g: GameState): number {
  return local(g, 10_000)
}

// ---------------------------------------------------------------------------
// The launch → hype → pump → dump/rug chain (state travels in the popup data)

const NAME_SCRIPT = 'computer.money.coin.name'
const HYPE_SCRIPT = 'computer.money.coin.hype'
const PUMP_SCRIPT = 'computer.money.coin.pump'

interface CoinRun {
  name: string
  ticker: string
  /** Everything spent: launch fee + hype. */
  cost: number
  hype: number
  /** Money buyers have poured in so far (what can be taken out). */
  pool: number
  /** Price multiple since launch (display). */
  mult: number
  step: number
  trimmed: boolean
  /** Cash already taken out by trimming. */
  taken: number
  /** Promotions already used ('post', 'shill', 'celeb'). */
  promos: string[]
}

function asRun(data: Json | undefined): CoinRun | null {
  if (!isRecord(data) || typeof data.ticker !== 'string' || typeof data.name !== 'string') return null
  return {
    name: data.name,
    ticker: data.ticker,
    cost: dollars(num(data.cost)),
    hype: clampNum(num(data.hype), 0, 100),
    pool: dollars(num(data.pool)),
    mult: clampNum(num(data.mult, 1), 0, 1e6),
    step: Math.round(clampNum(num(data.step), 0, MAX_STEPS)),
    trimmed: data.trimmed === true,
    taken: dollars(num(data.taken)),
    promos: Array.isArray(data.promos) ? data.promos.filter((x): x is string => typeof x === 'string' && PROMOS.includes(x)) : [],
  }
}

function runJson(r: CoinRun): Json {
  return { ...r, promos: [...r.promos] }
}

function coinReason(g: GameState): string | null {
  const b = blockReason(g, CRYPTO_MIN_AGE)
  if (b) return b
  if (cryptoBanned(g.character.countryId)) return `Crypto is banned in ${getCountry(g.character.countryId).name}. Even the meme coins.`
  return null
}

function startLaunch(g: GameState): void {
  if (!canAct(g) || coinReason(g)) return
  const fee = launchFee(g)
  if (g.character.money < fee) {
    notice(g, 'Not Enough Money', `Launching a coin costs ${formatMoney(fee)} for the launchpad fee and a starter liquidity pool. You have ${formatMoney(Math.max(0, g.character.money))}.`, { emoji: '\u{1F4B8}' })
    return
  }
  if (!useYearAction(g, 'computer.coin.launch', 1)) {
    notice(g, 'One Is Plenty', "You already launched a coin this year. Even the crypto bros think you're doing too much.", { emoji: '\u{1F6D1}' })
    return
  }
  const idea = coinNameIdea(g)
  scriptInput(g, {
    title: 'Name Your Coin',
    emoji: '\u{1FA99}',
    text: `Every great scam... er, "community token" needs a name. What's yours called? (${pick(g, LAUNCHPADS)} charges ${formatMoney(fee)} to launch it.)`,
    input: 'text',
    placeholder: idea,
    defaultValue: idea,
    scriptId: NAME_SCRIPT,
    data: { fee, idea },
  })
}

defineScript(NAME_SCRIPT, (g, value, data) => {
  if (!isRecord(data) || !canAct(g) || coinReason(g)) return
  const fee = dollars(num(data.fee))
  const name = cleanCoinName(value) || cleanCoinName(str(data.idea)) || 'MoonCoin'
  if (!spend(g, fee)) {
    notice(g, 'Not Enough Money', `You can't cover the ${formatMoney(fee)} launch fee anymore.`, { emoji: '\u{1F4B8}' })
    return
  }
  const ticker = tickerFor(name)
  const st = moneyState(g)
  const c = g.character
  const md = mood(g)
  addScreenTime(g, 2)
  const base = followersTerm(g) * 0.4 + c.hidden.fame * 0.2 + codingSkill(g) / 12 + md.bonus + randInt(g, 0, 6) - reputationPenalty(st)
  count(g, 'coinsLaunched')
  log(g, `I launched my own meme coin, $${ticker}.`, 'event')
  const run: CoinRun = { name, ticker, cost: fee, hype: clampNum(base, 0, 100), pool: 0, mult: 1, step: 0, trimmed: false, taken: 0, promos: [] }
  showHype(g, run, `${name} ($${ticker}) is live! You hold most of the supply and seeded a tiny liquidity pool. Right now it has exactly one holder: you.${md.label ? ` ${md.label}` : ''}`)
})

const PROMOS = ['post', 'shill', 'celeb']

/** The hype menu: each promotion once, then start the pump. */
function showHype(g: GameState, run: CoinRun, lead: string): void {
  const left = PROMOS.filter((p) => !run.promos.includes(p))
  if (!left.length) {
    startPump(g, run, lead)
    return
  }
  const followers = totalFollowers(g)
  const labels: Record<string, { label: string; emoji: string }> = {
    post: { label: followers > 0 ? `Post about it to your ${followers.toLocaleString('en-US')} followers` : 'Post about it (to your 0 followers)', emoji: '\u{1F4E3}' },
    shill: { label: `Pay shill accounts to hype it (${formatMoney(shillCost(g))})`, emoji: '\u{1F916}' },
    celeb: { label: `Pay a celebrity for a post (${formatMoney(celebCost(g))})`, emoji: '\u{1F31F}' },
  }
  const first = run.promos.length === 0
  scriptChoice(
    g,
    HYPE_SCRIPT,
    first ? `$${run.ticker} Is Live` : 'More Hype?',
    `${lead}\n\n${first ? 'How will you get the word out?' : 'Want to push it even harder before buyers pile in?'}`,
    [...left.map((id) => ({ id, ...labels[id] })), { id: 'go', label: first ? 'Let it grow on its own' : "That's enough hype", emoji: first ? '\u{1F331}' : '\u{1F680}' }],
    { emoji: '\u{1FA99}', data: runJson(run) },
  )
}

defineScript(HYPE_SCRIPT, (g, choice, data) => {
  const run = asRun(data)
  if (!run || !g.character.alive || g.character.prison) return
  if (!PROMOS.includes(choice) || run.promos.includes(choice)) {
    startPump(g, run, run.promos.length ? '' : `You let $${run.ticker} find its audience. Its audience appears to be three bots and a guy named Kevin.`)
    return
  }
  if ((choice === 'shill' && !canAfford(g, shillCost(g))) || (choice === 'celeb' && !canAfford(g, celebCost(g)))) {
    showHype(g, { ...run, promos: [...run.promos, choice] }, `You can't afford ${choice === 'celeb' ? 'a celebrity' : 'a shill army'} right now.`)
    return
  }
  run.promos.push(choice)
  let text: string
  if (choice === 'shill') {
    spend(g, shillCost(g))
    run.cost += shillCost(g)
    const flagged = chance(g, 0.12)
    run.hype += flagged ? randInt(g, 5, 10) : randInt(g, 12, 20)
    text = flagged
      ? `You paid for an army of "investor" accounts. Halfway through the campaign the platform banned most of them for all posting the exact same rocket emoji at 4:02 a.m.`
      : `You paid for an army of accounts with names like "CryptoKing" and "Satoshi's Cousin." By morning $${run.ticker} was trending in three group chats you've never heard of.`
  } else if (choice === 'celeb') {
    spend(g, celebCost(g))
    run.cost += celebCost(g)
    const celeb = pick(g, CELEB_POSTERS)
    const oops = chance(g, 0.15)
    run.hype += oops ? randInt(g, 10, 15) : randInt(g, 20, 30)
    text = oops
      ? `${celeb} took your money and posted about $${run.ticker}... with the wrong ticker. Thousands of fans bought a completely different coin. Some of them found yours anyway.`
      : `${celeb} posted "${pick(g, ['not financial advice but', 'my accountant hates this one', 'just bought a bag of'])} $${run.ticker} \u{1F680}" to millions of fans. Your phone hasn't stopped buzzing since.`
  } else {
    run.hype += followersTerm(g) * 0.4 + randInt(g, 4, 9)
    text =
      totalFollowers(g) >= 10_000
        ? `You posted a rocket emoji and the word "soon." Your followers took it from there.`
        : `You posted about $${run.ticker} and tagged everyone you know. Your aunt liked it. She does not know what it is.`
  }
  run.hype = clampNum(run.hype, 0, 100)
  showHype(g, run, text)
})

/**
 * Money buyers pour in (US dollars) at a hype level: grows fast while word spreads, then only
 * slowly past 66 (everyone who'd buy a frog coin already has).
 */
export function hypePool(hype: number): number {
  const h = clampNum(hype, 0, 100)
  return 160 * Math.exp(Math.min(h, 66) / 12) * (1 + Math.max(0, h - 66) / 15)
}

/** Buyers arrive: size the pool from the hype (and luck), then show the first pump. */
function startPump(g: GameState, run: CoinRun, lead: string): void {
  run.hype = clampNum(run.hype + randInt(g, 0, 3), 0, 100)
  const luck = 0.6 + rand(g)
  run.pool = dollars(Math.min(scale(g) * hypePool(run.hype) * luck, local(g, 5_000_000)))
  run.mult = Math.round((1.5 + rand(g) * 4 + run.hype / 20) * 10) / 10
  showPump(g, run, lead)
}

function holders(g: GameState, pool: number): number {
  return Math.max(3, Math.round(pool / Math.max(20, scale(g) * 150)))
}

function showPump(g: GameState, run: CoinRun, lead: string): void {
  const dumpEst = dollars(run.pool * 0.42 + run.taken)
  const rugEst = dollars(run.pool * 0.82 + run.taken)
  const final = run.step >= MAX_STEPS
  const head = `$${run.ticker} is up ${Math.round((run.mult - 1) * 100).toLocaleString('en-US')}% since launch with ${holders(g, run.pool).toLocaleString('en-US')} holders. Your bag is worth about ${formatMoney(run.pool * 0.9)} on paper, but selling it all at once would crash the price.`
  const tail = final ? ' The hype is peaking. Group chats are going quiet. It is now or never.' : ' Hold for more, or cash out?'
  const choices = [
    ...(final ? [] : [{ id: 'hold', label: 'Hold for more', emoji: '\u{1F680}' }]),
    ...(run.trimmed ? [] : [{ id: 'trim', label: `Quietly sell a quarter (~${formatMoney(run.pool * 0.12)})`, emoji: '\u{1F90F}' }]),
    { id: 'dump', label: `Dump your whole bag (~${formatMoney(dumpEst)})`, emoji: '\u{1F4C9}' },
    { id: 'rug', label: `Rug-pull: drain the pool (~${formatMoney(rugEst)}, a crime)`, emoji: '\u{1F9F9}' },
  ]
  scriptChoice(g, PUMP_SCRIPT, run.step === 0 ? 'To the Moon?' : 'Still Pumping', `${lead ? `${lead}\n\n` : ''}${head}${tail}`, choices, { emoji: '\u{1F4C8}', data: runJson(run) })
}

defineScript(PUMP_SCRIPT, (g, choice, data) => {
  const run = asRun(data)
  if (!run || !g.character.alive || g.character.prison) return
  if (choice === 'trim' && !run.trimmed) {
    const got = dollars(run.pool * 0.12)
    run.taken += got
    run.pool = dollars(run.pool * 0.85)
    run.trimmed = true
    showPump(g, run, `You sold a quarter of your bag for ${formatMoney(got)}. The chart dipped, the holders called it "a healthy pullback," and kept buying.`)
    return
  }
  if (choice === 'hold' && run.step < MAX_STEPS) {
    const md = mood(g)
    const risk = clampNum(0.2 + 0.1 * run.step - run.hype / 700 + (md.winter ? 0.08 : 0) - (md.mania ? 0.05 : 0), 0.12, 0.6)
    if (chance(g, risk)) {
      // Someone else got out first: an early buyer, a bot, or a "partner".
      run.pool = dollars(run.pool * (0.05 + rand(g) * 0.1))
      finishCoin(g, run, 'dumpedOn', dollars(run.pool * 0.5))
      return
    }
    const growth = 1.25 + rand(g) * 0.9 + run.hype / 250
    run.pool = dollars(Math.min(run.pool * growth, local(g, 25_000_000)))
    run.mult = Math.round(run.mult * growth * 10) / 10
    run.step += 1
    showPump(g, run, pick(g, [`You held. $${run.ticker} kept climbing as strangers bought in.`, `Diamond hands! A new wave of buyers pushed $${run.ticker} even higher.`, `$${run.ticker} hit a new all-time high. Someone made fan art of the mascot.`]))
    return
  }
  if (choice === 'rug') {
    finishCoin(g, run, 'rugged', dollars(run.pool * (0.75 + rand(g) * 0.15)))
    return
  }
  finishCoin(g, run, 'dumped', dollars(run.pool * (0.35 + rand(g) * 0.15)))
})

function victimLine(g: GameState, ticker: string): string {
  const v = stranger(g, 19, 78)
  const job = pick(g, VICTIM_JOBS)
  return pick(g, [
    `${v.full}, a ${v.age}-year-old ${job}, put ${v.his} vacation fund into $${ticker} at the very top. ${cap(v.he)} is now on a permanent staycation.`,
    `${v.full}, ${v.age}, had told ${v.his} family that $${ticker} would pay for a new roof. It's raining in ${v.his} living room tonight.`,
    `${v.full}, a ${job}, posted a video crying in ${v.his} car about $${ticker}. It got more views than your coin ever had holders.`,
    `${v.full}, ${v.age}, bought $${ticker} because your post said "not financial advice" and ${v.he} took that as a sign.`,
  ])
}

/** Record a crime the player committed (uncaught for now); returns its record index. */
function recordCrime(g: GameState, crime: string): number {
  const c = g.character
  count(g, 'crimes')
  c.criminalRecord.push({ crime, age: c.age, caught: false, convicted: false })
  return c.criminalRecord.length - 1
}

/** Severity of a financial crime by how much it took (in local terms). */
export function fraudSeverity(g: GameState, take: number): number {
  const s = take / Math.max(0.25, scale(g))
  return s < 10_000 ? 2 : s < 250_000 ? 3 : 4
}

function finishCoin(g: GameState, run: CoinRun, outcome: CoinRecord['outcome'], cashOut: number): void {
  const c = g.character
  const st = moneyState(g)
  const realized = dollars(run.taken + cashOut)
  const size = realized / Math.max(0.25, scale(g))
  const sizeLog = Math.log10(1 + size / 1_000)
  const cid = c.countryId
  const reg = regulator(cid)
  const enforce = enforcement(cid)
  const ft = followersTerm(g)
  const parts: string[] = []
  let tax = 0
  let recordIndex = -1

  if (outcome === 'rugged') {
    addMoney(g, realized)
    count(g, 'moneyStolen', realized)
    count(g, 'thefts')
    count(g, 'rugPulls')
    recordIndex = recordCrime(g, 'Securities Fraud')
    addHidden(g, 'karma', -Math.round(15 + 4 * sizeLog))
    addHidden(g, 'notoriety', Math.round(5 + 3 * sizeLog))
    parts.push(`You pulled every last coin of liquidity out of $${run.ticker} and walked away with ${formatMoney(realized)}. The chart went vertical, then vertical the other way. ${victimLine(g, run.ticker)}`)
  } else {
    tax = bankGain(g, st, realized - run.cost, realized, true)
    if (outcome === 'dumped') {
      count(g, 'coinDumps')
      addHidden(g, 'karma', -Math.round(3 + 3 * sizeLog))
      addHidden(g, 'notoriety', Math.round(1 + 2 * sizeLog))
      parts.push(`You dumped your whole bag of $${run.ticker} for ${formatMoney(realized)}. The price fell ${randInt(g, 70, 95)}% in an hour and the holders' group chat turned into a crime scene. ${victimLine(g, run.ticker)}`)
    } else {
      addHidden(g, 'karma', -Math.round(2 + sizeLog))
      parts.push(`Someone with a much bigger bag dumped $${run.ticker} before you could. By the time you sold, your fortune had shrunk to ${formatMoney(realized)}. You got rugged on your own rug.`)
    }
  }
  const profit = realized - run.cost
  if (tax > 0) parts.push(`(${formatMoney(tax)} of your profit went to taxes.)`)
  addStat(g, 'happiness', profit > 0 ? randInt(g, 4, 10) : -randInt(g, 4, 10))

  // Online sleuths follow the money.
  const exposeP = outcome === 'rugged' ? 0.4 + 0.15 * sizeLog + ft / 250 : outcome === 'dumped' ? 0.08 + 0.12 * sizeLog + ft / 250 : 0.03
  const exposed = chance(g, clampNum(exposeP, 0, 0.95))
  if (exposed) {
    addHidden(g, 'notoriety', randInt(g, 4, 8))
    addHidden(g, 'fame', 2)
    addStat(g, 'happiness', -randInt(g, 3, 8))
    parts.push(`An online sleuth traced the coin's wallets back to you and posted a 40-part thread about it. ${pick(g, EXCHANGES)} delisted $${run.ticker}, and your name is now a verb on crypto forums.`)
  }

  // Angry holders sue (adults with real money at stake).
  if (exposed && outcome !== 'dumpedOn' && c.age >= 18 && size >= 20_000) {
    const bill = dollars(realized * (0.2 + rand(g) * 0.25))
    const lender = 'Settlement Express Loans'
    const financed = payOrBorrow(g, bill, lender)
    count(g, 'lawsuitsLost')
    parts.push(`Then ${holders(g, run.pool).toLocaleString('en-US')} angry holders filed a class action. You settled for ${paidText(bill, financed, lender)}.`)
  }

  // A regulator may start quietly building a case.
  let probe = false
  if (outcome === 'rugged') {
    const p = clampNum((0.3 + 0.6 * enforce + (exposed ? 0.1 : 0)) * (size < 1_000 ? 0.5 : 1), 0, 0.97)
    if (exposed && chance(g, enforce * 0.15)) {
      log(g, `I rug-pulled my $${run.ticker} coin and took ${formatMoney(realized)}.`, 'event')
      remember(g, `Launched the $${run.ticker} meme coin and rug-pulled it for ${shortMoney(realized)}.`)
      const home = minorBusted(g, 'rug-pulling strangers with a homemade crypto coin')
      arrestPlayer(g, 'Securities Fraud', fraudSeverity(g, realized), { recordIndex, evidence: 0.8, context: `${parts[0]} Two days later, ${cap(reg)} froze your accounts and the police came for you.${home ? ` ${home}` : ''}` })
      saveCoin(g, st, run, outcome, realized, exposed, cid)
      return
    }
    probe = chance(g, p)
  } else if (outcome === 'dumped' && size >= 3_000) {
    probe = chance(g, clampNum(enforce * (0.2 + 0.12 * sizeLog) + (exposed ? 0.2 : 0), 0, 0.85))
  }
  if (probe) {
    const pr: Probe = {
      id: uid(g, 'probe'),
      kind: outcome === 'rugged' ? 'rug' : 'dump',
      ticker: run.ticker,
      take: realized,
      dueAge: c.age + randInt(g, 1, outcome === 'rugged' ? 5 : 4),
      startAge: c.age,
      countryId: cid,
      evidence: Math.round(clampNum((outcome === 'rugged' ? 0.65 : 0.5) + rand(g) * 0.2 + (exposed ? 0.1 : 0), 0, 0.95) * 100) / 100,
      publicCase: exposed,
      recordIndex,
    }
    st.probes.push(pr)
    if (exposed) parts.push(`Someone in the replies tagged ${reg}. Probably nothing.`)
  }

  // Minors: parents find out.
  if (c.age < 18 && outcome !== 'dumpedOn') {
    const p = outcome === 'rugged' ? (exposed ? 0.85 : 0.35) : exposed ? 0.65 : 0.2
    if (chance(g, p)) {
      const what = outcome === 'rugged' ? 'rug-pulling strangers with a homemade crypto coin' : 'running a crypto pump-and-dump on the family Wi-Fi'
      parts.push(parentsCatch(g, what, outcome === 'rugged' ? 3 : randInt(g, 1, 2), outcome === 'rugged' ? 14 : 8))
      if (outcome === 'rugged') {
        const refund = Math.min(dollars(g.character.money), dollars(realized * (0.5 + rand(g) * 0.5)))
        if (refund > 0) {
          addMoney(g, -refund)
          addHidden(g, 'karma', 5)
          parts.push(`They also made you send ${formatMoney(refund)} back to the holders you could find.`)
        }
      }
    }
  }

  saveCoin(g, st, run, outcome, realized, exposed, cid)
  if (outcome === 'rugged') remember(g, `Launched the $${run.ticker} meme coin and rug-pulled it for ${shortMoney(realized)}.`)
  else if (outcome === 'dumped' && size >= 10_000) remember(g, `Pumped and dumped my own meme coin, $${run.ticker}, for ${shortMoney(realized)}.`)
  log(
    g,
    outcome === 'rugged' ? `I rug-pulled my $${run.ticker} coin and took ${formatMoney(realized)}.` : outcome === 'dumped' ? `I dumped my $${run.ticker} coin for ${formatMoney(realized)}.` : `My $${run.ticker} coin got dumped on before I could sell.`,
    outcome === 'dumpedOn' ? 'bad' : 'event',
  )
  const title = outcome === 'rugged' ? 'Rug Pulled' : outcome === 'dumped' ? 'Dumped' : 'Dumped On'
  const text = parts.join('\n\n')
  notice(g, title, text, { emoji: outcome === 'rugged' ? '\u{1F9F9}' : outcome === 'dumped' ? '\u{1F4C9}' : '\u{1F62D}', tone: outcome === 'dumpedOn' ? 'bad' : 'event', ai: { when: 'full', facts: text } })
}

function saveCoin(g: GameState, st: MoneyState, run: CoinRun, outcome: CoinRecord['outcome'], take: number, exposed: boolean, countryId: string): void {
  st.coins.push({ name: run.name, ticker: run.ticker, age: g.character.age, outcome, take, exposed, countryId })
  if (st.coins.length > 8) st.coins.splice(0, st.coins.length - 8)
}

// ---------------------------------------------------------------------------
// The other side: ape into someone else's coin

const APE_SCRIPT = 'computer.money.ape'

function apeMin(g: GameState): number {
  return Math.max(10, local(g, 20))
}

function startApe(g: GameState): void {
  if (!canAct(g) || coinReason(g)) return
  const min = apeMin(g)
  const cash = dollars(g.character.money)
  if (cash < min) {
    notice(g, 'Broke', `You need at least ${formatMoney(min)} to ape into anything. The shills will have to rob someone else.`, { emoji: '\u{1F4B8}' })
    return
  }
  if (!useYearAction(g, 'computer.coin.ape', 2)) {
    notice(g, 'Chill', "You've aped into enough coins this year. Your wallet has filed a restraining order.", { emoji: '\u{1F6D1}' })
    return
  }
  const name = coinNameIdea(g)
  const ticker = tickerFor(name)
  const handle = `@${pick(g, SHILLS)}${randInt(g, 7, 99)}`
  const small = Math.max(min, Math.round(cash * 0.1))
  const big = Math.max(small + 1, Math.round(cash * 0.4))
  const amounts = [...new Set([small, Math.min(big, cash), cash])].filter((a) => a >= min && a <= cash)
  const md = mood(g)
  scriptChoice(
    g,
    APE_SCRIPT,
    `$${ticker} \u{1F680}`,
    `${handle} (${randInt(g, 12, 900)}K followers) swears $${ticker} is "the next 1000x" and that "the devs are based." The chart is a straight line up. Every comment is a rocket emoji.${md.label ? ` ${md.label}` : ''} Do you ape in?`,
    [
      ...amounts.map((a) => ({ id: String(a), label: a === cash ? `All in (${formatMoney(a)})` : `Ape in ${formatMoney(a)}`, emoji: a === cash ? '\u{1F92A}' : '\u{1F98D}' })),
      { id: 'pass', label: 'Pass', emoji: '\u{1F645}' },
    ],
    { emoji: '\u{1F98D}', data: { ticker } },
  )
}

/** Ape outcome multiple (money back per $1 put in). Negative expected value; manias help. */
export function apeMultiple(g: GameState, mania: boolean, winter: boolean): { mult: number; kind: 'rug' | 'bleed' | 'ride' | 'moon' } {
  const u = rand(g)
  // Expected money back per $1: ~0.89 in a mania, ~0.78 normally, ~0.55 in a crypto winter.
  const rugP = mania ? 0.56 : winter ? 0.68 : 0.6
  const bleedP = rugP + (mania ? 0.26 : 0.25)
  const rideP = bleedP + (mania ? 0.15 : winter ? 0.05 : 0.125)
  if (u < rugP) return { mult: Math.round(rand(g) * 30) / 100, kind: 'rug' }
  if (u < bleedP) return { mult: 0.4 + Math.round(rand(g) * 40) / 100, kind: 'bleed' }
  if (u < rideP) return { mult: 1.5 + Math.round(rand(g) * 250) / 100, kind: 'ride' }
  return { mult: 4 + Math.round(rand(g) * 800) / 100, kind: 'moon' }
}

defineScript(APE_SCRIPT, (g, choice, data) => {
  if (choice === 'pass' || !isRecord(data) || !canAct(g)) return
  const ticker = str(data.ticker, 'COIN')
  const amount = Math.min(dollars(Number(choice)), dollars(g.character.money))
  if (amount < apeMin(g)) return
  const st = moneyState(g)
  const md = mood(g)
  addScreenTime(g, 1)
  const r = apeMultiple(g, md.mania, md.winter)
  const payout = dollars(Math.min(amount * r.mult, amount + local(g, 250_000)))
  addMoney(g, -amount)
  const tax = bankGain(g, st, payout - amount, payout, true)
  const net = payout - amount
  st.apes += 1
  st.apePnl = Math.round(st.apePnl + net)
  count(g, 'cryptoApes')
  let title: string
  let text: string
  if (r.kind === 'rug') {
    title = 'Rugged'
    text = `The devs of $${ticker} pulled the liquidity three hours after you bought. Your ${formatMoney(amount)} is now worth ${formatMoney(payout)}. The shill deleted the post and changed his name to "${pick(g, SHILLS)}". You are the exit liquidity.`
    addStat(g, 'happiness', -randInt(g, 5, 10))
  } else if (r.kind === 'bleed') {
    title = 'Slow Bleed'
    text = `$${ticker} slowly bled out over a few weeks as early buyers sold to people like you. You got out with ${formatMoney(payout)} of your ${formatMoney(amount)}.`
    addStat(g, 'happiness', -randInt(g, 2, 5))
  } else if (r.kind === 'ride') {
    title = 'Rode It Up'
    text = `Against all odds, $${ticker} kept pumping and you sold near the top for ${formatMoney(payout)}. You are now an expert, according to you.`
    addStat(g, 'happiness', randInt(g, 4, 8))
  } else {
    title = 'To the Moon!'
    text = `$${ticker} went absolutely parabolic. Your ${formatMoney(amount)} became ${formatMoney(payout)}! You screenshot your gains and set them as your phone background.`
    addStat(g, 'happiness', randInt(g, 8, 14))
  }
  if (tax > 0) text += ` (${formatMoney(tax)} went to taxes.)`
  const c = g.character
  if (c.age < 18 && net < 0 && -net >= local(g, 300) && chance(g, 0.3)) {
    const ps = parents(g)
    for (const p of ps) addRelationship(p, -randInt(g, 3, 8))
    const who = ps.length === 1 ? `Your ${relationLabel(ps[0]).toLowerCase()}` : 'Your parents'
    text += `\n\n${who} found out you lost ${formatMoney(-net)} on a coin with a frog on it and gave you a two-hour lecture on "real investing."`
  }
  log(g, net >= 0 ? `I made ${formatMoney(net)} aping into the $${ticker} coin.` : `I lost ${formatMoney(-net)} aping into the $${ticker} coin.`, net >= 0 ? 'good' : 'bad')
  notice(g, title, text, { emoji: net >= 0 ? '\u{1F680}' : '\u{1F98D}', tone: net >= 0 ? 'good' : 'bad' })
})

// ---------------------------------------------------------------------------
// Regulators catching up (yearly)

/** At most one due probe per year resolves; the rest wait. */
export function coinProbeNews(g: GameState, st: MoneyState): News | null {
  const c = g.character
  // A rug pull the police already caught you for (another arrest got to it first) is closed.
  st.probes = st.probes.filter((p) => !(p.recordIndex >= 0 && c.criminalRecord[p.recordIndex]?.caught))
  const due = st.probes.filter((p) => p.dueAge <= c.age).sort((a, b) => a.dueAge - b.dueAge)
  if (!due.length) return null
  const probe = due[0]
  // Everything else due waits a year.
  for (const p of due.slice(1)) p.dueAge = c.age + 1
  const moved = probe.countryId !== c.countryId
  const reach = moved ? 0.6 : 1
  const enforce = enforcement(probe.countryId)
  const reg = regulator(probe.countryId)
  const spent = Math.max(1, c.age - probe.startAge)
  const caught = probe.kind === 'rug' ? chance(g, clampNum((0.45 + 0.45 * enforce) * reach * (0.7 + 0.3 * probe.evidence), 0, 0.97)) : chance(g, clampNum((0.35 + 0.4 * enforce) * reach, 0, 0.9))
  const drop = () => {
    st.probes = st.probes.filter((p) => p.id !== probe.id)
  }
  if (!caught) {
    return {
      priority: 2,
      popup: (gg) => {
        drop()
        log(gg, `I found out ${reg} had been looking into my $${probe.ticker} coin. They quietly closed the case.`, 'good')
      },
      quiet: (gg) => {
        drop()
        log(gg, `I found out ${reg} had been looking into my $${probe.ticker} coin. They quietly closed the case.`, 'good')
      },
    }
  }
  const postpone = () => {
    const p = st.probes.find((x) => x.id === probe.id)
    if (p) p.dueAge = c.age + 1
  }
  if (probe.kind === 'rug' || (probe.take / Math.max(0.25, scale(g)) >= 200_000 && chance(g, 0.3))) {
    return {
      priority: 90,
      popup: (gg) => {
        drop()
        const crime = probe.kind === 'rug' ? 'Securities Fraud' : 'Market Manipulation'
        const abroad = moved ? ` You'd moved to ${getCountry(gg.character.countryId).name}, but they found you anyway.` : ''
        remember(gg, `Arrested for the $${probe.ticker} coin, ${years(spent)} after the fact.`)
        const home = minorBusted(gg, probe.kind === 'rug' ? 'rug-pulling strangers with a homemade crypto coin' : 'behind a crypto pump-and-dump')
        arrestPlayer(gg, crime, fraudSeverity(gg, probe.take), {
          recordIndex: probe.recordIndex >= 0 ? probe.recordIndex : undefined,
          evidence: probe.evidence,
          noResist: false,
          context: `${cap(reg)} spent ${years(spent)} quietly tracing the $${probe.ticker} ${probe.kind === 'rug' ? 'rug pull' : 'pump-and-dump'} back to you.${abroad} They handed the case to prosecutors, and this morning the police knocked on your door. You're under arrest for ${crime.toLowerCase()}.${home ? ` ${home}` : ''}`,
        })
      },
      quiet: postpone,
    }
  }
  return {
    priority: 80,
    popup: (gg) => {
      drop()
      const disgorge = dollars(probe.take * (0.5 + rand(gg) * 0.4))
      const fine = dollars(probe.take * (0.1 + rand(gg) * 0.2))
      const bill = disgorge + fine
      const cc = gg.character
      let how: string
      if (cc.age < 18) {
        const ps = parents(gg)
        const payer = [...ps].sort((a, b) => b.money - a.money)[0]
        const fromKid = Math.min(dollars(cc.money), bill)
        if (fromKid > 0) addMoney(gg, -fromKid)
        if (payer && bill > fromKid) payer.money = Math.max(0, Math.round(payer.money - (bill - fromKid)))
        how = `${payer ? `Your ${relationLabel(payer).toLowerCase()} had to cover what you couldn't.` : ''} ${parentsCatch(gg, 'the subject of a securities investigation', 2, 15)}`
      } else {
        // Loan screens and finance popups print the lender at the start of sentences too.
        const lender = cap(reg)
        const financed = payOrBorrow(gg, bill, lender)
        how = `You paid ${paidText(bill, financed, lender)}.`
      }
      addHidden(gg, 'notoriety', randInt(gg, 3, 8))
      addStat(gg, 'happiness', -randInt(gg, 6, 12))
      count(gg, 'regulatorSettlements')
      log(gg, `${cap(reg)} fined me over my $${probe.ticker} coin.`, 'bad')
      remember(gg, `Fined by ${reg} for pumping and dumping $${probe.ticker}.`)
      const text = `${cap(reg)} spent ${years(spent)} investigating your $${probe.ticker} pump-and-dump. You agreed to give back ${formatMoney(disgorge)} in profits and pay a ${formatMoney(fine)} fine without admitting wrongdoing (everyone knows). ${how}`.trim()
      notice(gg, 'Regulators', text, { emoji: '\u{1F3DB}\u{FE0F}', tone: 'bad', ai: { when: 'full', facts: text } })
    },
    quiet: postpone,
  }
}

// ---------------------------------------------------------------------------
// Menu

export function cryptoMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'computer.crypto',
    label: 'Crypto Schemes',
    emoji: '\u{1FA99}',
    subtitle: (g) => {
      const st = readState(g)
      const last = st.coins[st.coins.length - 1]
      return last ? `Last coin: $${last.ticker} (${last.outcome === 'rugged' ? 'rug-pulled' : last.outcome === 'dumped' ? 'dumped' : 'dumped on'})` : 'Launch a meme coin, or ape into one'
    },
    visible: (g) => g.character.alive && g.character.age >= CRYPTO_MIN_AGE,
    disabledReason: coinReason,
    header: (g) => {
      const md = mood(g)
      return `Meme coins: a get-rich-quick scheme where someone always gets rich quick. Make sure it's you.${md.label ? ` ${md.label}` : ''}`
    },
    children: (g): MenuNode[] => {
      const st = readState(g)
      const nodes: MenuNode[] = [
        {
          type: 'action',
          id: 'computer.crypto.launch',
          label: 'Launch a Meme Coin',
          emoji: '\u{1F680}',
          subtitle: `${formatMoney(launchFee(g))} launchpad fee · once a year`,
          disabledReason: coinReason,
          run: startLaunch,
        },
        {
          type: 'action',
          id: 'computer.crypto.ape',
          label: 'Ape Into a Hot New Coin',
          emoji: '\u{1F98D}',
          subtitle: 'Someone is shilling it hard',
          disabledReason: coinReason,
          run: startApe,
        },
      ]
      if (st.coins.length) {
        nodes.push({
          type: 'info',
          id: 'computer.crypto.history',
          emoji: '\u{1F4DC}',
          text: st.coins
            .slice(-4)
            .map((x) => `$${x.ticker}: ${x.outcome === 'rugged' ? 'rug-pulled' : x.outcome === 'dumped' ? 'dumped' : 'dumped on'} for ${formatMoney(x.take)}${x.exposed ? ' (exposed online)' : ''}`)
            .join('\n'),
        })
      }
      if (st.apes) nodes.push({ type: 'info', id: 'computer.crypto.apes', emoji: '\u{1F98D}', text: `Aped into ${st.apes} coin${st.apes === 1 ? '' : 's'}: ${st.apePnl >= 0 ? 'up' : 'down'} ${formatMoney(Math.abs(st.apePnl))} overall.` })
      return nodes
    },
  }
}

/** For the AI summary. */
export function cryptoSummary(st: MoneyState): string {
  const parts: string[] = []
  const last = st.coins[st.coins.length - 1]
  if (last) {
    const what = last.outcome === 'rugged' ? 'rug-pulled it' : last.outcome === 'dumped' ? 'dumped it on holders' : 'got dumped on'
    const probe = st.probes.some((p) => p.publicCase) ? ' (under investigation)' : ''
    parts.push(`launched the $${last.ticker} meme coin and ${what}${last.exposed ? ', exposed online' : ''}${probe}${st.coins.length > 1 ? `; ${st.coins.length} coins launched in all` : ''}`)
  }
  if (st.apes >= 2) parts.push(`apes into meme coins (${st.apePnl >= 0 ? 'up' : 'down'} ${shortMoney(Math.abs(st.apePnl))})`)
  return parts.join('; ')
}
