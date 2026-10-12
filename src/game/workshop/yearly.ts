// The Workshop's yearly hook (aging.ts, before 'business' and 'finance'): settles last year's
// sales (personal royalties through earnIncome, so they are taxed; company margins into the
// company's cash AND yearIncome, which the business sim books without moving cash again),
// retires inventions that left the shelves, closes the history race, sparks new ideas and
// rolls at most one event popup.
import { earnIncome, formatMoney, log, notice, scriptChoice } from '../core'
import { economicRoll, recordEconomicActivity } from '../economy'
import { anachronistic, cars, common } from '../events/era'
import { rand } from '../rng'
import { defineScript } from '../scripts'
import { outcomeTag } from '../timeMachine'
import type { GameState, Json } from '../types'
import { bizOf, businessAssets } from '../business/state'
import { catalogIdea, isHistory, type Category } from './catalog'
import { yearlyWorkshopEvent } from './events'
import { needsMigration } from './migrate'
import { curveAt, curveOver, familyOf, invCurve, saturation } from './market'
import { addIdea, addRep, blurbOf, drawIdea, dropIdea, inventions, isGenius, logIdea, mutWorkshop, storeInv, type Owned } from './notebook'
import { NOTEBOOK_MAX, rec, text, type Workshop } from './state'

const MILLION = 1_000_000
const INNOVATION = [0, 0.005, 0.01, 0.02, 0.05, 0.1] as const
const SECTOR_INDUSTRY: Record<Category, string> = { gadget: 'manufacturing', home: 'manufacturing', toy: 'manufacturing', health: 'biotech', transport: 'manufacturing', energy: 'energy', computing: 'software', food: 'farm', fashion: 'fashion', weird: 'manufacturing' }

/** Settle fiscal year g.year - 1 for every launched invention. */
export function settleInventions(g: GameState, ws: Workshop): void {
  const fiscal = g.year - 1
  const all = inventions(g).filter((o) => o.inv.stage === 'launched')
  const selling = all.filter((o) => o.inv.launched <= fiscal && !curveOver(invCurve(o.inv), fiscal - o.inv.launched))
  let personal = 0
  const companies = new Map<string, { name: string; amount: number }>()
  for (const o of all) {
    const inv = o.inv
    if (inv.last >= fiscal || inv.launched > fiscal) continue
    if (inv.route === 'open') {
      g.assets = g.assets.filter((a) => a.id !== o.a.id)
      continue
    }
    const company = inv.route === 'company' ? businessAssets(g).find((a) => a.id === inv.company) : null
    if (inv.route === 'company' && !company) {
      g.assets = g.assets.filter((a) => a.id !== o.a.id)
      log(g, `With ${inv.maker || 'the company'} gone, nobody makes the ${o.def.name} anymore.`)
      continue
    }
    const t = fiscal - inv.launched
    const sameCat = selling.filter((x) => x.def.cat === o.def.cat).length
    const noise = 0.85 + 0.3 * economicRoll(`${familyOf(g)}${outcomeTag(g, fiscal)}|ws-sales|${o.a.id}|${fiscal}`)
    const units = Math.max(0, Math.round(inv.peak * inv.hit * curveAt(invCurve(inv), t) * noise * (inv.boost === fiscal ? 2 : 1) * saturation(sameCat, selling.length)))
    const revenue = units * inv.price
    let income = 0
    if (company) {
      income = Math.round(revenue * inv.margin)
      const b = bizOf(g, company)
      b.cash += income
      b.yearIncome += income
      if (units > 0) b.brand = Math.min(100, b.brand + 1)
      inv.companyEarned += income
      const c = companies.get(company.id) ?? { name: company.name, amount: 0 }
      c.amount += income
      companies.set(company.id, c)
    } else {
      income = Math.round(revenue * inv.rate)
      personal += income
      inv.earned += income
    }
    inv.units += units
    // Widely adopted inventions nudge national productivity (living world), bounded and once per year.
    if (units >= 1_000) recordEconomicActivity(g, `workshop:${o.a.id}:${fiscal}`, inv.country, SECTOR_INDUSTRY[o.def.cat], { innovation: Math.min(0.3, Math.min(1, units / 50_000) * INNOVATION[o.def.d] * (inv.history ? 2 : 1)) })
    inv.last = fiscal
    inv.lastUnits = units
    inv.lastIncome = income
    bigMoments(g, ws, o, revenue)
    if (curveOver(invCurve(inv), t + 1)) {
      g.assets = g.assets.filter((a) => a.id !== o.a.id)
      log(g, `My ${o.def.name} left the shelves after ${t + 1} year${t ? 's' : ''}. ${Math.round(inv.units).toLocaleString('en-US')} sold in all.`)
      continue
    }
    storeInv(g, o.a, inv, ws.rep)
  }
  if (personal > 0) {
    earnIncome(g, personal)
    ws.earned += personal
    log(g, `My inventions earned me ${formatMoney(personal)} last year.`, 'good')
  }
  for (const c of companies.values()) if (c.amount > 0) log(g, `${c.name} made ${formatMoney(c.amount)} selling my inventions.`, 'good')
}

