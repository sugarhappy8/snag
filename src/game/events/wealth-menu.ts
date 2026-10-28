// The Money section of a person's sheet (Relationships): their allowance (a slider, paid every
// year), what they owe you, how spoiled they are, what they've asked for lately, and big gifts
// you can give on your own: a car, a trip, help with a house, seed money for their idea, a loan.
// Menus never consume the game's RNG or change state; only run() does.
import { moveCash } from '../cash'
import { addHidden, addRelationship, count, getPerson, inPrison, log, notice, scriptChoice, spend, useYearAction } from '../core'
import { touch } from '../love'
import { notePerson } from '../people'
import { chance, randInt } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import { talentHint } from '../talents'
import { getCountry } from '../world'
import { cars, eraPickPlain, flights } from './era'
import { addVenture, carLabel, carPrice, setAllowance, ventureOdds, VENTURE_PARTIAL, type CarType } from './wealth-kids'
import type { Ask } from './wealth-ask'
import { askedPurse, payPersonWhole, wholePurse } from './purses'
import { isEstranged } from './will-core'
// The money-request popups' scripts (registered on import).
import './wealth-resolve'
import {
  addEntitlement,
  allowanceMax,
  allowanceNorm,
  allowanceVerdict,
  cap,
  entitlement,
  goodsScale,
  gratitude,
  housingScale,
  isAbroad,
  isDescendant,
  isFriend,
  isParent,
  isPartner,
  isSibling,
  luxuryScale,
  money,
  myOf,
  perceivedWealth,
  personCountry,
  pocketWord,
  readTies,
  repayOdds,
  round,
  short,
  typicalIncome,
  updateTies,
  upbringing,
  upbringingLabel,
  wealthTier,
  type WealthTies,
} from './wealth-core'
import type { ChoiceOption, GameState, MenuAction, MenuGroup, MenuNode, Person } from '../types'

const CAR_SCRIPT = 'wealth.menu.car'
const TRIP_SCRIPT = 'wealth.menu.trip'
const HOUSE_SCRIPT = 'wealth.menu.house'

function pr(p: Person) {
  return p.gender === 'male' ? { he: 'he', him: 'him', his: 'his', He: 'He' } : { he: 'she', him: 'her', his: 'her', He: 'She' }
}

/** Who gets a Money section: family and friends, while you're an adult. */
export function hasMoneyMenu(g: GameState, p: Person): boolean {
  if (!p.alive || p.relation === 'pet' || p.data.disowned === true || isEstranged(g, p) || g.character.age < 18 || !g.character.alive) return false
  // Babies and toddlers have nothing to ask for or be given yet (pocket money starts at 4).
  if (isDescendant(p)) return p.age >= 4
  return isParent(p) || isSibling(p) || isPartner(p) || isFriend(p) || p.relation === 'grandparent'
}

function allowanceWord(g: GameState, p: Person): string {
  if (p.age < 18) return cap(pocketWord(g))
  return isDescendant(p) ? 'Allowance' : 'Yearly Support'
}

/** Who can have an allowance / support set up (kids from 4, adult family). */
function allowanceOk(p: Person): boolean {
  if (isDescendant(p)) return p.age >= 4
  return (isParent(p) || p.relation === 'grandparent' || isSibling(p)) && p.age >= 18
}

function carOk(g: GameState, p: Person): boolean {
  const driving = getCountry(personCountry(g, p)).drivingAge
  if (!(cars(g) || (wealthTier(g) >= 2 && g.year >= 1950))) return false
  if (isDescendant(p)) return p.age >= driving
  return (isPartner(p) || isParent(p)) && p.age >= driving
}

function houseOk(p: Person): boolean {
  return ((isDescendant(p) || isSibling(p)) && p.age >= 21) || isParent(p)
}

function ventureOk(p: Person): boolean {
  return p.age >= 20 && p.age <= 70 && (isDescendant(p) || isSibling(p) || isFriend(p) || isParent(p))
}

function lendOk(p: Person): boolean {
  return p.age >= 18 && !isPartner(p) && (isDescendant(p) || isSibling(p) || isFriend(p) || isParent(p) || p.relation === 'grandparent')
}

