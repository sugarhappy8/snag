// The year at the family business: relatives are paid out of company cash, learn the job (or don't),
// are rated, get restless, quit, start their own firms or are poached; the staff resent favoritism
// and admire merit; the press notices; the company's numbers move a little (capped) with a mismatched
// or excellent relative. Nothing here creates money: pay comes out of company cash, the part above
// the going rate is not tax-deductible, and the relative pays income tax on every dollar.
import { firmCash, personCash } from '../cash'
import { addRelationship, getPerson, log, notice, scriptChoice, useYearAction } from '../core'
import { addEntitlement, entitlement, personCountry, typicalIncome } from '../events/wealth-core'
import { isEstranged } from '../events/will-core'
import { incomeTax } from '../finance'
import { hasTech } from '../history/timeline'
import type { Reason } from '../kernel/reasons'
import { marketOf } from '../data/markets'
import { notePerson } from '../people'
import { chance, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { Asset, GameState, Person } from '../types'
import { handOver, managerCandidate } from './career'
import { driveOf, expectedRating, fitOf, nextSkill } from './nepo-model'
import { clearJob, readJob, writeJob, writePast, type FamilyJob } from './nepo-job'
import { ABOVE_MARKET, marketPay, rankDef, startingPay, titleFor } from './nepo-roles'
import { employeesOf, familyOf, isCeoOf, readFamily, successorOf, myKin, type Employee } from './nepo-state'
import { endJob, handOverToSuccessor, settleReplacedCeo, unearned } from './nepo-actions'
import { bizOf, businessAssets, findBusiness, hasExecutiveShares, runsIt, totalOutlets, type BizState } from './state'
import { clampN, rec, str } from './util'

/** Most nepo popups in a year, counting the ask (nepo-asks.ts), the year's one outcome and a life event. */
export const NEPO_POPUPS = 2
const POP_KEY = 'nepo.pop'

/** True while the family business may still show a popup this year. */
export function popupRoom(g: GameState): boolean {
  return (g.yearActions[POP_KEY] ?? 0) < NEPO_POPUPS && g.queue.filter((m) => m.kind === 'choice').length < 4
}

/** Spend one of the year's popups. */
export function usePopup(g: GameState): boolean {
  return useYearAction(g, POP_KEY, NEPO_POPUPS)
}

// ---------------------------------------------------------------------------
// What the family does to the company's numbers (small, capped)

export interface CompanyEffects {
  /** Share of next year's demand (+0.02 = 2% more), capped at +/-3%. */
  demand: number
  /** Share of next year's unit costs (+0.02 = 2% cheaper), capped at +/-2%. */
  cost: number
  /** Quality points, capped at +/-3. */
  quality: number
}

export const DEMAND_CAP = 0.03
export const COST_CAP = 0.02
export const QUALITY_CAP = 3

/** How much one person matters at a company this big (a big firm barely notices one VP). */
export function sizeScale(b: BizState): number {
  return 1 / (1 + 0.35 * Math.log10(1 + totalOutlets(b)))
}

/** Each relative's lift (or drag) on the company; the CEO is already in the CEO model. Pure. */
export function companyEffects(b: BizState, emps: readonly Employee[]): CompanyEffects {
  let demand = 0
  let cost = 0
  let quality = 0
  const scale = sizeScale(b)
  for (const { job } of emps) {
    if (job.rank >= 5) continue
    const part = job.part ? 0.3 : 1
    if (job.kind === 'cushy') {
      cost -= 0.003 * scale
      continue
    }
    const fit = fitOf(job.skill, job.rank)
    const lift = clampN(fit / 100, -0.45, 0.45) * rankDef(job.rank).weight * part * scale * (0.7 + (0.6 * job.mood) / 100)
    if (job.focus === 'sales') demand += lift
    else if (job.focus === 'quality') quality += lift * 100
    else cost += lift * 0.7
  }
  return { demand: clampN(demand, -DEMAND_CAP, DEMAND_CAP), cost: clampN(cost, -COST_CAP, COST_CAP), quality: clampN(quality, -QUALITY_CAP, QUALITY_CAP) }
}

// ---------------------------------------------------------------------------
// One relative's year

interface Outcome {
  title: string
  text: string
  emoji: string
  tone: 'good' | 'bad' | 'neutral'
  weight: number
}

const he = (p: Person) => (p.gender === 'male' ? 'he' : 'she')
const his = (p: Person) => (p.gender === 'male' ? 'his' : 'her')

/** The mood a relative drifts toward: pay, how they are doing, mentoring, a made-up job's comfort. */
function moodTarget(job: FamilyJob, market: number, perf: number): number {
  const ratio = job.pay / Math.max(1, market)
  let t = 60 + (perf - 50) * 0.25 + clampN((ratio - 1) * 18, -20, 12) - job.burn * 4
  if (job.groom) t += 6
  if (job.kind === 'cushy') t += 10
  if (job.unpaid > 0) t -= 15
  return clampN(t, 5, 95)
}

function leave(g: GameState, a: Asset, b: BizState, p: Person, how: 'quit' | 'startup' | 'poached' | 'burnout'): void {
  const job = endJob(g, a, b, p, how)
  if (!job) return
  p.stats.happiness = clampN(p.stats.happiness + (how === 'burnout' ? -8 : 2), 0, 100)
  const fam = familyOf(b)
  fam.resent = Math.round(clampN(fam.resent - 3, 0, 100))
}

function step(g: GameState, a: Asset, b: BizState, e: Employee, out: Outcome[]): void {
  const { p } = e
  const job = e.job
  const ceo = isCeoOf(b, p)
  const market = marketPay(b, job.rank)
  if (ceo && b.manager) job.pay = b.manager.salary
  // A minor who turns 18 stops being a summer hire.
  if (job.part && p.age >= 18) {
    job.part = false
    job.pay = Math.max(job.pay, startingPay(b, job.rank, false))
    job.title = titleFor(g, p, job.rank, job.focus, job.kind)
  }
  // Practice, rating, mood.
  job.skill = nextSkill(p, job)
  const fit = fitOf(job.skill, job.rank)
  job.burn = job.kind === 'real' && job.rank >= 1 && fit < -25 ? job.burn + 1 : Math.max(0, job.burn - 1)
  job.perf = Math.round(clampN(expectedRating(job.skill, job.rank, job.mood) + randInt(g, -6, 6), 0, 100))
  job.mood = Math.round(clampN(job.mood + (moodTarget(job, market, job.perf) - job.mood) * 0.4, 0, 100))
  if (ceo && b.manager) b.manager.skill = Math.round(clampN(job.skill, 0, 100))
  // Life changes with the job.
  if (job.kind === 'cushy') {
    if (chance(g, 0.5)) addEntitlement(p, 2)
  } else if (job.perf >= 70) {
    if (chance(g, 0.3)) p.stats.smarts = clampN(p.stats.smarts + 1, 0, 100)
    if (entitlement(p) > 0 && chance(g, 0.5)) addEntitlement(p, -1)
  }
  if (job.mood >= 70 && chance(g, 0.4)) addRelationship(g, p, 1)
  if (job.mood < 35 && chance(g, 0.4)) addRelationship(g, p, -2)
  const tenure = g.year - job.since
  const drive = driveOf(p)
  const first = p.firstName
  // Decisions: leave, burn out, start a firm, get poached.
  if (!ceo) {
    if (job.burn >= 3) {
      writeJob(p, job)
      leave(g, a, b, p, 'burnout')
      log(g, `${first} burned out at ${a.name} and walked away from the job.`, 'bad')
      out.push({ title: 'Burned Out', text: `${first} was in a job far over ${his(p)} head for years. ${He(p)} stopped sleeping, then stopped coming in, and finally handed in ${his(p)} badge.`, emoji: '\u{1F635}', tone: 'bad', weight: 4 })
      return
    }
    if (job.mood < 25 && chance(g, 0.35)) {
      writeJob(p, job)
      leave(g, a, b, p, 'quit')
      log(g, `${first} quit ${a.name}${job.unpaid > 0 ? ' after the company missed ' + his(p) + ' pay' : ''}.`, 'bad')
      addRelationship(g, p, -randInt(g, 4, 10))
      out.push({ title: 'They Quit', text: `${first} quit ${a.name}${job.unpaid > 0 ? ', fed up with being paid late' : ', fed up and underappreciated'}. ${He(p)} said it was not personal. It was a little personal.`, emoji: '\u{1F6AA}', tone: 'bad', weight: 3 })
      return
    }
    if (job.skill >= 60 && tenure >= 3 && !job.groom && (p.traits.includes('ambitious') || drive >= 70) && chance(g, 0.04)) {
      writeJob(p, job)
      leave(g, a, b, p, 'startup')
      p.data.founder = g.year
      addRelationship(g, p, 3)
      log(g, `${first} left ${a.name} to start ${his(p)} own company.`, 'neutral')
      out.push({ title: 'Going It Alone', text: `${first} quit ${a.name} to start ${his(p)} own company. "I want to know what I can do without ${p.relation === 'child' ? 'the family name' : 'your name on the door'}," ${he(p)} said. You were proud for about a minute and then worried about the competition.`, emoji: '\u{1F680}', tone: 'neutral', weight: 3 })
      return
    }
    if (job.skill >= 70 && tenure >= 2 && chance(g, 0.02 + (job.pay < market * 0.85 ? 0.05 : 0))) {
      writeJob(p, job)
      leave(g, a, b, p, 'poached')
      log(g, `A rival poached ${myKin(p)} from ${a.name}.`, 'bad')
      out.push({ title: 'Poached', text: `A rival of ${a.name} made ${first} an offer ${he(p)} could not refuse (the name on the badge helped them). ${first} took it.`, emoji: '\u{1F3C3}', tone: 'bad', weight: 3 })
      return
    }
    if (p.age <= 35 && p.stats.looks >= 65 && entitlement(p) >= 50 && p.relation === 'child' && g.character.hidden.fame >= 25 && chance(g, 0.03)) {
      writeJob(p, job)
      leave(g, a, b, p, 'quit')
      p.data.celeb = g.year
      p.occupation = hasTech(g, 'socialMedia') ? 'Influencer' : 'Socialite'
      p.stats.happiness = clampN(p.stats.happiness + 8, 0, 100)
      log(g, `${myKin(p)} left ${a.name} to be famous for being famous.`, 'neutral')
      out.push({ title: 'The Famous Kid', text: `${first} left ${a.name} to become ${hasTech(g, 'socialMedia') ? 'an influencer' : 'a fixture of the society pages'}. Photographers like ${p.gender === 'male' ? 'him' : 'her'}. Everyone knows whose ${p.gender === 'male' ? 'son' : 'daughter'} ${he(p)} is.`, emoji: '\u{1F4F8}', tone: 'neutral', weight: 2 })
      return
    }
  }
  if (job.skill >= 75 && job.rank >= 2 && job.perf >= 80 && !ceo && chance(g, 0.12)) {
    out.push({ title: 'A Star Is Hired', text: `${first} has turned out to be genuinely good at the job at ${a.name}. People who did not expect to like ${p.gender === 'male' ? 'him' : 'her'} are asking for ${p.gender === 'male' ? 'him' : 'her'} on their projects.`, emoji: '\u{1F31F}', tone: 'good', weight: 2 })
  }
  writeJob(p, job)
}

function He(p: Person): string {
  return p.gender === 'male' ? 'He' : 'She'
}
// ---------------------------------------------------------------------------
// The press

function pressStory(g: GameState, a: Asset, b: BizState, emps: readonly Employee[]): Outcome | null {
  const fam = familyOf(b)
  const worst = [...emps].filter((e) => e.job.rank >= 3 || e.job.kind === 'cushy').sort((x, y) => unearned(y.job, marketPay(b, y.job.rank)) - unearned(x.job, marketPay(b, x.job.rank)))[0] ?? emps[0]
  if (!worst) return null
  const p = worst.p
  const kid = p.relation === 'child' || p.relation === 'stepchild' || p.relation === 'grandchild'
  const modern = hasTech(g, 'socialMedia') && g.year >= 2012
  const phrase = g.year >= 2022 ? 'nepo baby' : g.year >= 1990 ? 'silver-spoon heir' : 'proprietor\'s pet'
  let title: string
  let text: string
  const who = kid ? `${p.firstName}, the boss's ${p.gender === 'male' ? 'son' : 'daughter'}` : `${p.firstName}, the boss's relative`
  if (modern) {
    title = 'Trending: The Boss\'s Family'
    text = `A post about ${who}, ${worst.job.title} at ${a.name}, went viral. The comments call ${p.gender === 'male' ? 'him' : 'her'} a "${phrase}" and ask what ${a.name} would look like if the job went to the best applicant. Your brand took a dent.`
  } else if (g.year >= 1990) {
    title = 'In the Papers'
    text = `A business magazine ran a piece on ${who}, ${worst.job.title} at ${a.name}, under the headline "Keeping It in the Family". The ${phrase} line made the rounds. Your brand took a dent.`
  } else {
    title = 'In the Papers'
    text = `The newspaper's business page noted that ${who} is ${worst.job.title} at ${a.name}, and that the staff "have views on the matter". The ${phrase} line made the rounds. Your brand took a dent.`
  }
  const hit = Math.round(clampN(2 + fam.label / 25, 2, 6))
  b.brand = clampN(b.brand - hit, 0, 100)
  fam.label = Math.round(clampN(fam.label - 14, 0, 100))
  fam.pressYear = g.year
  const j = readJob(p)
  if (j) {
    j.mood = clampN(j.mood - 8, 0, 100)
    writeJob(p, j)
  }
  log(g, `${a.name} was in the papers for hiring family.`, 'bad')
  return { title, text, emoji: '\u{1F4F0}', tone: 'bad', weight: 5 }
}

// ---------------------------------------------------------------------------
// The company's year

function rescueCeo(g: GameState, a: Asset, b: BizState): void {
  if (b.ceo !== 'manager' || !b.manager?.personId) return
  const p = getPerson(g, b.manager.personId)
  if (!p || !p.alive) {
    const name = `${b.manager.firstName} ${b.manager.lastName}`
    handOver(g, a, b, managerCandidate(g, b, randInt(g, 45, 70)), { forCause: true })
    log(g, `${name} is gone and ${a.name} named an interim general manager.`, 'bad')
    return
  }
  const job = readJob(p)
  if (!job || job.assetId !== a.id || job.rank !== 5) {
    // Records from before the title existed (or damaged ones): the CEO's job is whatever the company says it is.
    writeJob(p, {
      assetId: a.id,
      rank: 5,
      focus: job?.focus ?? 'ops',
      kind: 'real',
      title: 'CEO',
      since: job?.since ?? b.manager.since,
      rankSince: b.manager.since,
      pay: b.manager.salary,
      skill: b.manager.skill,
      mood: job?.mood ?? 70,
      perf: job?.perf ?? 55,
      raised: job?.raised ?? 0,
      unpaid: 0,
      burn: 0,
      part: false,
      groom: false,
      by: job?.by ?? g.character.id,
      kin: job?.kin ?? (typeof p.data.kin === 'string' ? p.data.kin : ''),
    })
    if (p.age >= 18) p.occupation = `CEO at ${a.name}`
  }
}

/**
 * A relative's money moves to `Math.round(p.money + delta)`, as it always did (it rounds the whole balance, not just the change);
 * the books take the whole dollars of that change. `floor` 0 keeps it from going below zero.
 */
function kinMoney(g: GameState, p: Person, delta: number, why: Reason, floor?: number): number {
  const target = Math.max(floor ?? Number.NEGATIVE_INFINITY, Math.round(p.money + delta))
  const done = personCash(g, p, target - p.money, why, floor)
  // A balance that crosses zero can land an ulp off the whole-dollar target: this closes that gap and books nothing (it is under a dollar).
  return done + personCash(g, p, target - p.money, why, floor)
}

function companyYear(g: GameState, a: Asset, out: Outcome[]): void {
  const b = bizOf(g, a)
  rescueCeo(g, a, b)
  let emps = employeesOf(g, a.id)
  let settled = false
  for (const e of emps) settled = settleReplacedCeo(g, a, b, e.p) || settled
  // settleReplacedCeo reads and writes a fresh normalized job. Reload the employee snapshot so
  // this year's payroll and performance step use the demoted rank/title/pay rather than the
  // pre-normalization CEO copy captured above.
  if (settled) emps = employeesOf(g, a.id)
  const fam = readFamily(b.family)
  if (emps.length === 0 && fam.resent === 0 && fam.label === 0 && !fam.succ.kind) return
  const f = familyOf(b)
  // The successor must still be there.
  if (f.succ.kind && !successorOf(g, a, b)) f.succ = { kind: '', id: '' }

  // Pay: out of company cash, the part above the going rate costs the company its tax deduction too.
  const payroll = emps.filter((e) => !isCeoOf(b, e.p))
  const due = payroll.reduce((s, e) => s + e.job.pay, 0)
  const cashOk = Math.max(0, b.cash)
  const ratio = due > 0 ? clampN(cashOk / due, 0, 1) : 1
  const paidTotal = Math.round(due * ratio)
  if (paidTotal > 0) {
    firmCash(g, b, -paidTotal, 'payroll', a.id)
    b.yearCosts += paidTotal
  }
  let disallowed = 0
  for (const e of payroll) {
    const got = Math.round(e.job.pay * ratio)
    const net = got - incomeTax(b.countryId, got)
    kinMoney(g, e.p, Math.max(0, net), 'wage')
    const market = marketPay(b, e.job.rank)
    disallowed += Math.max(0, e.job.pay - market * ABOVE_MARKET) * ratio
    e.job.unpaid = ratio < 0.999 ? e.job.unpaid + 1 : 0
    if (ratio < 0.999) e.job.mood = clampN(e.job.mood - 12, 0, 100)
    writeJob(e.p, e.job)
  }
  const extra = Math.min(Math.round(disallowed * marketOf(b.countryId).corporateTax), Math.max(0, b.cash))
  if (extra > 0) {
    firmCash(g, b, -extra, 'tax.corp', a.id)
    b.yearCosts += extra
  }
  for (const e of emps.filter((x) => isCeoOf(b, x.p) && b.manager)) {
    const sal = b.manager?.salary ?? 0
    kinMoney(g, e.p, Math.max(0, sal - incomeTax(b.countryId, sal)), 'wage')
  }
  if (ratio < 0.999 && due > 0) log(g, `${a.name} could only pay its family staff ${Math.round(ratio * 100)}% of what they were due.`, 'bad')

  // Each relative's year.
  for (const e of [...emps]) {
    const fresh = getPerson(g, e.p.id)
    const job = fresh ? readJob(fresh) : null
    if (!fresh || !job) continue
    step(g, a, b, { p: fresh, job }, out)
  }
  emps = employeesOf(g, a.id)

  // Staff: resentment of favoritism, admiration of merit.
  let favor = 0
  let merit = 0
  for (const { job } of emps) {
    favor += unearned(job, marketPay(b, job.rank))
    if (job.kind === 'real' && job.rank >= 1 && job.perf >= 75 && fitOf(job.skill, job.rank) >= 10) merit += 1
  }
  f.resent = Math.round(clampN(f.resent * 0.7 + favor * 6, 0, 100))
  f.label = Math.round(clampN(f.label * 0.8 + favor * 3 + emps.filter((e) => e.job.rank >= 4 || e.job.kind === 'cushy').length * 2, 0, 100))
  const penalty = Math.min(7, Math.round(f.resent / 14))
  const admire = Math.min(3, merit)
  const delta = admire - penalty
  if (delta !== 0) {
    b.morale = clampN(b.morale + delta, 0, 100)
    for (const s of b.staff) s.morale = clampN(s.morale + Math.round(delta / 2), 0, 100)
  }
  if (penalty >= 3) log(g, `The staff at ${a.name} grumble about the boss's relatives.`, 'bad')
  else if (admire >= 2) log(g, `The staff at ${a.name} respect how hard the boss's relatives work.`, 'good')

  // The company's numbers: capped.
  const fx = companyEffects(b, emps)
  if (fx.demand !== 0) b.demandShock = clampN(b.demandShock * (1 + fx.demand), 0.3, 2)
  if (fx.cost !== 0) b.costShock = clampN(b.costShock * (1 - fx.cost), 0.5, 2)
  if (fx.quality !== 0) b.quality = clampN(Math.round(b.quality + fx.quality), 0, 100)

  // The press.
  if (f.label >= 35 && g.year - f.pressYear >= 3 && emps.length > 0 && chance(g, f.label / 250)) {
    const story = pressStory(g, a, b, emps)
    if (story) out.push(story)
  }
  // Brothers and sisters.
  siblingDrama(g, a, b, emps)
  // The ones who made it on merit.
  for (const e of emps) {
    const job = readJob(e.p)
    if (job && job.rank >= 1 && job.kind === 'real' && g.year - job.rankSince === 3 && job.perf >= 70 && fitOf(job.skill, job.rank) >= 15) {
      notePerson(e.p, `Earned a reputation at ${a.name}.`)
    }
  }
}

/** Kids who work next to each other, and kids who were passed over. */
function siblingDrama(g: GameState, a: Asset, b: BizState, emps: readonly Employee[]): void {
  const kids = emps.filter((e) => e.p.relation === 'child' || e.p.relation === 'stepchild')
  if (kids.length >= 2) {
    const sorted = [...kids].sort((x, y) => y.job.pay - x.job.pay)
    const top = sorted[0]
    const low = sorted[sorted.length - 1]
    if (top.job.pay > low.job.pay * 1.4 && low.job.rank < top.job.rank && chance(g, 0.3)) {
      const j = readJob(low.p)
      if (j) {
        j.mood = clampN(j.mood - 8, 0, 100)
        writeJob(low.p, j)
      }
      addRelationship(g, low.p, -3)
      log(g, `${low.p.firstName} complained that ${top.p.firstName} is paid more at ${a.name}.`, 'bad')
    }
  }
  // An adult child with no job at a company where a sibling is a director or above.
  const senior = kids.find((e) => e.job.rank >= 3)
  if (senior) {
    const passed = g.people.filter(
      (p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild') && p.age >= 22 && !readJob(p) && p.data.nepoSelfMade === undefined && p.data.disowned !== true && !isEstranged(g, p) && p.relationship >= 20 && p.id !== senior.p.id,
    )
    if (passed.length > 0 && chance(g, 0.2)) {
      const p = passed[randInt(g, 0, passed.length - 1)]
      addRelationship(g, p, -randInt(g, 2, 5))
      log(g, `${p.firstName} told me it is not fair that ${senior.p.firstName} got a ${senior.job.title} job at ${a.name} and ${he(p)} didn't.`, 'bad')
    }
  }
  void b
}

// ---------------------------------------------------------------------------
// Where they end up: founders and the ones who made it alone

/** Relatives who left to start a company, or earned their own way after a no, find out how it went. */
function arcs(g: GameState): void {
  for (const p of g.people) {
    if (!p.alive || p.relation === 'pet') continue
    const founded = typeof p.data.founder === 'number' ? p.data.founder : 0
    if (founded > 0) {
      const years = g.year - founded
      if (years >= 3 && chance(g, years >= 9 ? 0.4 : 0.14)) {
        p.data.founder = -1
        if (chance(g, 0.4)) {
          kinMoney(g, p, typicalIncome(g, personCountry(g, p)) * randInt(g, 4, 30), 'luck')
          p.occupation = 'Founder'
          addRelationship(g, p, 4)
          log(g, `${myKin(p)}'s company took off.`, 'good')
        } else {
          kinMoney(g, p, -Math.min(p.money * 0.6, typicalIncome(g, personCountry(g, p)) * 3), 'luck', 0)
          p.occupation = 'Unemployed'
          log(g, `${myKin(p)}'s company folded. ${p.firstName} says it was a great education.`, 'bad')
        }
      }
    }
    const made = typeof p.data.nepoSelfMade === 'number' ? p.data.nepoSelfMade : 0
    if (made > 0 && p.age >= 24 && g.year - made >= 4 && chance(g, 0.04)) {
      p.data.nepoSelfMade = -made
      kinMoney(g, p, typicalIncome(g, personCountry(g, p)) * randInt(g, 1, 6), 'wage')
      addRelationship(g, p, 3)
      p.stats.happiness = clampN(p.stats.happiness + 5, 0, 100)
      log(g, `${myKin(p)} got a big promotion at ${his(p)} own job. ${He(p)} mentioned ${he(p)} did not need your help.`, 'good')
    }
  }
}

// ---------------------------------------------------------------------------
// Cleaning up what the world changed

/** Jobs at a company the player no longer owns (sold, seized, inherited by someone else) end quietly. */
function cleanup(g: GameState): void {
  const live = new Map(businessAssets(g).map((a) => [a.id, a]))
  for (const p of g.people) {
    const job = readJob(p)
    if (!job) continue
    if (!p.alive) {
      clearJob(p)
      continue
    }
    const a = live.get(job.assetId)
    if (!a) {
      writePast(p, { assetId: job.assetId, year: g.year, how: 'closed', rank: job.rank })
      clearJob(p)
      if (p.age >= 18 && /\bat\b/.test(p.occupation)) p.occupation = 'Unemployed'
      continue
    }
    const b = bizOf(g, a)
    // A vested shareholder stays employed despite family conflict or moving abroad.
    if (isCeoOf(b, p) && hasExecutiveShares(b.manager)) continue
    // Non-shareholders may walk away after estrangement or a move.
    const estranged = isEstranged(g, p)
    if (p.data.disowned === true || estranged) {
      if (isCeoOf(b, p)) {
        handOver(g, a, b, managerCandidate(g, b, randInt(g, 45, 70)), { forCause: true })
        log(g, estranged ? `${p.firstName} cut contact, so ${a.name} named an interim general manager.` : `${p.firstName} was disowned, so ${a.name} named an interim general manager.`, 'neutral')
      }
      endJob(g, a, b, p, 'quit')
      log(g, estranged ? `${p.firstName} left ${a.name} after the family became estranged.` : `${p.firstName} left ${a.name} after being disowned.`, 'bad')
      continue
    }
    // Moved to another country (the family emigrated, or you did and they stayed with you): the job ends.
    if (personCountry(g, p) !== b.countryId) {
      if (isCeoOf(b, p)) {
        handOver(g, a, b, managerCandidate(g, b, randInt(g, 45, 70)), { forCause: true })
        log(g, `${p.firstName} moved abroad, so ${a.name} named an interim general manager.`, 'neutral')
      }
      endJob(g, a, b, p, 'quit')
      log(g, `${p.firstName} left ${a.name} after moving to another country.`, 'neutral')
    }
  }
}

// ---------------------------------------------------------------------------
// Handing over

const BATON = defineScript('nepo.baton', (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a) return
  if (choice === 'hand') {
    const b = bizOf(g, a)
    const r = handOverToSuccessor(g, a, b)
    if (!r.ok && !r.voted) notice(g, 'Not Yet', r.reason ?? 'Your successor is not ready.', { emoji: '\u{1F4CB}' })
  }
})

function batonPrompt(g: GameState, a: Asset, b: BizState): boolean {
  const fam = familyOf(b)
  const s = successorOf(g, a, b)
  if (!s || !runsIt(g, a)) return false
  const c = g.character
  if (c.age < 66 || g.year - fam.handYear < 4 || c.prison) return false
  const name = s.kind === 'person' ? `${s.person.firstName} ${s.person.lastName}` : s.name
  const skill = s.kind === 'person' ? Math.round(s.job.skill) : Math.round(s.skill)
  fam.handYear = g.year
  scriptChoice(
    g,
    BATON,
    'Time to Pass the Baton?',
    `You are ${c.age}. ${name} (skill ${skill}) is ready to take over ${a.name} if you want to step back. You would keep your ${Math.round(b.share * 100)}% and your seat; ${name} would run it.`,
    [
      { id: 'hand', label: `Hand over to ${name}`, emoji: '\u{1F451}' },
      { id: 'later', label: 'Not yet', emoji: '\u{23F3}' },
    ],
    { emoji: '\u{1F451}', data: { assetId: a.id } },
  )
  return true
}

// ---------------------------------------------------------------------------
// The yearly step

/** The family-business part of the year (aging.ts runs nepo.ts yearlyNepo, which calls this first). */
export function familyYear(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  cleanup(g)
  arcs(g)
  const out: Outcome[] = []
  for (const a of businessAssets(g)) {
    if (!findBusiness(g, a.id)) continue
    companyYear(g, a, out)
  }
  // One outcome popup a year, the biggest story; the rest are log lines.
  if (out.length > 0) {
    out.sort((x, y) => y.weight - x.weight)
    const first = out[0]
    for (const o of out) if (o !== first) log(g, o.text.split('. ')[0] + '.', o.tone === 'bad' ? 'bad' : 'neutral')
    if (popupRoom(g) && usePopup(g)) notice(g, first.title, first.text, { emoji: first.emoji, tone: first.tone })
    else log(g, first.text.split('. ')[0] + '.', first.tone === 'bad' ? 'bad' : 'neutral')
  }
  // The question of the baton.
  for (const a of businessAssets(g)) {
    if (!popupRoom(g)) break
    const b = bizOf(g, a)
    if (batonPrompt(g, a, b)) usePopup(g)
  }
}