function bigMoments(g: GameState, ws: Workshop, o: Owned, revenue: number): void {
  const inv = o.inv
  const total = inv.earned + inv.companyEarned
  if (!inv.done.includes('million') && total >= MILLION) {
    inv.done = [...inv.done, 'million']
    addRep(ws, 5)
    notice(g, '\u{1F4B0} Your First Million', `The ${o.def.name} has now made ${formatMoney(total)}${inv.route === 'company' ? ` for ${inv.maker}` : ''}. Somewhere, a bank manager is smiling.`, { emoji: '\u{1F4B0}', tone: 'good' })
  }
  if (!inv.done.includes('bestseller') && (inv.lastUnits >= MILLION || revenue >= 25 * MILLION)) {
    inv.done = [...inv.done, 'bestseller']
    addRep(ws, 6)
    notice(g, '\u{1F4C8} Bestseller!', `${inv.lastUnits.toLocaleString('en-US')} ${o.def.name}s sold last year. It's in every shop window.`, { emoji: '\u{1F4C8}', tone: 'good' })
  }
}

/** History ideas still in the notebook after their real year are gone: someone else got there. */
function closeHistory(g: GameState, ws: Workshop): void {
  for (const idea of [...ws.ideas]) {
    const def = catalogIdea(idea.id)
    if (!def || !isHistory(def) || g.year <= def.real!) continue
    dropIdea(ws, idea.id)
    log(g, `Someone else unveiled a ${def.name} this year. History won this round.`, 'bad')
  }
}

type Scene = { at: string; when?: (g: GameState) => boolean }
const level = (g: GameState) => g.character.education.current?.level
const inSchool = (g: GameState) => { const l = level(g); return l === 'elementary' || l === 'middle' || l === 'high' }
const inCollege = (g: GameState) => { const l = level(g); return l === 'community' || l === 'university' || l === 'graduate' }
const working = (g: GameState) => !!(g.character.job || g.character.partTimeJob)
const after = (year: number) => (g: GameState) => g.year >= year

/** Where an idea strikes, by stage of life (each completes "..., you had an idea"). */
const SCENES: Record<'kid' | 'teen' | 'adult' | 'senior', readonly Scene[]> = {
  kid: [
    { at: 'In the middle of a boring lesson', when: inSchool },
    { at: 'On the walk home from school', when: inSchool },
    { at: 'While building a blanket fort' },
    { at: 'In the bath, surrounded by bubbles' },
    { at: 'While you were supposed to be asleep' },
    { at: 'Over a bowl of cereal', when: after(1910) },
    { at: 'While watching the rain from the window' },
    { at: 'Up in the branches of your favorite tree' },
  ],
  teen: [
    { at: 'Halfway through a boring class', when: inSchool },
    { at: 'While avoiding your homework', when: inSchool },
    { at: 'Lying awake at two in the morning' },
    { at: 'While brushing your teeth' },
    { at: 'While waiting for the bus', when: after(1925) },
    { at: 'On a long walk with nowhere to be' },
    { at: 'During a commercial break', when: (g) => common(g, 'tv') },
  ],
  adult: [
    { at: 'Halfway through a boring meeting', when: working },
    { at: 'On your lunch break', when: working },
    { at: 'Halfway through a lecture', when: inCollege },
    { at: 'While folding laundry' },
    { at: 'While doing the dishes' },
    { at: 'While stuck in traffic', when: cars },
    { at: 'While waiting for the bus', when: after(1925) },
    { at: 'In the shower', when: after(1930) },
    { at: 'Staring at the ceiling at three in the morning' },
  ],
  senior: [
    { at: 'While tending your garden' },
    { at: 'On your morning walk' },
    { at: 'While feeding the ducks at the park' },
    { at: 'Halfway through an afternoon nap' },
    { at: 'While tidying the shed' },
    { at: 'Over a jigsaw puzzle' },
  ],
}