/** One line about where things stand with this person. */
export function moneySummary(g: GameState, p: Person): string {
  const t = readTies(g, p)
  const parts: string[] = []
  if (t.allowance > 0) parts.push(`${allowanceWord(g, p)}: ${short(t.allowance)}/yr`)
  if (t.owes > 0) parts.push(`Owes you ${short(t.owes)}`)
  if (t.given > 0) parts.push(`Given so far: ${short(t.given)}`)
  return parts.join(' · ')
}

/** The short money line on a person's status row ('' when there's nothing to say). */
export function moneyStatus(g: GameState, p: Person): string {
  if (!p.alive || p.relation === 'pet') return ''
  const t = readTies(g, p)
  const parts: string[] = []
  if (t.allowance > 0) parts.push(`\u{1FA99} ${allowanceWord(g, p)} ${short(t.allowance)}/yr`)
  if (t.owes > 0) parts.push(`Owes you ${short(t.owes)}`)
  return parts.join(' · ')
}

function historyLine(t: WealthTies): string {
  if (!t.history.length) return ''
  const word: Record<string, string> = { yes: 'you said yes', less: 'you gave some', lend: 'you lent it', no: 'you said no', bound: 'you set boundaries' }
  return t.history
    .slice(-3)
    .reverse()
    .map((h) => `${h.y}: ${h.what} (${word[h.ans]})`)
    .join('\n')
}

/**
 * A reader for the numbers of a person that the profile fogs (R4-U5): `(g, p, field, truth)` answers the words the player may read,
 * a range or a word. The screen that builds the menu hands it in; this file does not import people-fog.ts (events->life is a counted
 * pair of the layer ratchet). Without one the text is today's.
 */
export type PersonWords = (g: GameState, p: Person, field: string, truth: number) => string

function infoText(g: GameState, p: Person, words?: PersonWords): string {
  const t = readTies(g, p)
  const lines: string[] = []
  const summary = moneySummary(g, p)
  if (summary) lines.push(summary)
  if (isDescendant(p)) {
    const how = upbringing(g, p)
    const spoiled = entitlement(p)
    lines.push(`Upbringing: ${upbringingLabel(how)}${spoiled > 0 ? ` · Entitlement ${words ? words(g, p, 'entitlement', spoiled) : `${spoiled}%`}` : ''}`)
  }
  if (t.car) lines.push(`Drives the ${t.car.label.replace(/^an? /, '')} you bought ${pr(p).him}`)
  if (t.bound > g.year) lines.push(`Money talk is off the table until ${t.bound}`)
  const hist = historyLine(t)
  if (hist) lines.push(`Lately asked for:\n${hist}`)
  return lines.join('\n') || `You and ${p.firstName} have never talked money. Enjoy it while it lasts.`
}

function act(id: string, pid: string, base: Omit<MenuAction, 'type' | 'id' | 'run'> & { run: (g: GameState, p: Person, input?: string) => void }): MenuAction {
  return {
    ...base,
    type: 'action',
    id: `wealth.${id}`,
    run: (g, input) => {
      const p = getPerson(g, pid)
      if (!p || !p.alive || !g.character.alive) return
      base.run(g, p, input)
    },
  }
}

function prisonBlock(g: GameState): string | null {
  return inPrison(g) ? "You can't do that from prison." : null
}

/** The Money group for a person's sheet (empty when it doesn't apply). */
export function wealthNodes(g: GameState, person: Person, words?: PersonWords): MenuNode[] {
  if (!hasMoneyMenu(g, person)) return []
  const pid = person.id
  const live = (x: GameState) => getPerson(x, pid)
  const group: MenuGroup = {
    type: 'menu',
    id: 'wealth',
    label: 'Money Matters',
    emoji: '\u{1F4B0}',
    subtitle: (x) => {
      const p = live(x)
      return (p && moneySummary(x, p)) || 'Allowance, loans and big gifts'
    },
    visible: (x) => {
      const p = live(x)
      return !!p && hasMoneyMenu(x, p)
    },
    header: (x) => {
      const p = live(x)
      return p ? `You have ${money(Math.max(0, x.character.money))} in cash.` : ''
    },
    children: (x) => {
      const p = live(x)
      if (!p) return []
      return moneyChildren(x, p, words)
    },
  }
  return [group]
}

