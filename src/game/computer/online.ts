// Getting online, by era: the home computer's connection to the world. A bulletin board over a
// modem (1983 on), the early web through a screeching dial-up line (1995 on), broadband when it
// reached the player's country, and the app store once phones and tablets had one (2008 on).
// Each row exists only when the technology does where the player lives (techAdoption, not just
// the calendar: a 1998 teen in Lagos has a cyber cafe, not a modem), and each has a price: phone
// minutes (billed by the minute outside North America), a virus, an in-app surprise, or time at
// the screen (useComputer counts it against the yearly screen-time limit).
import { ownsComputer } from '../computer'
import { addStat, count, formatMoney, log, notice, spend } from '../core'
import { eraPrice, wealthOf } from '../events/era-late-kit'
import { hasTech, techOdds } from '../history/timeline'
import { createPerson, notePerson } from '../people'
import { chance, pick, randInt } from '../rng'
import type { GameState, MenuGroup, MenuNode } from '../types'
import { ageBlock, computerBlock, firstReason, useComputer } from './dev-common'

export type Link = 'none' | 'bbs' | 'dialup' | 'broadband'

const FLAG = 'computer.broadband'

/** Local calls were billed by the minute almost everywhere except North America. */
export function meteredCalls(g: GameState): boolean {
  return !['us', 'ca'].includes(g.character.countryId)
}

/** Could the player's phone company install broadband this year? */
export function broadbandAvailable(g: GameState): boolean {
  return g.year >= 2000 && hasTech(g, 'internet') && techOdds(g, 'internet') >= 0.08 && (wealthOf(g) >= 0.4 || g.year >= 2012)
}

/** The home connection of the era for this household. */
export function linkOf(g: GameState): Link {
  if (!hasTech(g, 'homeComputer') || g.year < 1983) return 'none'
  if (g.flags[FLAG] === true && broadbandAvailable(g)) return 'broadband'
  if (broadbandAvailable(g) && g.year >= 2005 + Math.round((1 - Math.min(1, wealthOf(g))) * 6)) return 'broadband'
  if (hasTech(g, 'internet')) return 'dialup'
  return g.year <= 1999 ? 'bbs' : 'none'
}

export function linkLabel(link: Link): string {
  return link === 'bbs' ? 'a modem and a bulletin board' : link === 'dialup' ? 'dial-up (the phone line is busy while you are online)' : link === 'broadband' ? 'broadband' : 'no connection'
}

/** The yearly phone bill of dial-up where calls are metered, in constant dollars (0 otherwise). */
export function dialupBill(g: GameState): number {
  return linkOf(g) === 'dialup' && meteredCalls(g) ? eraPrice(g, 120) : 0
}

function sessionCost(g: GameState, usd: number): number {
  const link = linkOf(g)
  if (link === 'broadband') return 0
  return meteredCalls(g) ? eraPrice(g, usd) : eraPrice(g, usd / 4)
}

function pay(g: GameState, cost: number, what: string): boolean {
  if (cost <= 0 || spend(g, cost)) return true
  notice(g, 'Online', `You can't pay ${formatMoney(cost)} for ${what}.`, { emoji: '\u{1F4B8}' })
  return false
}

function limitReason(g: GameState, key: string, max: number): string | null {
  return (g.yearActions[key] ?? 0) >= max ? 'You have done enough of that this year.' : null
}

