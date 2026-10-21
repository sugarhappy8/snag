// Being rich, felt: once you have real money the people around you notice. Kids want pocket
// money, cars, a house and vacation money; friends and family ask for loans and help. Requests
// scale with your net worth relative to a typical local income in your era (wealth-core
// wealthTier), arrive a few times a year at most (small ones bundled into one popup), and how you
// answer shapes relationships, karma and how spoiled your kids turn out.
//
// The yearly hook (aging.ts YEARLY_HOOKS, after finance) also pays the allowances you set, collects
// loan repayments (or notices who's avoiding you), settles the businesses and tips you funded, and
// lets gifted cars meet their fate. Ordinary families see none of it: tier 0 has no requests, and
// the rest only runs for allowances, loans or investments the player set up themselves.
//
// Modules: wealth-core (model, prices, per-person ties), wealth-ask (request shape), wealth-kids /
// wealth-family / wealth-world (the catalog), wealth-resolve (popups and answers), wealth-menu
// (the Money section of a person's sheet).
import { addMoney, addRelationship, log, notice, scriptChoice } from '../core'
import { notePerson } from '../people'
import { chance, rand, randFloat, randInt, weightedPick } from '../rng'
import { askDefs } from './wealth-catalog'
import { ADULT_SCRIPT, presentAsk, presentBundle } from './wealth-resolve'
import type { Ask, AskDef } from './wealth-ask'
import { isEstranged } from './will-core'
import {
  SUCCESS_RETURN,
  PARTIAL_RETURN,
  TIER_POPUP_CAP,
  TIER_RATE,
  WEALTH_POPUP_CAP,
  addEntitlement,
  allowanceNorm,
  cap,
  entitlement,
  isDescendant,
  money,
  myOf,
  readPending,
  readTies,
  repayOdds,
  upbringing,
  updateTies,
  wealthTier,
  writePending,
  type Pending,
} from './wealth-core'
import type { GameState, Json, Person } from '../types'

export { wealthTier, typicalIncome, wealthRatio, tierName } from './wealth-core'

/** Yearly hook: allowances, loans, investments, kids growing up, then this year's money requests. */
export function yearlyWealth(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  settleTheDead(g)
  payAllowances(g)
  collectLoans(g)
  settleVentures(g)
  kidsYear(g)
  if (c.age < 18) return
  const tier = wealthTier(g)
  let budget = popupBudget(g, tier)
  budget -= askAboutGrownKids(g)
  if (tier >= 1 && budget > 0) queueRequests(g, tier, budget)
}

/** Most request popups this year: by tier, never more than WEALTH_POPUP_CAP, one letter in prison. */
export function popupBudget(g: GameState, tier: number): number {
  if (tier <= 0) return 0
  const cap0 = Math.min(WEALTH_POPUP_CAP, TIER_POPUP_CAP[Math.min(tier, TIER_POPUP_CAP.length - 1)] ?? WEALTH_POPUP_CAP)
  return g.character.prison ? Math.min(1, cap0) : cap0
}

// ---------------------------------------------------------------------------
// Bookkeeping

/** Allowances and loans die with the person (loans are written off once, with a log line). */
function settleTheDead(g: GameState): void {
  for (const p of g.people) {
    if (p.alive) continue
    const t = readTies(g, p)
    if (t.allowance <= 0 && t.owes <= 0) continue
    if (t.owes > 0) log(g, `The ${money(t.owes)} I lent ${myOf(p)} died with ${p.gender === 'male' ? 'him' : 'her'}.`)
    updateTies(g, p, (x) => {
      x.allowance = 0
      x.owes = 0
      x.owesSince = 0
    })
  }
}

/** This year's upkeep and mortgage payments still to come (the assets hook runs after this one). */
function billsDue(g: GameState): number {
  return g.assets.reduce((sum, a) => sum + Math.max(0, a.upkeep || 0) + Math.max(0, a.mortgage?.yearlyPayment ?? 0), 0)
}

/**
 * Pay every allowance the player set, as long as the cash covers it and the bills still due this
 * year (an allowance never pushes you into debt); missing two years in a row stops it.
 */
