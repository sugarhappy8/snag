// Online scams from the home computer (a crime, 12+): fake stores, fake giveaways, scary
// "account suspended" messages, fake tech support, romance cons and fake charities. Written as
// comedy with consequences, never as instructions: every success costs karma and shows who got
// hurt, every scam adds heat that cools over the years, and the cybercrime unit (stronger where
// corruption is low) can knock at any time. Parents who catch a kid at it take the computer.
import { arrestPlayer } from '../crime'
import { addHidden, addMoney, addStat, count, formatMoney, log, notice, remember, useYearAction } from '../core'
import { chance, pick, rand, randInt } from '../rng'
import { totalFollowers } from '../special/social'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { addScreenTime, codingSkill } from './skills'
import { blockReason, canAct, cap, clampNum, cyberUnit, dollars, enforcement, minorBusted, moneyState, parentsCatch, readState, scale, seizeComputer, stranger, type MoneyState, type News } from './money-common'

export const SCAMS_MIN_AGE = 12

type Reach = 'coding' | 'followers' | 'smarts' | 'looks'

interface Victim {
  full: string
  first: string
  age: number
  he: string
  his: string
}

interface ScamDef {
  id: string
  label: string
  emoji: string
  subtitle: string
  minAge: number
  crime: string
  /** Base take range in US dollars. */
  take: [number, number]
  difficulty: number
  /** How often victims report it. */
  report: number
  karma: number
  heat: number
  reach: Reach
  victimAge: [number, number]
  did: string[]
  victims: ((v: Victim, amount: string) => string)[]
  fails: string[]
}

