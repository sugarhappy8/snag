// Workshop events: knockoffs, recalls, viral moments, buyout offers, patent trolls, the
// Inventor of the Year award, the school science fair and a rival inventor. Owner-scoped and
// once each (per invention or per life); at most one popup a year. Odds shown in purple hints
// are the exact probabilities the handlers roll against.
import { firmCash } from '../cash'
import { addHidden, addMoney, addStat, earnIncome, formatMoney, log, notice, remember as rememberLife, scriptChoice, spend } from '../core'
import { goodsMult } from '../assets'
import { hasTech } from '../history/timeline'
import { rand } from '../rng'
import { defineScript } from '../scripts'
import { addFame } from '../special/common'
import { talentHint } from '../talents'
import type { GameState, Json } from '../types'
import { randomFirstName, randomLastName } from '../world'
import { bizOf, businessAssets } from '../business/state'
import { effectiveSkill } from './build'
import { trueAppeal, patentActive, patentLaw, streamValue, invCurve, personalPerUnit } from './market'
import { addRep, findInvention, inventions, isGenius, mutWorkshop, storeInv, type Owned } from './notebook'
import { rec, text, type Workshop } from './state'

const pct = (x: number) => `${Math.round(x * 100)}%`
const personal = (o: Owned) => o.inv.route === 'license' || o.inv.route === 'pitch' || o.inv.route === 'crowd'
const markDone = (g: GameState, o: Owned, key: string, ws: Workshop) => {
  o.inv.done = [...o.inv.done, key].slice(-40)
  storeInv(g, o.a, o.inv, ws.rep)
}

// ---------------------------------------------------------------------------
// Pure odds (shared by hints and handlers)

export function sueOdds(o: Owned, year: number): number {
  const p = o.inv.patent
  if (!patentActive(p, year)) return 0.1
  return Math.round((p!.scope === 'world' ? 0.75 : 0.6) * patentLaw(p!.country, year).enforcement * 100) / 100
}
export function knockoffChance(o: Owned, year: number): number {
  return !o.inv.patent ? 0.3 : !patentActive(o.inv.patent, year) ? 0.2 : o.inv.patent.scope === 'world' ? 0.04 : 0.08
}
export const TROLL_WIN = 0.65
export const HUSH_SCANDAL = 0.5
export function duelOdds(g: GameState, ws: Workshop, rivalSkill: number): number {
  return Math.round(Math.max(0.1, Math.min(0.9, 0.5 + (effectiveSkill(g, ws) - rivalSkill) / 60 + (isGenius(g) ? 0.1 : 0))) * 100) / 100
}
/** Science fair: score = best idea quality + skill/2 + smarts/3 + U[0,30]; first prize at 110+. */
export function fairBase(g: GameState, ws: Workshop): number {
  const best = Math.max(0, ...ws.ideas.map((i) => i.q), ...inventions(g).map((o) => o.inv.q))
  return best + effectiveSkill(g, ws) / 2 + g.character.stats.smarts / 3
}
export function fairOdds(g: GameState, ws: Workshop): number {
  return Math.round(Math.max(0, Math.min(1, (fairBase(g, ws) + 30 - 110) / 30)) * 100) / 100
}

/** School science fairs: from 1930 (when they caught on), for kids still at school. Pure. */
export function fairOpen(g: GameState): boolean {
  const level = g.character.education.current?.level
  return g.year >= 1930 && g.character.age >= 8 && g.character.age <= 17 && (level === 'elementary' || level === 'middle' || level === 'high')
}

// ---------------------------------------------------------------------------
// The yearly roll (from the yearly hook; at most one popup)