function moneyChildren(g: GameState, p: Person, words?: PersonWords): MenuNode[] {
  const pid = p.id
  const nodes: MenuNode[] = [{ type: 'info', id: 'wealth.info', emoji: '\u{1F4CB}', text: (x) => (getPerson(x, pid) ? infoText(x, getPerson(x, pid)!, words) : '') }]
  if (allowanceOk(p)) nodes.push(allowanceAction(g, p))
  const t = readTies(g, p)
  if (t.owes > 0) nodes.push(repayAction(p), forgiveAction(p))
  if (lendOk(p)) nodes.push(lendAction(g, p))
  if (carOk(g, p)) nodes.push(carAction(p))
  if (p.age >= (isDescendant(p) ? 12 : 18)) nodes.push(tripAction(p))
  if (houseOk(p)) nodes.push(houseAction(p))
  if (ventureOk(p)) nodes.push(ventureAction(g, p))
  return nodes
}

// ----- Allowance -----------------------------------------------------------------

function allowanceAction(g: GameState, p: Person): MenuAction {
  const pid = p.id
  const label = allowanceWord(g, p)
  return act('allowance', pid, {
    // Menu rows are title case ('Set Pocket Money').
    label: `Set ${label.replace(/\b\w/g, (ch) => ch.toUpperCase())}`,
    emoji: '\u{1FA99}',
    subtitle: (x) => {
      const q = getPerson(x, pid)
      if (!q) return ''
      const cur = readTies(x, q).allowance
      return cur > 0 ? `${money(cur)} a year, paid automatically` : `Typical: about ${money(allowanceNorm(x, q))} a year`
    },
    input: {
      kind: 'slider',
      money: true,
      label: `${label} for ${p.firstName} (per year, 0 to stop)`,
      min: 0,
      max: allowanceMax(g, p),
      step: 1,
      defaultValue: (x) => {
        const q = getPerson(x, pid)
        if (!q) return '0'
        const cur = readTies(x, q).allowance
        return String(cur > 0 ? cur : allowanceNorm(x, q))
      },
      preview: (x, v) => {
        const q = getPerson(x, pid)
        if (!q) return ''
        const per = q.age < 18 ? `about ${money(Math.round(v / 52))} a week` : `about ${money(Math.round(v / 12))} a month`
        return v > 0 ? `${per} · ${allowanceVerdict(x, q, v)}` : allowanceVerdict(x, q, 0)
      },
    },
    run: (x, q, input) => {
      const n = Number(input)
      if (!Number.isFinite(n)) return
      setAllowance(x, q, n)
    },
  })
}

// ----- Loans -----------------------------------------------------------------------

function repayAction(p: Person): MenuAction {
  const pid = p.id
  return act('repay', pid, {
    label: 'Ask to Be Paid Back',
    emoji: '\u{1F9FE}',
    subtitle: (x) => {
      const q = getPerson(x, pid)
      return q ? `${pr(q).He} owes you ${money(readTies(x, q).owes)}` : ''
    },
    disabledReason: (x) => ((x.yearActions[`wealth.repay.${pid}`] ?? 0) >= 1 ? `You already brought it up with ${p.firstName} this year.` : null),
    run: (g, q) => {
      if (!useYearAction(g, `wealth.repay.${pid}`, 1)) return
      touch(g, q)
      const t = readTies(g, q)
      if (t.owes <= 0) return
      const x = pr(q)
      if (q.money <= 0 || !chance(g, Math.min(0.9, repayOdds(q, t.owes, g) + 0.15))) {
        addRelationship(g, q, -randInt(g, 3, 8))
        notice(g, 'Paying It Back', q.money <= 0 ? `${q.firstName} turned ${x.his} pockets inside out. ${cap(x.he)} really doesn't have it.` : `${q.firstName} said ${x.he}'ll "definitely" pay you back "soon." ${cap(x.he)} changed the subject to the weather. Twice.`, { emoji: '\u{1F9FE}' })
        return
      }
      const pay = Math.max(1, Math.min(t.owes, Math.floor(q.money)))
      moveCash(g, wholePurse(q), askedPurse(g), pay, 'support')
      updateTies(g, q, (w) => {
        w.owes = Math.max(0, w.owes - pay)
        if (w.owes === 0) w.owesSince = 0
      })
      addRelationship(g, q, -randInt(g, 1, 4))
      const left = t.owes - pay
      log(g, `${cap(myOf(q))} paid me back ${money(pay)}.`, 'good')
      notice(g, 'Paying It Back', left > 0 ? `${q.firstName} paid you ${money(pay)}, which is everything ${x.he} has. ${money(left)} to go.` : `${q.firstName} paid back every last cent (${money(pay)}). It was awkward. It was also correct.`, { emoji: '\u{1F4B5}', tone: 'good' })
    },
  })
}