/** Spark scenes that fit this character's age, school or job, year and place. Pure. */
export function sparkScenes(g: GameState): string[] {
  const c = g.character
  const stage = c.age < 13 ? 'kid' : c.age < 18 ? 'teen' : c.age >= 65 || (c.retired && c.age >= 55) ? 'senior' : 'adult'
  const fits = SCENES[stage].filter((s) => (!s.when || s.when(g)) && !anachronistic(g, s.at)).map((s) => s.at)
  return fits.length ? fits : ['Out of nowhere']
}

/** Ideas strike: geniuses 1-2 a year from age 6, everyone else ~15% a year from age 10. */
function sparks(g: GameState, ws: Workshop): void {
  const age = g.character.age
  const genius = isGenius(g)
  let n = 0
  if (genius && age >= 6) n = rand(g) < 0.5 ? 2 : 1
  else if (!genius && age >= 10 && rand(g) < 0.15) n = 1
  let popup = false
  for (let i = 0; i < n; i++) {
    if (ws.ideas.length >= NOTEBOOK_MAX) {
      log(g, 'A brilliant idea struck, but my notebook was full. It floated away.')
      return
    }
    const def = drawIdea(g, ws)
    if (!def) return
    if (!popup && age >= 8 && rand(g) < 0.3) {
      popup = true
      const scenes = sparkScenes(g)
      const scene = scenes[Math.floor(rand(g) * scenes.length)]
      scriptChoice(g, SPARK, '\u{1F4A1} An Idea Strikes', `${scene}, you had an idea: the ${def.name}. ${blurbOf(g, def)}`, [
        { id: 'write', label: 'Write it down', emoji: '\u{270D}\u{FE0F}' },
        { id: 'forget', label: 'Forget it', emoji: '\u{1F937}' },
      ], { emoji: def.emoji, data: { id: def.id, year: g.year } as unknown as Json })
      continue
    }
    if (addIdea(g, ws, def)) logIdea(g, def)
  }
}

const SPARK = defineScript('workshop.spark', (g, choice, data) => {
  const d = rec(data)
  const def = catalogIdea(text(d.id))
  if (!def) return
  if (choice !== 'write') {
    log(g, `I had an idea for a ${def.name}, then forgot it. Classic.`)
    return
  }
  const ws = mutWorkshop(g)
  if (addIdea(g, ws, def)) logIdea(g, def)
  else log(g, 'My notebook was too full for another idea.')
})

function patentNews(g: GameState): void {
  for (const o of inventions(g)) if (o.inv.patent && o.inv.patent.expires === g.year) log(g, `My patent on the ${o.def.name} expired. Copycats, start your engines.`)
}

export function yearlyWorkshop(g: GameState): void {
  if (!g.character.alive) return
  const hasAny = g.assets.some((a) => a.kind === 'invention')
  // Nothing to do for a young life that never touched the Workshop and isn't due a spark.
  if (!hasAny && !g.flags.workshop && !isGenius(g) && g.character.age < 10 && !needsMigration(g)) return
  // Old saves: anything the old rules settled through last year is left alone (g.year - 2).
  const ws = mutWorkshop(g, g.year - 2)
  settleInventions(g, ws)
  if (ws.last >= g.year) return
  ws.last = g.year
  patentNews(g)
  closeHistory(g, ws)
  if (!g.character.prison) {
    sparks(g, ws)
    yearlyWorkshopEvent(g, ws)
  }
  for (const o of inventions(g)) storeInv(g, o.a, o.inv, ws.rep)
}