export function yearlyWorkshopEvent(g: GameState, ws: Workshop): boolean {
  const age = g.character.age
  const year = g.year
  const owned = inventions(g).filter((o) => o.inv.stage === 'launched' && o.inv.launched < year)
  // Science fair (ages 8-17 at school, from 1930, once).
  if (fairOpen(g) && ws.events.fair === undefined && (ws.ideas.length > 0 || owned.length > 0) && rand(g) < 0.35) {
    ws.events.fair = year
    const hint = talentHint(g, 'Inventor', `${pct(fairOdds(g, ws))} chance of first prize`)
    scriptChoice(g, FAIR, '\u{1F52C} Science Fair', 'The school science fair is next week. Want to show off your best invention?', [
      { id: 'enter', label: 'Enter it!', emoji: '\u{1F3C6}', ...(hint ? { hint } : {}) },
      { id: 'skip', label: 'Skip it', emoji: '\u{1F645}' },
    ], { emoji: '\u{1F52C}' })
    return true
  }
  for (const o of owned) {
    const t = year - o.inv.launched
    const done = new Set(o.inv.done)
    // Knockoff.
    if (!done.has('knockoff') && t >= 1 && o.inv.route !== 'open' && rand(g) < knockoffChance(o, year)) {
      markDone(g, o, 'knockoff', ws)
      if (o.inv.route === 'company') {
        o.inv.hit = Math.round(o.inv.hit * 0.85 * 100) / 100
        storeInv(g, o.a, o.inv, ws.rep)
        log(g, `Copycats started selling knockoffs of my ${o.def.name}. ${o.inv.maker}'s lawyers are on it.`, 'bad')
        return false
      }
      const cost = suitCost(o)
      const hint = talentHint(g, 'Inventor', `${pct(sueOdds(o, year))} chance to win`)
      scriptChoice(g, KNOCKOFF, '\u{1F977} Knockoffs!', `Cheap copies of your ${o.def.name} are popping up everywhere, sold by a shady outfit called Copycat Kings Ltd.`, [
        { id: 'sue', label: `Sue them (${formatMoney(cost)})`, emoji: '\u{2696}\u{FE0F}', ...(hint ? { hint } : {}) },
        { id: 'license', label: 'License them a cut', emoji: '\u{1F91D}' },
        { id: 'ignore', label: 'Ignore it', emoji: '\u{1F937}' },
      ], { emoji: '\u{1F977}', data: { id: o.a.id, year, cost } as unknown as Json })
      return true
    }
    // Recall (low-quality launches).
    if (!done.has('recall') && t >= 1 && o.inv.q < 50 && o.inv.route !== 'open' && rand(g) < 0.15) {
      markDone(g, o, 'recall', ws)
      const cost = recallCost(o)
      const hint = talentHint(g, 'Inventor', `Keeping quiet: ${pct(HUSH_SCANDAL)} chance of a scandal`)
      scriptChoice(g, RECALL, '\u{1F6A8} Uh-Oh', `Some ${o.def.name}s are falling apart. A few customers got pinched, and the photos are not flattering.`, [
        { id: 'recall', label: cost ? `Recall them (${formatMoney(cost)})` : 'Recall them', emoji: '\u{1F4E2}' },
        { id: 'hush', label: 'Keep quiet', emoji: '\u{1F648}', ...(hint ? { hint } : {}) },
      ], { emoji: '\u{1F6A8}', data: { id: o.a.id, year, cost } as unknown as Json })
      return true
    }
    // Patent troll.
    if (!done.has('troll') && personal(o) && patentActive(o.inv.patent, year) && o.inv.lastIncome >= 10_000 && rand(g) < 0.05) {
      markDone(g, o, 'troll', ws)
      const pay = Math.max(5_000, Math.round(o.inv.lastIncome * 0.25))
      const fight = Math.max(3_000, Math.round(o.inv.lastIncome * 0.1))
      const hint = talentHint(g, 'Inventor', `${pct(TROLL_WIN)} chance to win`)
      scriptChoice(g, TROLL, '\u{1F9CC} Patent Troll', `Vaguely Broad Patents ${year >= 1990 ? 'LLC' : '& Co.'} claims they patented "a thing that does stuff" years ago, which apparently covers your ${o.def.name}.`, [
        { id: 'pay', label: `Pay them off (${formatMoney(pay)})`, emoji: '\u{1F4B5}' },
        { id: 'fight', label: `Fight in court (${formatMoney(fight)})`, emoji: '\u{2696}\u{FE0F}', ...(hint ? { hint } : {}) },
      ], { emoji: '\u{1F9CC}', data: { id: o.a.id, year, pay, fight } as unknown as Json })
      return true
    }
    // Buyout offer for the royalty stream.
    if (!done.has('buyout') && personal(o) && o.a.value >= 20_000 && rand(g) < 0.06) {
      markDone(g, o, 'buyout', ws)
      const offer = Math.round((o.a.value * (0.9 + 0.5 * rand(g))) / 100) * 100
      const keep = streamValue(invCurve(o.inv), year - o.inv.launched, personalPerUnit(o.inv), o.inv.peak * o.inv.hit)
      const hint = talentHint(g, 'Inventor', `Keeping it should bring ~${formatMoney(keep)} over the years`)
      scriptChoice(g, BUYOUT, '\u{1F4BC} A Buyout Offer', `${year >= 1990 ? 'A royalty fund' : 'A syndicate of investors'} offers ${formatMoney(offer)} for your remaining share of the ${o.def.name}.`, [
        { id: 'sell', label: `Take ${formatMoney(offer)}`, emoji: '\u{1F4B0}', ...(hint ? { hint } : {}) },
        { id: 'keep', label: 'Keep my royalties', emoji: '\u{1F645}' },
      ], { emoji: '\u{1F4BC}', data: { id: o.a.id, year, offer } as unknown as Json })
      return true
    }
    // Viral moment (a notice; still this year's one event).
    if (!done.has('viral') && t <= 4 && o.inv.route !== 'open' && rand(g) < (trueAppeal(g, o.def) >= 4 ? 0.1 : 0.06)) {
      o.inv.done = [...o.inv.done, 'viral']
      o.inv.boost = year
      storeInv(g, o.a, o.inv, ws.rep)
      addFame(g, 3)
      const how = hasTech(g, 'internet')
        ? `A clip of someone using your ${o.def.name} went viral.`
        : `A famous ${year >= 1915 ? 'movie' : 'stage'} star was photographed with your ${o.def.name}.`
      notice(g, '\u{1F525} Everybody Wants One', `${how} Sales should double this year.`, { emoji: '\u{1F525}', tone: 'good' })
      log(g, `My ${o.def.name} became the must-have thing of the year.`, 'good')
      return true
    }
  }
  // Inventor of the Year (once).
  if (ws.events.award === undefined && ws.rep >= 55 && (owned.length > 0 || ws.launches >= 3) && rand(g) < 0.2) {
    ws.events.award = year
    const prize = Math.round(25_000 * goodsMult(g))
    earnIncome(g, prize, 'prize')
    ws.earned += prize
    addFame(g, 8)
    addRep(ws, 8)
    addStat(g, 'happiness', 10)
    rememberLife(g, 'Named Inventor of the Year.')
    notice(g, '\u{1F3C5} Inventor of the Year', `You were named Inventor of the Year! You gave a speech, cried a little and took home ${formatMoney(prize)}.`, { emoji: '\u{1F3C5}', tone: 'good' })
    log(g, 'I was named Inventor of the Year.', 'good')
    return true
  }
  // A rival inventor (once, adults with some skill).
  if (ws.events.rival === undefined && age >= 16 && ws.skill >= 25 && rand(g) < 0.06) {
    ws.events.rival = year
    const gender = rand(g) < 0.5 ? 'female' : 'male'
    const name = `${randomFirstName(g, g.character.countryId, gender)} ${randomLastName(g, g.character.countryId)}`
    const rivalSkill = Math.round(Math.max(20, Math.min(95, ws.skill + (rand(g) - 0.4) * 30)))
    const hint = talentHint(g, 'Inventor', `${pct(duelOdds(g, ws, rivalSkill))} chance to win`)
    scriptChoice(g, RIVAL, '\u{1F93A} A Rival Inventor', `${name}, a smug inventor from across town, says your ideas are "cute" and challenges you to a duel of gadgets at the county fair.`, [
      { id: 'duel', label: 'Accept the duel', emoji: '\u{1F93A}', ...(hint ? { hint } : {}) },
      { id: 'team', label: 'Suggest teaming up', emoji: '\u{1F91D}' },
      { id: 'ignore', label: 'Roll your eyes', emoji: '\u{1F644}' },
    ], { emoji: '\u{1F93A}', data: { name, rivalSkill, year } as unknown as Json })
    return true
  }
  return false
}