function forgiveAction(p: Person): MenuAction {
  const pid = p.id
  return act('forgive', pid, {
    label: 'Forgive the Loan',
    emoji: '\u{1F54A}\u{FE0F}',
    confirm: (x) => {
      const q = getPerson(x, pid)
      return q ? `Forgive the ${money(readTies(x, q).owes)} ${q.firstName} owes you? You won't see it again.` : null
    },
    run: (g, q) => {
      const owed = readTies(g, q).owes
      if (owed <= 0) return
      touch(g, q)
      updateTies(g, q, (w) => {
        w.owes = 0
        w.owesSince = 0
      })
      // Gratitude and karma grow with what the debt meant to them (in local incomes), so lending
      // pocket change and forgiving it every year isn't a cheap way to buy love or karma.
      const weight = owed / Math.max(1, typicalIncome(g, personCountry(g, q)))
      addRelationship(g, q, Math.max(1, Math.min(20, Math.round(2 + 4 * Math.log10(1 + weight * 20)))))
      const karma = weight >= 0.5 ? 2 : weight >= 0.1 ? 1 : 0
      if (karma > 0) addHidden(g, 'karma', karma)
      log(g, `I forgave the ${money(owed)} ${myOf(q)} owed me.`, 'good')
      notice(g, 'Forgive the Loan', `You told ${q.firstName} to forget the ${money(owed)}. ${cap(pr(q).he)} burst into tears, which was a lot, but nice.`, { emoji: '\u{1F54A}\u{FE0F}', tone: 'good' })
    },
  })
}

function lendAction(g: GameState, p: Person): MenuAction {
  const pid = p.id
  return act('lend', pid, {
    label: 'Lend Money',
    emoji: '\u{1F91D}',
    subtitle: 'To be paid back (maybe)',
    disabledReason: (x) => (x.character.money < 100 ? "You don't have enough cash to lend." : (x.yearActions[`wealth.lend.${pid}`] ?? 0) >= 1 ? 'One loan a year per person. Banks have rules too.' : null),
    input: {
      kind: 'slider',
      money: true,
      label: `Lend ${p.firstName}`,
      min: 100,
      max: Math.max(100, lendMax(g)),
      step: 1,
      defaultValue: (x) => String(Math.max(100, Math.min(lendMax(x), round(lendMax(x) / 10)))),
      preview: (x, v) => cashShare(x, v),
    },
    run: (g, q, input) => {
      const n = Math.round(Number(input))
      const cap0 = lendMax(g)
      if (!Number.isFinite(n) || n <= 0) return
      const amt = Math.min(n, cap0)
      if (amt < 1 || g.character.money < amt) {
        notice(g, 'Lend Money', `You don't have ${money(Math.max(1, n))} in cash to lend.`, { emoji: '\u{1F4B8}' })
        return
      }
      if (!useYearAction(g, `wealth.lend.${pid}`, 1) || !payPersonWhole(g, q, amt, 'support')) return
      touch(g, q)
      updateTies(g, q, (w) => {
        if (w.owes <= 0) w.owesSince = g.year
        w.owes += amt
      })
      count(g, 'wealthLoans')
      // A token loan earns a token thank-you.
      addRelationship(g, q, gratitude(q, amt >= typicalIncome(g, personCountry(g, q)) * 0.05 ? 4 : 1))
      log(g, `I lent ${myOf(q)} ${money(amt)}.`)
      notice(g, 'Lend Money', `You lent ${q.firstName} ${money(amt)}. ${cap(pr(q).he)} promised to pay you back. You both believed it, briefly.`, { emoji: '\u{1F91D}' })
    },
  })
}