function bbs(g: GameState): void {
  if (limitReason(g, 'computer.bbs', 4)) return
  const cost = sessionCost(g, 2)
  if (!pay(g, cost, 'the phone minutes')) return
  g.yearActions['computer.bbs'] = (g.yearActions['computer.bbs'] ?? 0) + 1
  count(g, 'bbs')
  useComputer(g)
  const roll = randInt(g, 1, 100)
  if (roll <= 50) {
    if ((g.yearActions['computer.bbs'] ?? 0) <= 2) addStat(g, 'smarts', 1)
    addStat(g, 'happiness', randInt(g, 3, 5))
    notice(g, 'Bulletin Board', 'Your modem screeched, a stranger’s computer answered and you spent an hour swapping shareware games, plain files and bad jokes with people who knew each other by nicknames.', { emoji: '\u{1F4DF}' })
  } else if (roll <= 75) {
    const f = createPerson(g, { relation: 'friend', age: g.character.age + randInt(g, -3, 3), relationship: randInt(g, 45, 65) })
    notePerson(f, 'Met the player on a bulletin board.')
    addStat(g, 'happiness', 4)
    log(g, `I made a new friend on a bulletin board: ${f.firstName}.`, 'good')
    notice(g, 'Bulletin Board', `You chatted for an hour with a user called "Night Owl". Turns out ${f.firstName} ${f.lastName} lives a few streets away and has the same taste in games.`, { emoji: '\u{1F4DF}', tone: 'good' })
  } else if (roll <= 90) {
    notice(g, 'Bulletin Board', 'The line was busy, then busier. After forty minutes of redialing you gave up and watched TV.', { emoji: '\u{1F4DF}' })
  } else if (meteredCalls(g)) {
    const extra = eraPrice(g, 20)
    spend(g, Math.min(extra, Math.max(0, g.character.money)))
    addStat(g, 'happiness', -3)
    notice(g, 'Bulletin Board', `You lost track of time and stayed on until midnight. The phone bill came to an extra ${formatMoney(extra)}, and your parents noticed.`, { emoji: '\u{1F4DF}', tone: 'bad' })
  } else {
    addStat(g, 'happiness', 2)
    notice(g, 'Bulletin Board', 'You lost track of time and stayed on until midnight. Local calls were free, so only your sleep paid for it.', { emoji: '\u{1F4DF}' })
  }
}

function earlyWeb(g: GameState): void {
  if (limitReason(g, 'computer.web', 6)) return
  const cost = sessionCost(g, 3)
  if (!pay(g, cost, 'the phone minutes')) return
  g.yearActions['computer.web'] = (g.yearActions['computer.web'] ?? 0) + 1
  count(g, 'webSessions')
  useComputer(g)
  const roll = randInt(g, 1, 100)
  if (roll <= 55) {
    // Reading the early web teaches something the first few times; later sessions add less.
    if ((g.yearActions['computer.web'] ?? 0) <= 3) addStat(g, 'smarts', randInt(g, 1, 2))
    addStat(g, 'happiness', randInt(g, 1, 3))
    notice(g, 'The Web', `Each page took a minute to load, line by line. You looked up ${pick(g, ['how volcanoes work', 'the lyrics to a song', 'a recipe for flapjacks', 'the capital of Burkina Faso', 'a cheat code'])} and learned more than you did at school that day.`, { emoji: '\u{1F310}' })
  } else if (roll <= 90) {
    addStat(g, 'happiness', randInt(g, 1, 4))
    notice(g, 'The Web', 'You followed link after link through a haze of animated icons, guestbooks and pages "under construction." Three hours vanished.', { emoji: '\u{1F310}' })
  } else {
    const fix = eraPrice(g, 40)
    spend(g, Math.min(fix, Math.max(0, g.character.money)))
    addStat(g, 'happiness', -3)
    notice(g, 'The Web', `A free screensaver came with a stowaway. Your computer slowed to a crawl, and the repair shop charged ${formatMoney(fix)}.`, { emoji: '\u{1F310}', tone: 'bad' })
  }
}

function upgrade(g: GameState): void {
  const cost = eraPrice(g, 250)
  if (g.flags[FLAG] === true) {
    notice(g, 'Broadband', 'Your house already has broadband.', { emoji: '\u{1F680}' })
    return
  }
  if (!pay(g, cost, 'the installation')) return
  g.flags[FLAG] = true
  addStat(g, 'happiness', 6)
  log(g, 'I upgraded from dial-up to broadband. The phone line was free at last.', 'good')
  notice(g, 'Broadband', `The technician drilled a hole in the wall, plugged in a little box and a green light came on. Pages load at once, the phone line is free and the monthly dial-up bill is history (${formatMoney(cost)}).`, { emoji: '\u{1F680}', tone: 'good' })
}