function suitCost(o: Owned): number {
  return Math.max(3_000, Math.round(o.inv.lastUnits * o.inv.price * 0.03))
}
function recallCost(o: Owned): number {
  return o.inv.route === 'crowd' || o.inv.route === 'company' ? Math.max(1_000, Math.round(o.inv.lastUnits * o.inv.price * 0.15)) : 0
}

// ---------------------------------------------------------------------------
// Handlers (re-check that the invention is still yours; popups can be stale)

function live(g: GameState, data: Json | undefined): { o: Owned; d: Record<string, Json> } | null {
  const d = rec(data)
  const o = findInvention(g, text(d.id))
  return o && o.inv.stage === 'launched' ? { o, d } : null
}
const num = (v: Json | undefined, max = 1e12) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0)

const KNOCKOFF = defineScript('workshop.knockoff', (g, choice, data) => {
  const x = live(g, data)
  if (!x) return
  const ws = mutWorkshop(g)
  const { o, d } = x
  const cost = num(d.cost)
  if (choice === 'sue' && !spend(g, cost, 'legal')) notice(g, 'No Lawyer', "You couldn't afford a lawyer, so the knockoffs carried on.", { emoji: '\u{1F937}' })
  else if (choice === 'sue') {
    const p = sueOdds(o, g.year)
    if (rand(g) < p) {
      const damages = Math.round(Math.max(o.inv.lastIncome, cost) * 1.5)
      earnIncome(g, damages, 'legal')
      ws.earned += damages
      addRep(ws, 3)
      notice(g, '\u{2696}\u{FE0F} You Won!', `The judge sided with you. Copycat Kings Ltd. paid ${formatMoney(damages)} in damages and shut down.`, { emoji: '\u{2696}\u{FE0F}', tone: 'good' })
      log(g, `I won my lawsuit against the ${o.def.name} knockoffs.`, 'good')
    } else {
      o.inv.hit = Math.round(o.inv.hit * 0.65 * 100) / 100
      storeInv(g, o.a, o.inv, ws.rep)
      notice(g, '\u{2696}\u{FE0F} You Lost', 'The court said your idea was "too obvious to protect." The knockoffs are here to stay.', { emoji: '\u{2696}\u{FE0F}', tone: 'bad' })
      log(g, `I lost my lawsuit against the ${o.def.name} knockoffs.`, 'bad')
    }
    return
  }
  if (choice === 'license') {
    o.inv.hit = Math.round(o.inv.hit * 0.85 * 100) / 100
    o.inv.rate = Math.round((o.inv.rate + 0.01) * 10_000) / 10_000
    storeInv(g, o.a, o.inv, ws.rep)
    log(g, `I let the ${o.def.name} copycats pay me a cut. If you can't beat them...`)
    return
  }
  o.inv.hit = Math.round(o.inv.hit * 0.7 * 100) / 100
  storeInv(g, o.a, o.inv, ws.rep)
  log(g, `Knockoffs of my ${o.def.name} are eating into sales.`, 'bad')
})