/** "12% of your cash" for a slider caption ("under 1%" rather than a misleading 0%). */
export function cashShare(g: GameState, v: number): string {
  const pct = (Math.max(0, v) / Math.max(1, g.character.money)) * 100
  if (pct > 0 && pct < 1) return 'Under 1% of your cash'
  return `${Math.min(100, Math.round(pct))}% of your cash`
}

/** Most you can lend one person at once: your cash, up to a tenth of what you're worth. */
function lendMax(g: GameState): number {
  return Math.max(0, Math.floor(Math.min(Math.max(0, g.character.money), Math.max(1_000, perceivedWealth(g) * 0.1))))
}

// ----- Big gifts --------------------------------------------------------------------

function giftReason(g: GameState, pid: string, key: string, years: number, what: string): string | null {
  const blocked = prisonBlock(g)
  if (blocked) return blocked
  const p = getPerson(g, pid)
  if (!p) return null
  const last = readTies(g, p).marks[key] ?? 0
  if (last > 0 && g.year - last < years) return `You already gave ${p.firstName} ${what} recently.`
  return null
}

function carTypes(g: GameState): CarType[] {
  const t = wealthTier(g)
  return t >= 3 ? ['economy', 'luxury', 'sports', 'supercar'] : t >= 2 ? ['economy', 'luxury', 'sports'] : ['economy', 'luxury']
}

function carAction(p: Person): MenuAction {
  const pid = p.id
  return act('car', pid, {
    label: 'Buy Them a Car',
    emoji: '\u{1F697}',
    subtitle: (x) => {
      const q = getPerson(x, pid)
      return q ? `From ${money(carPrice(x, 'economy', q))}` : ''
    },
    disabledReason: (x) => {
      const q = getPerson(x, pid)
      if (q && readTies(x, q).car) return `${q.firstName} still drives the car you bought ${pr(q).him}.`
      return giftReason(x, pid, 'gift.car', 3, 'a car') ?? (q && x.character.money < carPrice(x, 'economy', q) ? `You can't afford even a sensible car (${money(carPrice(x, 'economy', q))}).` : null)
    },
    run: (g, q) => {
      const choices: ChoiceOption[] = carTypes(g)
        .map((type) => ({ type, price: carPrice(g, type, q) }))
        .filter((c) => c.price <= g.character.money)
        .map((c) => ({ id: c.type, label: `${cap(carLabel(g, c.type))} (${money(c.price)})`, emoji: c.type === 'economy' ? '\u{1F697}' : c.type === 'luxury' ? '\u{1F699}' : '\u{1F3CE}\u{FE0F}' }))
      choices.push({ id: 'cancel', label: 'Never mind', emoji: '\u{1F519}' })
      scriptChoice(g, CAR_SCRIPT, 'Buy Them a Car', `Which car will you buy ${q.firstName}?${isDescendant(q) && q.age < 25 ? ' (Young drivers and fast cars: what could go wrong.)' : ''}`, choices, { emoji: '\u{1F697}', data: { pid }, personId: pid })
    },
  })
}