function payAllowances(g: GameState): void {
  let paid = 0
  let count = 0
  const reserve = billsDue(g)
  for (const p of g.people) {
    if (!p.alive || p.relation === 'pet') continue
    const t = readTies(g, p)
    if (t.allowance <= 0) continue
    const estranged = isEstranged(g, p)
    if (p.data.disowned === true || estranged) {
      updateTies(g, p, (x) => {
        x.allowance = 0
      })
      log(g, estranged ? `I stopped ${myOf(p)}'s allowance after we became estranged.` : `I stopped ${myOf(p)}'s allowance after disowning ${p.gender === 'male' ? 'him' : 'her'}.`)
      continue
    }
    const amt = t.allowance
    if (g.character.money - amt >= reserve) {
      addMoney(g, -amt)
      p.money = Math.round(p.money + amt)
      paid += amt
      count += 1
      const norm = allowanceNorm(g, p)
      updateTies(g, p, (x) => {
        x.given += amt
        x.missed = 0
      })
      if (amt >= norm * 0.8 && chance(g, 0.5)) addRelationship(p, 1)
      if (isDescendant(p) && p.age < 30) {
        const ratio = amt / Math.max(1, norm)
        if (ratio > 2) addEntitlement(p, Math.min(6, Math.round(Math.log2(ratio) * 1.5)))
        else if (ratio <= 1.2) addEntitlement(p, -1)
      }
    } else {
      addRelationship(p, -randInt(g, 2, 5))
      const missed = t.missed + 1
      updateTies(g, p, (x) => {
        x.missed = missed
        if (missed >= 2) x.allowance = 0
      })
      log(g, missed >= 2 ? `I couldn't afford ${myOf(p)}'s allowance again, so I stopped it.` : `I couldn't afford ${myOf(p)}'s allowance this year.`, 'bad')
    }
  }
  if (count > 0) log(g, count === 1 ? `I paid ${money(paid)} in allowance this year.` : `I paid ${money(paid)} in allowances and support to ${count} people this year.`)
}

/** People who owe you sometimes pay some back, and sometimes start avoiding you. */
function collectLoans(g: GameState): void {
  for (const p of g.people) {
    if (!p.alive) continue
    const t = readTies(g, p)
    if (t.owes <= 0) continue
    const years = Math.max(0, g.year - (t.owesSince || g.year))
    if (p.money > 0 && chance(g, repayOdds(p, t.owes))) {
      const want = Math.max(Math.min(t.owes, 100), Math.round(t.owes * randFloat(g, 0.3, 1)))
      const pay = Math.max(0, Math.min(t.owes, Math.floor(p.money), want))
      if (pay <= 0) continue
      p.money = Math.round(p.money - pay)
      addMoney(g, pay)
      updateTies(g, p, (x) => {
        x.owes = Math.max(0, x.owes - pay)
        if (x.owes === 0) x.owesSince = 0
      })
      addRelationship(p, 2)
      const left = t.owes - pay
      log(g, left > 0 ? `${cap(myOf(p))} paid back ${money(pay)} of what ${p.gender === 'male' ? 'he' : 'she'} owes me (${money(left)} to go).` : `${cap(myOf(p))} paid back the last ${money(pay)} ${p.gender === 'male' ? 'he' : 'she'} owed me!`, 'good')
    } else if (chance(g, Math.min(0.5, 0.1 + years * 0.04))) {
      addRelationship(p, -randInt(g, 1, 4))
      // The last mark is read before this year's is written: the line comes once in five years.
      const said = t.marks.avoid
      updateTies(g, p, (x) => {
        x.marks.avoid = g.year
      })
      if (said === undefined || g.year - said >= 5) log(g, `${cap(myOf(p))} has been avoiding me ever since I lent ${p.gender === 'male' ? 'him' : 'her'} money.`)
    }
  }
}