const SCAMS: ScamDef[] = [
  {
    id: 'store',
    label: 'Fake Online Store',
    emoji: '\u{1F6CD}\u{FE0F}',
    subtitle: 'Sell sneakers that will never ship',
    minAge: 12,
    crime: 'Online Fraud',
    take: [150, 2_500],
    difficulty: 0.1,
    report: 0.25,
    karma: 6,
    heat: 12,
    reach: 'coding',
    victimAge: [16, 60],
    did: [
      'You opened an online store full of designer sneakers at suspiciously low prices. None of them exist.',
      'You put up a slick web shop selling "limited-edition" gadgets that will never, ever ship.',
    ],
    victims: [
      (v, a) => `${v.full}, ${v.age}, spent ${a} on a birthday present for ${v.his} kid from your store. ${cap(v.he)} is still refreshing the tracking page.`,
      (v) => `${v.full}, ${v.age}, saved up for months for those sneakers. ${cap(v.he)} left a one-star review that just says "why."`,
    ],
    fails: ['Nobody bought anything. Your store looked like it was designed in 2003 by a raccoon.', 'A payment processor took one look at your shop and shut it down before lunch.'],
  },
  {
    id: 'giveaway',
    label: 'Fake Giveaway',
    emoji: '\u{1F381}',
    subtitle: 'A prize nobody will ever win',
    minAge: 12,
    crime: 'Online Fraud',
    take: [80, 1_500],
    difficulty: 0.08,
    report: 0.3,
    karma: 7,
    heat: 12,
    reach: 'followers',
    victimAge: [13, 30],
    did: [
      'You announced a giveaway for a brand-new game console. The only winner was ever going to be you.',
      'You ran a "celebrate 1 million followers" giveaway. You do not have 1 million followers. There is no prize.',
    ],
    victims: [
      (v) => `${v.first}, ${v.age}, was sure that this time ${v.he} would finally win something. ${cap(v.he)} told the whole class.`,
      (v, a) => `${v.full}, ${v.age}, paid ${a} in "fees" for a prize that doesn't exist and is now very suspicious of the internet. Good for ${v.his} future, bad for ${v.his} wallet.`,
    ],
    fails: ['Your giveaway got 4 likes, all from bots running their own giveaways.', 'The comments filled up with people calling it a scam. They were right.'],
  },
  {
    id: 'suspended',
    label: '"Account Suspended" Messages',
    emoji: '\u{1F4E7}',
    subtitle: 'Scare strangers about their accounts',
    minAge: 14,
    crime: 'Identity Theft',
    take: [200, 4_000],
    difficulty: 0.15,
    report: 0.35,
    karma: 9,
    heat: 16,
    reach: 'coding',
    victimAge: [25, 82],
    did: [
      'You blasted out scary messages telling strangers their accounts were about to be suspended. A few panicked.',
      'You sent a wave of "URGENT: final warning" messages to people who had done nothing wrong. Some believed you.',
    ],
    victims: [
      (v) => `${v.full}, ${v.age}, panicked about losing an account full of family photos. Now ${v.he} has lost the photos and the money.`,
      (v, a) => `${v.full}, ${v.age}, lost ${a} and now answers every phone call with "I know what you are."`,
    ],
    fails: ["Your messages were so full of typos that even the spam filter felt embarrassed for you.", 'Everyone ignored your messages. People are getting smarter. Unfortunately for you.'],
  },
  {
    id: 'techsupport',
    label: 'Fake Tech Support',
    emoji: '\u{260E}\u{FE0F}',
    subtitle: "Call grandparents about a 'virus'",
    minAge: 14,
    crime: 'Wire Fraud',
    take: [300, 6_000],
    difficulty: 0.2,
    report: 0.3,
    karma: 13,
    heat: 18,
    reach: 'smarts',
    victimAge: [70, 92],
    did: [
      'You called retirees pretending to be from "Computer Department Support" and told them their computers were "full of viruses."',
      'You spent the afternoon on the phone with grandparents, doing your best IT-guy voice.',
    ],
    victims: [
      (v) => `${v.full}, ${v.age}, thanked you for being "such a helpful young person." That's the part that should sting.`,
      (v, a) => `${v.full}, ${v.age}, paid ${a} to fix a problem ${v.his} computer never had. ${cap(v.he)} still can't find the email icon.`,
    ],
    fails: ['Grandma kept you on the phone for two hours talking about her cats and never paid a cent.', 'The first grandpa you called was a retired police detective. He asked for your full name. You hung up.'],
  },
  {
    id: 'romance',
    label: 'Romance Scam',
    emoji: '\u{1F494}',
    subtitle: 'Catfish lonely hearts for "travel money"',
    minAge: 16,
    crime: 'Wire Fraud',
    take: [500, 12_000],
    difficulty: 0.25,
    report: 0.2,
    karma: 15,
    heat: 15,
    reach: 'looks',
    victimAge: [35, 75],
    did: [
      'You built a dating profile around a handsome stranger\'s vacation photos and a tragic story about being "stuck overseas."',
      'You spent weeks sweet-talking a lonely stranger online, then mentioned a sudden "emergency."',
    ],
    victims: [
      (v) => `${v.full}, ${v.age}, had already picked out a song for the wedding. ${cap(v.he)} is still waiting at the airport arrivals board in ${v.his} head.`,
      (v, a) => `${v.full}, ${v.age}, sent ${a} of ${v.his} savings to someone ${v.he} thought loved ${v.his} laugh.`,
    ],
    fails: ['Your match asked for a video call. You do not look like a 6-foot-4 surgeon.', 'Your match turned out to be another scammer. You spent a month scamming each other and both went home broke.'],
  },
  {
    id: 'charity',
    label: 'Fake Charity Drive',
    emoji: '\u{1F397}\u{FE0F}',
    subtitle: "Raise money for a cause that doesn't exist",
    minAge: 12,
    crime: 'Charity Fraud',
    take: [100, 3_000],
    difficulty: 0.12,
    report: 0.3,
    karma: 12,
    heat: 14,
    reach: 'followers',
    victimAge: [25, 88],
    did: [
      'You launched a donation drive for the "Society for Sad Puppies." There is no society, and the puppies are fine.',
      'You raised money for a "school trip for orphans." The only trip was yours, to the mall.',
    ],
    victims: [
      (v, a) => `${v.full}, a ${v.age}-year-old retiree, gave ${a} out of a pension that barely covers groceries, because ${v.he} once had a sad puppy too.`,
      (v) => `${v.full}, ${v.age}, shared your fundraiser with ${v.his} whole church group. They prayed for the puppies.`,
    ],
    fails: ['Your fundraiser raised $0 and one comment asking what "sad puppies" means.', 'A real charity spotted your fake one and reported it within the hour.'],
  },
]