defineScript(CAR_SCRIPT, (g, choice, data) => {
  const p = pidOf(g, data)
  if (!p || choice === 'cancel' || !g.character.alive) return
  const type = (['economy', 'luxury', 'sports', 'supercar'] as const).find((t) => t === choice)
  if (!type) return
  const price = carPrice(g, type, p)
  const label = carLabel(g, type)
  if (!spend(g, price, 'asset.buy')) {
    notice(g, 'Buy Them a Car', `You don't have ${money(price)} in cash.`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  updateTies(g, p, (t) => {
    t.car = { label, price, year: g.year }
    t.marks['gift.car'] = g.year
    t.given += price
  })
  const fancy = type === 'sports' || type === 'supercar'
  addRelationship(g, p, gratitude(p, fancy ? 18 : type === 'luxury' ? 14 : 10))
  if (isDescendant(p) && p.age < 30) addEntitlement(p, type === 'supercar' ? 15 : type === 'sports' ? 10 : type === 'luxury' ? 6 : 2)
  notePerson(p, `Got ${label} from you at ${p.age}.`)
  log(g, `I bought ${myOf(p)} ${label} (${money(price)}).`, 'good')
  notice(g, 'Buy Them a Car', `You bought ${p.firstName} ${label} for ${money(price)}. ${entitlement(p) >= 60 ? `${cap(pr(p).he)} asked where the bow was.` : isAbroad(g, p) ? `${cap(pr(p).he)} sent you a photo of it from every possible angle.` : `${cap(pr(p).he)} screamed, then cried, then took you for a very slow drive around the block.`}`, { emoji: '\u{1F697}', tone: 'good' })
})

interface TripOption {
  id: string
  label: string
  price: number
}

function tripOptions(g: GameState, p: Person): TripOption[] {
  const country = personCountry(g, p)
  const out: TripOption[] = [{ id: 'weekend', label: 'A weekend getaway', price: round(1_500 * goodsScale(g, country)) }]
  if (flights(g) || g.year >= 1950) out.push({ id: 'abroad', label: flights(g) ? 'A trip abroad' : 'A grand tour abroad by sea', price: round(6_000 * goodsScale(g, country)) })
  if (wealthTier(g) >= 2) out.push({ id: 'luxury', label: 'A luxury vacation, everything first class', price: round(30_000 * luxuryScale(g, country)) })
  return out
}

function tripAction(p: Person): MenuAction {
  const pid = p.id
  return act('trip', pid, {
    label: 'Pay for a Vacation',
    emoji: '\u{1F3D6}\u{FE0F}',
    subtitle: 'Send them on a trip (you stay home)',
    disabledReason: (x) => {
      const q = getPerson(x, pid)
      return giftReason(x, pid, `gift.trip.${x.year}`, 1, 'a trip this year') ?? (q && x.character.money < (tripOptions(x, q)[0]?.price ?? 0) ? "You can't afford a trip right now." : null)
    },
    run: (g, q) => {
      const choices: ChoiceOption[] = tripOptions(g, q)
        .filter((o) => o.price <= g.character.money)
        .map((o) => ({ id: o.id, label: `${o.label} (${money(o.price)})`, emoji: o.id === 'luxury' ? '\u{1F6E5}\u{FE0F}' : o.id === 'abroad' ? '\u{1F30D}' : '\u{1F3D5}\u{FE0F}' }))
      choices.push({ id: 'cancel', label: 'Never mind', emoji: '\u{1F519}' })
      scriptChoice(g, TRIP_SCRIPT, 'Pay for a Vacation', `Where will you send ${q.firstName}?`, choices, { emoji: '\u{1F3D6}\u{FE0F}', data: { pid }, personId: pid })
    },
  })
}

defineScript(TRIP_SCRIPT, (g, choice, data) => {
  const p = pidOf(g, data)
  if (!p || choice === 'cancel' || !g.character.alive) return
  const opt = tripOptions(g, p).find((o) => o.id === choice)
  if (!opt) return
  if (!spend(g, opt.price, 'leisure')) {
    notice(g, 'Pay for a Vacation', `You don't have ${money(opt.price)} in cash.`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  updateTies(g, p, (t) => {
    t.marks[`gift.trip.${g.year}`] = g.year
    for (const k of Object.keys(t.marks)) if (k.startsWith('gift.trip.') && k !== `gift.trip.${g.year}`) delete t.marks[k]
    t.given += opt.price
  })
  addRelationship(g, p, gratitude(p, opt.id === 'luxury' ? 14 : opt.id === 'abroad' ? 10 : 6))
  p.stats.happiness = Math.min(100, p.stats.happiness + randInt(g, 5, 12))
  if (isDescendant(p) && p.age < 30) addEntitlement(p, opt.id === 'luxury' ? 6 : opt.id === 'abroad' ? 2 : 0)
  log(g, `I paid for ${myOf(p)}'s vacation (${money(opt.price)}).`, 'good')
  notice(g, 'Pay for a Vacation', `You sent ${p.firstName} on ${opt.label.toLowerCase()} for ${money(opt.price)}. ${cap(pr(p).he)} came back with a tan and a souvenir for you: ${pickLine(g, ['a fridge magnet', 'a keychain', 'a snow globe', 'a T-shirt that says someone went somewhere'])}.`, { emoji: '\u{1F3D6}\u{FE0F}', tone: 'good' })
})

function housePrices(g: GameState, p: Person): { house: number; deposit: number } {
  const base = wealthTier(g) >= 3 ? 1_200_000 : 450_000
  const house = round(base * housingScale(g, personCountry(g, p)))
  return { house, deposit: round(house * 0.2) }
}

function houseAction(p: Person): MenuAction {
  const pid = p.id
  return act('house', pid, {
    label: isParent(p) && p.age >= 55 ? 'Buy Them a Retirement Home' : 'Help With a House',
    emoji: '\u{1F3E1}',
    subtitle: (x) => {
      const q = getPerson(x, pid)
      if (!q) return ''
      const h = housePrices(x, q)
      return `Deposit ${money(h.deposit)} · The whole house ${money(h.house)}`
    },
    disabledReason: (x) => {
      const q = getPerson(x, pid)
      if (!q) return null
      if ((readTies(x, q).marks['gift.house'] ?? 0) > 0) return `You already helped ${q.firstName} with a house.`
      return prisonBlock(x) ?? (x.character.money < housePrices(x, q).deposit ? `You need at least ${money(housePrices(x, q).deposit)} in cash for a deposit.` : null)
    },
    run: (g, q) => {
      const h = housePrices(g, q)
      const choices = [
        ...(g.character.money >= h.deposit ? [{ id: 'deposit', label: `Pay the deposit (${money(h.deposit)})`, emoji: '\u{1F511}' }] : []),
        ...(g.character.money >= h.house ? [{ id: 'whole', label: `Buy the whole house (${money(h.house)})`, emoji: '\u{1F3E1}' }] : []),
        { id: 'cancel', label: 'Never mind', emoji: '\u{1F519}' },
      ]
      scriptChoice(g, HOUSE_SCRIPT, 'Help With a House', `How much will you help ${q.firstName} with a home of ${pr(q).his} own?`, choices, { emoji: '\u{1F3E1}', data: { pid }, personId: pid })
    },
  })
}

defineScript(HOUSE_SCRIPT, (g, choice, data) => {
  const p = pidOf(g, data)
  if (!p || (choice !== 'deposit' && choice !== 'whole') || !g.character.alive) return
  if ((readTies(g, p).marks['gift.house'] ?? 0) > 0) return
  const h = housePrices(g, p)
  const price = choice === 'whole' ? h.house : h.deposit
  if (!spend(g, price, 'property.buy')) {
    notice(g, 'Help With a House', `You don't have ${money(price)} in cash.`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  updateTies(g, p, (t) => {
    t.marks['gift.house'] = g.year
    t.given += price
  })
  if (!isParent(p)) {
    p.livesWithPlayer = false
    p.data.movedOut = true
  }
  addRelationship(g, p, gratitude(p, choice === 'whole' ? 22 : 12))
  if (isDescendant(p) && p.age < 35) addEntitlement(p, choice === 'whole' ? 8 : 3)
  notePerson(p, choice === 'whole' ? `You bought ${pr(p).him} a house at ${p.age}.` : `You paid the deposit on ${pr(p).his} house at ${p.age}.`)
  log(g, choice === 'whole' ? `I bought ${myOf(p)} a house (${money(price)}).` : `I paid the deposit on ${myOf(p)}'s house (${money(price)}).`, 'good')
  notice(g, 'Help With a House', choice === 'whole' ? `You bought ${p.firstName} a house for ${money(price)}. ${cap(pr(p).he)} gave you the first key and the first leak.` : `You paid the ${money(price)} deposit on ${p.firstName}'s new home. The mortgage is ${pr(p).his}; the housewarming party is yours.`, { emoji: '\u{1F3E1}', tone: 'good' })
})

const IDEAS = [
  '@2008 a gourmet food truck',
  '@-2008 a lunch counter',
  'a bakery',
  'a hair salon',
  '@1980 a fitness studio',
  'a corner shop',
  'a car wash',
  'a landscaping company',
  '@+internet,1997 an online shop',
  '@smartphone an app',
  'a small hotel',
]

function ventureAction(g: GameState, p: Person): MenuAction {
  const pid = p.id
  return act('venture', pid, {
    label: 'Fund Their Business Idea',
    emoji: '\u{1F4A1}',
    subtitle: 'Seed money: they might pay you back',
    hint: (x) => {
      const q = getPerson(x, pid)
      if (!q) return null
      const odds = ventureOdds(q)
      return talentHint(x, 'Business', `${q.firstName}'s odds of making it work: about ${Math.round(odds * 100)}% (and ${Math.round(VENTURE_PARTIAL * 100)}% of getting some money back)`) || null
    },
    disabledReason: (x) => giftReason(x, pid, 'gift.venture', 5, 'seed money') ?? (x.character.money < ventureMin(x) ? `You need at least ${money(ventureMin(x))} in cash.` : null),
    input: {
      kind: 'slider',
      money: true,
      label: `Seed money for ${p.firstName}`,
      min: ventureMin(g),
      max: Math.max(ventureMin(g), ventureMax(g)),
      step: 1,
      defaultValue: (x) => String(Math.max(ventureMin(x), Math.min(ventureMax(x), round(25_000 * goodsScale(x))))),
      preview: (x, v) => `${cashShare(x, v)} · they may pay you back if it works`,
    },
    run: (g, q, input) => {
      const n = Math.round(Number(input))
      const max = ventureMax(g)
      if (!Number.isFinite(n) || n <= 0) return
      const amt = Math.min(n, max)
      if ((readTies(g, q).marks['gift.venture'] ?? 0) > g.year - 5) return
      // The seed money goes into their new company, not their pocket.
      if (amt < 1 || !spend(g, amt, { reason: 'inject', with: 'pool:firms' })) {
        notice(g, 'Seed Money', `You don't have ${money(Math.max(1, n))} in cash.`, { emoji: '\u{1F4B8}' })
        return
      }
      touch(g, q)
      const idea = eraPickPlain(g, IDEAS)
      const a: Ask = { k: 'menu.venture', pid: q.id, title: 'Seed Money', emoji: '\u{1F4A1}', text: '', amt, what: idea, odds: ventureOdds(q), partial: VENTURE_PARTIAL }
      addVenture(g, a, myOf(q).replace(/^my /, 'your '), amt, 'venture', q)
      updateTies(g, q, (t) => {
        t.marks['gift.venture'] = g.year
        t.given += amt
      })
      addRelationship(g, q, gratitude(q, 10))
      notePerson(q, `Started ${idea} with your money at ${q.age}.`)
      log(g, `I gave ${myOf(q)} ${money(amt)} to start ${idea}.`, 'good')
      notice(g, 'Seed Money', `You gave ${q.firstName} ${money(amt)} to start ${idea}. ${cap(pr(q).he)} promised to pay you back "with interest" if it works. You'll know in a few years.`, { emoji: '\u{1F4A1}', tone: 'good' })
    },
  })
}

function ventureMin(g: GameState): number {
  return round(5_000 * goodsScale(g))
}

function ventureMax(g: GameState): number {
  return Math.max(0, Math.floor(Math.min(Math.max(0, g.character.money), Math.max(ventureMin(g), perceivedWealth(g) * 0.05))))
}

function pidOf(g: GameState, data: unknown): Person | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
  const id = (data as Record<string, unknown>).pid
  const p = typeof id === 'string' ? getPerson(g, id) : undefined
  return p && p.alive ? p : undefined
}