function appStore(g: GameState): void {
  if (limitReason(g, 'computer.apps', 6)) return
  const cost = eraPrice(g, 5)
  if (!pay(g, cost, 'the app')) return
  g.yearActions['computer.apps'] = (g.yearActions['computer.apps'] ?? 0) + 1
  count(g, 'appsBought')
  const roll = randInt(g, 1, 100)
  if (roll <= 25) {
    addStat(g, 'smarts', 1)
    addStat(g, 'happiness', 2)
    notice(g, 'App Store', 'You downloaded a language-learning app and kept the streak alive for nine days. A record.', { emoji: '\u{1F4F2}' })
  } else if (roll <= 85) {
    addStat(g, 'happiness', randInt(g, 2, 4))
    notice(g, 'App Store', `You downloaded ${pick(g, ['a puzzle game', 'a photo filter', 'a flashlight', 'a game about birds', 'a weather app'])} and used it for exactly one weekend.`, { emoji: '\u{1F4F2}' })
  } else {
    const extra = eraPrice(g, 15)
    spend(g, Math.min(extra, Math.max(0, g.character.money)))
    addStat(g, 'happiness', -2)
    notice(g, 'App Store', `The free app turned out to sell hats for its mascot, and a small tap bought one. The charge: ${formatMoney(extra)}.`, { emoji: '\u{1F4F2}', tone: 'bad' })
  }
}

function gate(g: GameState, key: string, max: number, minAge: number): string | null {
  return firstReason(computerBlock(g), ageBlock(g, minAge, 'do that'), limitReason(g, key, max))
}

/** Connection rows for the Computer menu (empty when the player owns no computer or has no connection). */
export function onlineNodes(g: GameState): MenuNode[] {
  if (!ownsComputer(g)) return []
  const link = linkOf(g)
  const nodes: MenuNode[] = []
  const rows: MenuNode[] = []
  if (link === 'bbs') {
    rows.push({ type: 'action', id: 'computer.online.bbs', label: 'Dial a Bulletin Board', emoji: '\u{1F4DF}', subtitle: (s) => `Shareware, nicknames and a busy signal · ${formatMoney(sessionCost(s, 2))} in phone minutes`, disabledReason: (s) => gate(s, 'computer.bbs', 4, 10), run: bbs })
  }
  if (link === 'dialup') {
    rows.push({ type: 'action', id: 'computer.online.web', label: 'Surf the Early Web', emoji: '\u{1F310}', subtitle: (s) => `Pages load line by line · ${formatMoney(sessionCost(s, 3))} in phone minutes`, disabledReason: (s) => gate(s, 'computer.web', 6, 8), run: earlyWeb })
    if (broadbandAvailable(g)) {
      rows.push({ type: 'action', id: 'computer.online.upgrade', label: 'Upgrade to Broadband', emoji: '\u{1F680}', subtitle: (s) => `${formatMoney(eraPrice(s, 250))} once · frees the phone line, ends the dial-up bill`, disabledReason: (s) => firstReason(computerBlock(s), ageBlock(s, 18, 'sign up for broadband'), s.character.money < eraPrice(s, 250) ? 'You cannot afford the installation yet.' : null), confirm: (s) => `Pay ${formatMoney(eraPrice(s, 250))} for broadband?`, run: upgrade })
    }
  }
  if (g.year >= 2008 && hasTech(g, 'smartphone')) {
    rows.push({ type: 'action', id: 'computer.online.apps', label: 'Browse the App Store', emoji: '\u{1F4F2}', subtitle: (s) => `A few dollars at a time · ${Math.max(0, 6 - (s.yearActions['computer.apps'] ?? 0))} left this year`, disabledReason: (s) => gate(s, 'computer.apps', 6, 8), run: appStore })
  }
  if (!rows.length && link === 'none') return nodes
  const group: MenuGroup = {
    type: 'menu',
    id: 'computer.online',
    label: 'Connection',
    emoji: '\u{1F4E1}',
    subtitle: (s) => `Your home connection: ${linkLabel(linkOf(s))}`,
    header: (s) => `You connect through ${linkLabel(linkOf(s))}.${dialupBill(s) > 0 ? ` The phone company bills the minutes: about ${formatMoney(dialupBill(s))} a year.` : ''}`,
    children: () => rows,
  }
  if (rows.length) nodes.push(group)
  return nodes
}

/** Yearly hook: the dial-up phone bill where calls are metered (parents pay while the player is a minor). */
export function yearlyOnline(g: GameState): void {
  const c = g.character
  if (!c.alive || !ownsComputer(g)) return
  const bill = dialupBill(g)
  if (bill <= 0 || c.age < 18) return
  const paid = Math.min(bill, Math.max(0, c.money))
  if (paid <= 0) return
  spend(g, paid)
  if (paid >= bill * 0.9 && chance(g, 0.4)) log(g, `My dial-up phone bill came to ${formatMoney(paid)} this year.`, 'neutral')
}