const RECALL = defineScript('workshop.recall', (g, choice, data) => {
  const x = live(g, data)
  if (!x) return
  const ws = mutWorkshop(g)
  const { o, d } = x
  if (choice === 'recall') {
    const cost = num(d.cost)
    if (o.inv.route === 'company') {
      const company = businessAssets(g).find((a) => a.id === o.inv.company)
      if (company) {
        const b = bizOf(g, company)
        firmCash(g, b, -cost, 'purchase', company.id)
        b.yearCosts += cost
      }
    } else if (cost > 0) addMoney(g, -cost, 'purchase')
    addRep(ws, -3)
    o.inv.hit = Math.round(o.inv.hit * 0.85 * 100) / 100
    storeInv(g, o.a, o.inv, ws.rep)
    notice(g, '\u{1F4E2} Recalled', `You recalled the faulty ${o.def.name}s${cost ? ` for ${formatMoney(cost)}` : ''}. Customers respected the honesty.`, { emoji: '\u{1F4E2}' })
    log(g, `I recalled the faulty ${o.def.name}s.`)
    return
  }
  if (rand(g) < HUSH_SCANDAL) {
    addRep(ws, -20)
    addHidden(g, 'karma', -5)
    o.inv.hit = Math.round(o.inv.hit * 0.4 * 100) / 100
    storeInv(g, o.a, o.inv, ws.rep)
    notice(g, '\u{1F4F0} Scandal!', `The newspapers found out you hushed up the faulty ${o.def.name}s. Sales crashed.`, { emoji: '\u{1F4F0}', tone: 'bad' })
    log(g, `The cover-up of my faulty ${o.def.name} blew up in my face.`, 'bad')
  } else log(g, `Nobody noticed the faulty ${o.def.name}s. Phew.`)
})