/** Businesses and tips you funded pay out (sometimes), on average for less than you put in. */
function settleVentures(g: GameState): void {
  const list = readPending(g)
  if (!list.length) return
  const keep: Pending[] = []
  for (const x of list) {
    if (x.by !== g.character.id) continue
    if (g.year < x.due) {
      keep.push(x)
      continue
    }
    const p = x.pid ? g.people.find((q) => q.id === x.pid) : undefined
    const r = rand(g)
    const who = p ? myOf(p) : x.name.replace(/^your /, 'my ')
    if (r < x.odds) {
      const back = Math.round(x.amt * SUCCESS_RETURN)
      addMoney(g, back)
      if (p && p.alive) {
        // They keep a stake in what they built; with your 1.25x the family still ends up with less
        // than it put in on average (odds are at most 0.5), so funding kids is never a money machine.
        p.money = Math.round(p.money + x.amt * 0.4)
        // A royal appointment is their title: the court keeps it (syncRoyalAppointment), and a
        // reload would put it straight back.
        if (p.age < 65 && x.kind === 'venture' && !p.data.royalAppointment) p.occupation = 'Business Owner'
        addRelationship(p, randInt(g, 4, 8))
        notePerson(p, `Made ${x.what} a success with your money.`)
      }
      log(g, `${cap(x.what)} took off! ${cap(who)} paid me back ${money(back)}.`, 'good')
      notice(g, 'It Worked!', `${cap(x.what)}, the one ${p ? `${p.firstName}` : x.name.replace(/^your /, 'your ')} talked you into, actually worked. You got ${money(back)} back on your ${money(x.amt)}. Nobody is more surprised than you.`, { emoji: '\u{1F389}', tone: 'good' })
    } else if (r < x.odds + x.partial) {
      const back = Math.round(x.amt * PARTIAL_RETURN)
      addMoney(g, back)
      log(g, `${cap(x.what)} fizzled. ${cap(who)} paid me back ${money(back)} of the ${money(x.amt)} I put in.`)
    } else {
      if (p && p.alive) addRelationship(p, -randInt(g, 0, 3))
      log(g, `${cap(x.what)} went under. The ${money(x.amt)} I put in went with it.`, 'bad')
    }
  }
  writePending(g, keep)
}

/**
 * Spoiled kids coast, fairly raised kids thrive, and gifted cars meet their fate. Growing up rich
 * spoils a kid a little every year on its own (the house, the trips, the friends' houses), unless
 * you've been saying no often enough to count as fair or strict.
 */
function kidsYear(g: GameState): void {
  const tier = g.character.age >= 18 ? wealthTier(g) : 0
  for (const p of g.people) {
    if (!p.alive || !isDescendant(p)) continue
    const e = entitlement(p)
    if (e > 0 && p.age >= 23 && chance(g, 0.5)) addEntitlement(p, -1)
    if (p.age < 25) {
      const how = upbringing(g, p)
      if (tier >= 2 && p.age >= 4 && p.age < 18 && how !== 'fair' && how !== 'strict') addEntitlement(p, tier >= 3 ? 2 : 1)
      if (how === 'spoiled' && chance(g, 0.5)) p.stats.smarts = Math.max(0, p.stats.smarts - 1)
      if (how === 'fair' && chance(g, 0.35)) {
        p.stats.smarts = Math.min(100, p.stats.smarts + 1)
        addRelationship(p, 1)
      }
    }
    const t = readTies(g, p)
    if (t.car && p.age < 35) {
      const fast = /sport|super|roadster|convertible/.test(t.car.label)
      const odds = 0.025 + (fast ? 0.03 : 0) + (p.age < 21 ? 0.03 : 0) + e / 1000
      if (chance(g, odds)) {
        const car = t.car.label
        updateTies(g, p, (x) => {
          x.car = null
          x.marks.crash = g.year
        })
        p.stats.health = Math.max(1, p.stats.health - randInt(g, 2, 10))
        notePerson(p, `Wrecked ${car.replace(/^an? /, 'the ')} you gave ${p.gender === 'male' ? 'him' : 'her'} at ${p.age}.`)
        log(g, `${cap(myOf(p))} wrecked ${car.replace(/^an? /, 'the ')} I bought ${p.gender === 'male' ? 'him' : 'her'}. ${p.gender === 'male' ? 'He' : 'She'} walked away with a bruise and an excuse.`, 'bad')
      }
    }
  }
}