export function scamDefs(): readonly ScamDef[] {
  return SCAMS
}

function reachFactor(g: GameState, r: Reach): number {
  const c = g.character
  switch (r) {
    case 'coding':
      return 1 + codingSkill(g) / 60
    case 'followers':
      return 1 + Math.log10(Math.max(0, totalFollowers(g)) + 1) / 2
    case 'smarts':
      return 0.6 + c.stats.smarts / 100
    case 'looks':
      return 0.6 + c.stats.looks / 100
  }
}

/** Severity (1-4) of online fraud by how much it took, in local terms. */
export function scamSeverity(g: GameState, take: number): number {
  const s = take / Math.max(0.25, scale(g))
  return s < 2_000 ? 1 : s < 25_000 ? 2 : s < 250_000 ? 3 : 4
}

/** Odds a scam works (0.15-0.85). */
export function scamSuccessChance(g: GameState, def: ScamDef, heat: number): number {
  const c = g.character
  return clampNum(0.62 - def.difficulty + (c.stats.smarts - 50) / 300 + codingSkill(g) / 500 - heat / 400, 0.15, 0.85)
}

function heatMeter(h: number): string {
  const n = Math.round(clampNum(h, 0, 100) / 20)
  return `${'\u{1F525}'.repeat(n)}${'\u{25CB}'.repeat(5 - n)}`
}

function enforcementWord(e: number): string {
  return e >= 0.7 ? 'very good at their jobs' : e >= 0.5 ? 'decent' : e >= 0.35 ? 'overworked' : 'mostly busy with bigger fish'
}

function recordScam(g: GameState, st: MoneyState, crime: string): number {
  const c = g.character
  count(g, 'crimes')
  c.criminalRecord.push({ crime, age: c.age, caught: false, convicted: false })
  const idx = c.criminalRecord.length - 1
  st.scamRecords.push(idx)
  if (st.scamRecords.length > 30) st.scamRecords.splice(0, st.scamRecords.length - 30)
  return idx
}