const TROLL = defineScript('workshop.troll', (g, choice, data) => {
  const x = live(g, data)
  if (!x) return
  const ws = mutWorkshop(g)
  const { o, d } = x
  const pay = num(d.pay)
  const fight = num(d.fight)
  const payUp = (amount: number) => {
    if (spend(g, amount, 'legal')) return true
    o.inv.hit = Math.round(o.inv.hit * 0.5 * 100) / 100
    storeInv(g, o.a, o.inv, ws.rep)
    notice(g, 'Injunction', `You couldn't pay, so a court froze half the ${o.def.name} sales.`, { emoji: '\u{1F9CC}', tone: 'bad' })
    return false
  }
  if (choice === 'fight') {
    if (!payUp(fight)) return
    if (rand(g) < TROLL_WIN) {
      addRep(ws, 3)
      notice(g, '\u{2696}\u{FE0F} Troll Slain', 'The judge laughed the troll out of court. You framed the ruling.', { emoji: '\u{2696}\u{FE0F}', tone: 'good' })
      log(g, 'I beat a patent troll in court.', 'good')
    } else if (payUp(pay * 2)) {
      notice(g, '\u{2696}\u{FE0F} Troll Wins', `Somehow the troll won. You paid ${formatMoney(pay * 2)}.`, { emoji: '\u{1F9CC}', tone: 'bad' })
      log(g, 'A patent troll beat me in court.', 'bad')
    }
    return
  }
  if (payUp(pay)) log(g, `I paid a patent troll ${formatMoney(pay)} to go away.`)
})

const BUYOUT = defineScript('workshop.buyout', (g, choice, data) => {
  const x = live(g, data)
  if (!x || choice !== 'sell' || rec(data).year !== g.year) return
  const ws = mutWorkshop(g)
  const { o, d } = x
  const offer = num(d.offer)
  earnIncome(g, offer, 'royalty')
  ws.earned += offer
  g.assets = g.assets.filter((a) => a.id !== o.a.id)
  notice(g, '\u{1F4BC} Sold', `You sold your share of the ${o.def.name} for ${formatMoney(offer)}.`, { emoji: '\u{1F4B0}', tone: 'good' })
  log(g, `I sold my royalties on the ${o.def.name} for ${formatMoney(offer)}.`, 'good')
})

const FAIR = defineScript('workshop.fair', (g, choice) => {
  if (choice !== 'enter' || !g.character.alive) return
  const ws = mutWorkshop(g)
  const score = fairBase(g, ws) + rand(g) * 30
  if (score >= 110) {
    const prize = Math.round(250 * goodsMult(g))
    earnIncome(g, prize, 'prize')
    addRep(ws, 6)
    addStat(g, 'happiness', 8)
    addStat(g, 'smarts', 2)
    rememberLife(g, 'Won first prize at the science fair.')
    notice(g, '\u{1F947} First Prize!', `The judges loved it. You won the science fair and ${formatMoney(prize)}!`, { emoji: '\u{1F947}', tone: 'good' })
    log(g, 'I won first prize at the science fair.', 'good')
  } else if (score >= 80) {
    addRep(ws, 3)
    addStat(g, 'happiness', 4)
    notice(g, '\u{1F948} Second Place', 'Second place! You lost to a volcano made of baking soda. Again.', { emoji: '\u{1F948}' })
    log(g, 'I came second at the science fair.')
  } else {
    addStat(g, 'happiness', -2)
    notice(g, '\u{1F397}\u{FE0F} Participation Ribbon', 'Your invention stopped working right as the judges walked up. You got a participation ribbon.', { emoji: '\u{1F397}\u{FE0F}' })
    log(g, 'My science fair project fizzled.')
  }
})

const RIVAL = defineScript('workshop.rival', (g, choice, data) => {
  const d = rec(data)
  if (!g.character.alive) return
  const ws = mutWorkshop(g)
  const name = text(d.name) || 'Your rival'
  if (choice === 'duel') {
    if (rand(g) < duelOdds(g, ws, num(d.rivalSkill, 100))) {
      addRep(ws, 6)
      addFame(g, 3)
      addStat(g, 'happiness', 6)
      notice(g, '\u{1F3C6} Victory', `Your gadget did a backflip. ${name}'s caught fire. The crowd chanted your name.`, { emoji: '\u{1F3C6}', tone: 'good' })
      log(g, `I beat my rival ${name} in an invention duel.`, 'good')
    } else {
      addRep(ws, -3)
      addStat(g, 'happiness', -4)
      notice(g, '\u{1F62D} Defeat', `${name}'s gadget made pancakes. Yours made a sad beep. The crowd went home.`, { emoji: '\u{1F62D}', tone: 'bad' })
      log(g, `My rival ${name} beat me in an invention duel.`, 'bad')
    }
    return
  }
  if (choice === 'team') {
    ws.skill = Math.min(100, ws.skill + 3)
    addRep(ws, 2)
    notice(g, '\u{1F91D} Frenemies', `You and ${name} spent a summer swapping tricks. Skill +3. You still don't like each other.`, { emoji: '\u{1F91D}', tone: 'good' })
    log(g, `I teamed up with my rival ${name} for a summer.`)
    return
  }
  log(g, `I ignored a challenge from ${name}. Rising above it.`)
})