/** Kids who turn 18 while on an allowance: keep paying or cut them off (one popup for all of them). */
function askAboutGrownKids(g: GameState): number {
  const grown = g.people.filter((p) => p.alive && isDescendant(p) && p.age >= 18 && !readTies(g, p).adultOk && readTies(g, p).allowance > 0)
  if (!grown.length) return 0
  const names = grown.map((p) => p.firstName).join(' and ')
  const total = grown.reduce((s, p) => s + readTies(g, p).allowance, 0)
  scriptChoice(
    g,
    ADULT_SCRIPT,
    'All Grown Up',
    `${names} ${grown.length > 1 ? 'are adults now' : 'is an adult now'}, and still on ${grown.length > 1 ? 'their' : grown[0].gender === 'male' ? 'his' : 'her'} ${money(total)}-a-year allowance. Keep paying, or is it time to fly?`,
    [
      { id: 'keep', label: 'Keep supporting them', emoji: '\u{1F49D}' },
      { id: 'stop', label: 'Stop the allowance', emoji: '\u{1F54A}\u{FE0F}' },
    ],
    { emoji: '\u{1F393}', data: { pids: grown.map((p) => p.id) }, personId: grown.length === 1 ? grown[0].id : undefined },
  )
  return 1
}

// ---------------------------------------------------------------------------
// Requests

interface Candidate {
  def: AskDef
  p?: Person
  w: number
}

const CD_KEY = 'wealth.cd'

function globalCooldowns(g: GameState): Record<string, number> {
  const raw = g.flags[CD_KEY]
  const out: Record<string, number> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  return out
}

function stampGlobal(g: GameState, id: string): void {
  const cd = globalCooldowns(g)
  cd[id] = g.year
  g.flags[CD_KEY] = cd as Record<string, Json>
}

/** Everyone who might ask this year, with how likely they are to be the one who does. */
export function requestCandidates(g: GameState, tier: number): Candidate[] {
  const prison = !!g.character.prison
  const cds = globalCooldowns(g)
  const out: Candidate[] = []
  for (const def of askDefs()) {
    if (def.minTier > tier) continue
    if (prison && !def.prison) continue
    if (def.people) {
      for (const p of def.people(g)) {
        const last = readTies(g, p).marks[`ask.${def.id}`] ?? 0
        if (last > 0 && g.year - last < def.cooldown) continue
        if (def.when && !def.when(g, tier, p)) continue
        // Kids and young adults ask far more often than anyone else; estranged people rarely do.
        const w = def.weight(g, tier, p) * (p.relationship < 15 ? 0.3 : 1) * (isDescendant(p) ? (p.age < 18 ? 3 : p.age < 25 ? 2 : 1) : 1)
        if (w > 0 && Number.isFinite(w)) out.push({ def, p, w })
      }
    } else {
      const last = cds[def.id] ?? 0
      if (last > 0 && g.year - last < def.cooldown) continue
      if (def.when && !def.when(g, tier)) continue
      const w = def.weight(g, tier)
      if (w > 0 && Number.isFinite(w)) out.push({ def, w })
    }
  }
  return out
}

/** Pick this year's asks (a few at most, one person and one kind of ask once) and queue the popups. */
function queueRequests(g: GameState, tier: number, budget: number): void {
  const rate = (TIER_RATE[Math.min(tier, TIER_RATE.length - 1)] ?? 0) * (g.character.prison ? 0.25 : 1)
  const n = Math.min(budget, Math.floor(rate) + (chance(g, rate - Math.floor(rate)) ? 1 : 0))
  if (n <= 0) return
  const pool = requestCandidates(g, tier)
  const big: Ask[] = []
  const small: Ask[] = []
  const people = new Set<string>()
  const kinds = new Set<string>()
  for (let guard = 0; pool.length > 0 && big.length + (small.length ? 1 : 0) < n && guard < 24; guard++) {
    const c = weightedPick(g, pool, (x) => x.w)
    pool.splice(pool.indexOf(c), 1)
    if (kinds.has(c.def.id) || (c.p && people.has(c.p.id))) continue
    const a = c.def.build(g, tier, c.p)
    if (!a || !Number.isFinite(a.amt) || a.amt < 0) continue
    kinds.add(c.def.id)
    if (c.p) {
      people.add(c.p.id)
      updateTies(g, c.p, (t) => {
        t.marks[`ask.${c.def.id}`] = g.year
      })
    } else stampGlobal(g, c.def.id)
    if (a.small && small.length < 4) small.push(a)
    else big.push(a)
  }
  for (const a of big) presentAsk(g, a)
  if (small.length === 1) presentAsk(g, small[0])
  else if (small.length > 1) presentBundle(g, small)
}