function runScam(g: GameState, def: ScamDef): void {
  const c = g.character
  if (!canAct(g) || c.age < def.minAge) return
  if (!useYearAction(g, 'computer.scam', 3)) {
    notice(g, 'Lie Low', pick(g, ["You've run enough scams this year. Your inbox is 90% angry people. Lie low until next year.", 'Every platform you use has flagged you this year. Wait it out.', 'Even scammers need a vacation. Try again next year.']), { emoji: '\u{1FAE3}' })
    return
  }
  const st = moneyState(g)
  const enforce = enforcement(c.countryId)
  const unit = cyberUnit(c.countryId)
  const idx = recordScam(g, st, def.crime)
  addScreenTime(g, 1)
  st.scams += 1
  st.scamKinds[def.id] = (st.scamKinds[def.id] ?? 0) + 1
  count(g, 'scams')
  const did = pick(g, def.did)

  if (!chance(g, scamSuccessChance(g, def, st.heat))) {
    addHidden(g, 'karma', -2)
    addStat(g, 'happiness', -randInt(g, 1, 4))
    st.heat = clampNum(st.heat + def.heat / 2, 0, 100)
    const banned = chance(g, 0.3)
    if (banned) st.bans += 1
    if (chance(g, enforce * def.report * 0.4)) {
      const home = minorBusted(g, 'running online scams')
      arrestPlayer(g, def.crime, 1, { recordIndex: idx, evidence: 0.7, context: `${did} It went nowhere, except to the inbox of ${unit}, who traced it straight to your bedroom.${home ? ` ${home}` : ''}` })
      return
    }
    log(g, `I tried an online scam and it flopped.`, 'bad')
    notice(g, 'Flopped', `${did}\n\n${pick(g, def.fails)}${banned ? ' The platform banned your account, too.' : ''}`, { emoji: '\u{1F926}', tone: 'bad' })
    return
  }

  const ageF = c.age < 16 ? 0.6 : c.age < 18 ? 0.8 : 1
  const diminish = 1 / (1 + 0.15 * ((st.scamKinds[def.id] ?? 1) - 1))
  const banPenalty = 1 / (1 + 0.1 * st.bans)
  const take = dollars(randInt(g, def.take[0], def.take[1]) * scale(g) * reachFactor(g, def.reach) * ageF * diminish * banPenalty)
  const sizeLog = Math.log10(1 + take / Math.max(0.25, scale(g)) / 1_000)
  addMoney(g, take)
  count(g, 'moneyStolen', take)
  count(g, 'thefts')
  st.scamTake += take
  addHidden(g, 'karma', -Math.round(def.karma + 3 * sizeLog))
  addHidden(g, 'notoriety', 1)
  addStat(g, 'happiness', randInt(g, 1, 4))
  st.heat = clampNum(st.heat + def.heat + 4 * sizeLog, 0, 100)
  const victim = stranger(g, def.victimAge[0], def.victimAge[1])
  const share = formatMoney(Math.max(1, Math.round(take / randInt(g, 2, 6))))
  const conscience =
    c.hidden.karma >= 40
      ? pick(g, ['You feel a little sick about it.', "You couldn't sleep that night.", 'You bought yourself something nice with it. It did not feel nice.'])
      : pick(g, ["You didn't feel a thing. That's the scary part.", 'You slept like a baby. A very guilty baby.'])
  const parts = [`${did} You made ${formatMoney(take)}.`, `${pick(g, def.victims)(victim, share)} ${conscience}`]
  let kept = take

  // Getting scammed back.
  if (chance(g, 0.07)) {
    const lost = Math.min(dollars(c.money), dollars(take * (0.3 + rand(g) * 0.5)))
    if (lost > 0) {
      addMoney(g, -lost)
      kept -= lost
      parts.push(`Then you bought a "Get Rich Scamming" course for ${formatMoney(lost)}. It was a PDF of a cat. Karma has a sense of humor.`)
    }
  }
  if (chance(g, 0.15)) {
    st.bans += 1
    parts.push('The platform banned your account a few days later.')
  }

  // The cybercrime unit can move fast.
  const arrestP = clampNum(enforce * (0.03 + st.heat / 500 + def.report * 0.1), 0, 0.6)
  if (chance(g, arrestP)) {
    log(g, `I ran a ${def.label.toLowerCase()} and made ${formatMoney(take)}.`, 'event')
    let home = minorBusted(g, 'running online scams')
    const refund = c.age < 18 ? Math.min(dollars(c.money), kept) : 0
    if (refund > 0) {
      addMoney(g, -refund)
      addHidden(g, 'karma', 3)
      home += ` They made you refund ${formatMoney(refund)} to ${victim.first}.`
    }
    arrestPlayer(g, def.crime, scamSeverity(g, take), { recordIndex: idx, evidence: 0.75, context: `${parts[0]} ${victim.first} reported it, and ${unit} traced it back to you within the week.${home ? ` ${home}` : ''}` })
    return
  }

  // Minors: parents check the browser history.
  if (c.age < 18 && chance(g, clampNum(0.12 + st.heat / 250, 0, 0.6))) {
    parts.push(parentsCatch(g, 'running online scams', randInt(g, 1, 3), 12))
    const refund = Math.min(dollars(c.money), kept)
    if (refund > 0) {
      addMoney(g, -refund)
      addHidden(g, 'karma', 3)
      parts.push(`They made you refund ${formatMoney(refund)} to ${victim.first} and write an apology letter. By hand.`)
    }
  }

  if (st.scams === 1) remember(g, `Ran my first online scam (${def.label.toLowerCase()}).`)
  log(g, `I ran a ${def.label.toLowerCase()} and made ${formatMoney(take)}.`, 'event')
  const text = parts.join('\n\n')
  notice(g, 'Scammed', text, { emoji: def.emoji, tone: 'event', ai: { when: 'full', facts: text } })
}

// ---------------------------------------------------------------------------
// Yearly: heat cools, and sometimes the case catches up

/** The newest uncaught scam on the record (-1 if none). */
function openScamRecord(g: GameState, st: MoneyState): number {
  const rec = g.character.criminalRecord
  for (let i = st.scamRecords.length - 1; i >= 0; i--) {
    const idx = st.scamRecords[i]
    const r = rec[idx]
    if (r && !r.caught && !r.convicted) return idx
  }
  return -1
}

export function scamNews(g: GameState, st: MoneyState): News | null {
  const c = g.character
  if (st.heat < 20) return null
  const idx = openScamRecord(g, st)
  if (idx < 0) return null
  const p = clampNum((enforcement(c.countryId) * st.heat) / 220, 0, 0.5)
  if (!chance(g, p)) return null
  const crime = c.criminalRecord[idx].crime
  return {
    priority: 85,
    popup: (gg) => {
      const s = moneyState(gg)
      s.heat = Math.round(s.heat / 2)
      const unit = cyberUnit(gg.character.countryId)
      const back = seizeComputer(gg, 1)
      const home = minorBusted(gg, 'running online scams')
      arrestPlayer(gg, crime, scamSeverity(gg, Math.max(1, s.scamTake / Math.max(1, s.scams))), {
        recordIndex: idx,
        evidence: clampNum(0.5 + s.heat / 200, 0.5, 0.9),
        context: `${cap(unit)} finally connected a pile of angry complaints to your home address. They seized your computer as evidence${home ? '.' : ` (you'll get it back when you're ${back}, maybe).`}${home ? ` ${home}` : ''}`,
      })
    },
    quiet: () => {},
  }
}

export function coolHeat(g: GameState, st: MoneyState): void {
  if (st.heat <= 0) return
  st.heat = Math.max(0, Math.round(st.heat - randInt(g, 12, 22)))
}

// ---------------------------------------------------------------------------
// Menu

function scamAction(def: ScamDef): MenuAction {
  return {
    type: 'action',
    id: `computer.scam.${def.id}`,
    label: def.label,
    emoji: def.emoji,
    subtitle: def.subtitle,
    disabledReason: (g) => blockReason(g, def.minAge),
    run: (g) => runScam(g, def),
  }
}

export function scamsMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'computer.scams',
    label: 'Online Scams',
    emoji: '\u{1F3A3}',
    subtitle: (g) => {
      const st = readState(g)
      return st.scams ? `Heat ${heatMeter(st.heat)}` : 'A crime. With victims.'
    },
    visible: (g) => g.character.alive && g.character.age >= SCAMS_MIN_AGE,
    disabledReason: (g) => blockReason(g, SCAMS_MIN_AGE),
    header: (g) => {
      const st = readState(g)
      const e = enforcement(g.character.countryId)
      return `Scamming is a crime, and every victim is a real person (in this game, anyway). Each scam adds heat, and heat only cools with time. ${cap(cyberUnit(g.character.countryId))} here ${g.character.countryId === 'us' ? 'are' : 'is'} ${enforcementWord(e)}. Heat: ${heatMeter(st.heat)}`
    },
    children: (): MenuNode[] => SCAMS.map(scamAction),
  }
}

/** For the AI summary. */
export function scamsSummary(st: MoneyState): string {
  if (!st.scams) return ''
  const heat = st.heat >= 60 ? 'police closing in' : st.heat >= 30 ? 'heat rising' : 'lying low'
  return `runs online scams (${st.scams} so far, ${formatMoney(st.scamTake)} taken, ${heat})`
}
