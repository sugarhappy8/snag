// What the owner can do about relatives at the company: hire, promote, demote, give a raise, let
// them go, make one CEO, name a successor. Every action here costs something real: pay comes out of
// company cash every year (nepo-year.ts), an executive job or above-market pay goes to the board as
// possible self-dealing, the staff notice who is promoted past merit, and the press has a word for it.
import { addRelationship, addStat, count, formatMoney, log, notice, remember } from '../core'
import { addEntitlement, entitlement } from '../events/wealth-core'
import { incomeTax } from '../finance'
import { notePerson, createPerson } from '../people'
import { chance, randInt, rand } from '../rng'
import type { Asset, GameState, Person } from '../types'
import { npcLife, npcEducationSkill } from '../npc-state'
import { npcHasMainCharacter } from '../talents'
import { getCountry, randomFirstName, randomLastName } from '../world'
import { boardAllows, needsVote, passOdds, type Proposal } from './board'
import { askingSalary, handOver, managerCandidate } from './career'
import { laborProtection, severanceMonths } from './flavor'
import { readJob, writeJob, writePast, type FamilyJob } from './nepo-job'
import { expectedRating, fitOf, overHead, startSkill } from './nepo-model'
import { ageBlock, defaultFocus, marketPay, payAt, startingPay, titleFor } from './nepo-roles'
import { afterSuccession, CEO_MIN_AGE, managerFromPerson, promoteToCeo, successorManager } from './nepo-succession'
import { familyOf, hireBlock, isCeoOf, myKin, readFamily, yourKin } from './nepo-state'
import { bizOf, ceoJob, findBusiness, runsIt, type BizState } from './state'
import type { StaffFocus } from './industries'
import { clampN, money, pct } from './util'
import { settleAfterCeoChange } from './executive-shares'

// ---------------------------------------------------------------------------
// Plans (pure): what a job would be

export interface HireOpts {
  rank: number
  kind?: 'real' | 'cushy'
  focus?: StaffFocus
  /** Pay as a multiple of the going rate (default: the going rate; a made-up job pays more). */
  payMult?: number
  /** Name them successor right away (adult descendants). */
  groom?: boolean
}

export interface HirePlan {
  rank: number
  kind: 'real' | 'cushy'
  focus: StaffFocus
  title: string
  part: boolean
  pay: number
  market: number
  skill: number
}

/** The pay of a made-up job: well above what a real director earns (that is the point of it). */
export const CUSHY_PAY_MULT = 1.8

/** The rank a made-up job counts as (a director's desk with no director's work). */
export const CUSHY_RANK = 3

/** What this job would be for this person: the title, the pay, the skill they would start with. Pure. */
export function planHire(g: GameState, b: BizState, p: Person, o: HireOpts): HirePlan {
  const kind = o.kind ?? 'real'
  const rank = kind === 'cushy' ? CUSHY_RANK : Math.round(clampN(o.rank, 0, 5))
  const focus = o.focus ?? defaultFocus(p)
  const part = p.age < 18
  const market = marketPay(b, rank)
  const pay = kind === 'cushy' ? payAt(b, rank, o.payMult ?? CUSHY_PAY_MULT) : part ? startingPay(b, rank, true) : o.payMult ? payAt(b, rank, o.payMult) : startingPay(b, rank, false)
  const skill = kind === 'cushy' ? Math.min(startSkill(p), 25) : npcHasMainCharacter(p) ? startSkill(p) : clampN(startSkill(p) - npcEducationSkill(p) + npcEducationSkill(p, focus), 3, 99)
  return { rank, kind, focus, title: titleFor(g, p, rank, focus, kind), part, pay, market, skill }
}

/** The board proposal for a plan (pure). */
export function planProposal(p: Person, plan: HirePlan, what = 'Hire'): Proposal {
  return {
    kind: 'familyHire',
    by: 'owner',
    amount: plan.pay,
    skill: plan.skill,
    rank: plan.rank,
    market: plan.market,
    cushy: plan.kind === 'cushy',
    label: `${what} ${yourKin(p)} as ${plan.title} at ${money(plan.pay)} a year`,
  }
}

/** Why the owner can't hire this person into this job (null: they can). */
export function planBlock(g: GameState, b: BizState, p: Person, plan: HirePlan): string | null {
  const base = hireBlock(g, b, p)
  if (base) return base
  if (plan.kind === 'real') {
    const age = ageBlock(p, plan.rank)
    if (age) return age
  } else if (p.age < 18) return `${p.firstName} is too young for a made-up job.`
  if (plan.rank >= 5) return `Use "Make CEO" for the top job.`
  if (p.age < 18 && plan.rank > 0) return `${p.firstName} is still a minor: only a summer job.`
  const life = npcLife(p)
  if (life && plan.kind === 'real' && plan.pay < life.income * (p.traits.includes('loyal') && p.relationship >= 65 ? .8 : .95)) return `${p.firstName} declines: the offer is below their current earning expectations (${money(life.income)}/year).`
  return null
}

// ---------------------------------------------------------------------------
// How the staff and the press see it

/** How undeserved this job looks, 0-1.5: over their head, a made-up job, pay past the going rate, a high rank. */
export function unearned(job: Pick<FamilyJob, 'skill' | 'rank' | 'kind' | 'pay'>, market: number): number {
  const over = overHead(job)
  const rich = Math.max(0, job.pay / Math.max(1, market) - 1.2) * 0.4
  return clampN(over + rich + (job.rank >= 4 ? 0.2 : 0), 0, 1.5)
}

/** The immediate reaction when a relative gets a job or a promotion: staff morale, resentment, the label. */
function staffReaction(_g: GameState, a: Asset, b: BizState, p: Person, job: FamilyJob, verb: 'hired' | 'promoted'): string {
  const fam = familyOf(b)
  const u = unearned(job, marketPay(b, job.rank))
  const hit = Math.round(u * 6 + (job.kind === 'cushy' ? 3 : 0))
  if (hit > 0) {
    b.morale = clampN(b.morale - hit, 0, 100)
    for (const s of b.staff) s.morale = clampN(s.morale - Math.ceil(hit / 2), 0, 100)
  }
  fam.resent = Math.round(clampN(fam.resent + u * 16, 0, 100))
  fam.label = Math.round(clampN(fam.label + u * 14 + (job.rank >= 4 ? 4 : 0), 0, 100))
  if (u <= 0.15) return ''
  const name = p.firstName
  if (job.kind === 'cushy') return `The staff at ${a.name} can see ${name} has a title and nothing to do. Nobody says it out loud.`
  if (u >= 0.6) return `Word got around ${a.name} that ${name} was ${verb} past ${p.gender === 'male' ? 'his' : 'her'} depth. Morale dipped.`
  return `A few people at ${a.name} noticed who ${name}'s ${p.gender === 'male' ? 'father' : 'mother'} is. They went back to work.`
}

/** The occupation line on the person's sheet. */
function setOccupation(p: Person, job: FamilyJob, a: Asset): void {
  if (p.age >= 18) p.occupation = `${job.title} at ${a.name}`
}

// ---------------------------------------------------------------------------
// Hiring

export interface Outsider {
  firstName: string
  lastName: string
  gender: 'male' | 'female'
  age: number
  kin: string
  smarts: number
  traits: string[]
  entitlement: number
}

/** The stand-in id an outsider is shown with before they are hired (their rolls keep this key afterwards). */
export function pseudoId(o: Outsider): string {
  return `out.${o.firstName}.${o.lastName}.${o.kin}.${o.age}.${o.smarts}`
}

/** Add an in-law or a cousin to the contact list (they are only added if they are hired). */
export function materialize(g: GameState, b: BizState, o: Outsider): Person {
  const p = createPerson(g, {
    relation: 'coworker',
    age: o.age,
    gender: o.gender,
    firstName: o.firstName,
    lastName: o.lastName,
    countryId: b.countryId,
    relationship: randInt(g, 55, 80),
    traits: o.traits,
    stats: { smarts: o.smarts },
    data: { kin: o.kin, nepoSeed: pseudoId(o), countryId: b.countryId, ...(o.entitlement > 0 ? { entitlement: o.entitlement } : {}) },
  })
  if (o.entitlement >= 60 && !p.traits.includes('spoiled')) p.traits = [...p.traits, 'spoiled']
  return p
}

/** A fresh random outsider relative (a cousin, a brother-in-law...) for the ask popups. */
export function rollOutsider(g: GameState, b: BizState, kin: string, gender: 'male' | 'female', lastName?: string): Outsider {
  const traitPool = ['ambitious', 'lazy', 'outgoing', 'serious', 'funny', 'shy', 'optimistic', 'honest', 'arrogant', 'calm']
  const t1 = traitPool[randInt(g, 0, traitPool.length - 1)]
  const t2 = traitPool[randInt(g, 0, traitPool.length - 1)]
  return {
    firstName: randomFirstName(g, b.countryId, gender),
    lastName: lastName ?? randomLastName(g, b.countryId),
    gender,
    age: randInt(g, 22, 48),
    kin,
    smarts: randInt(g, 25, 85),
    traits: t1 === t2 ? [t1] : [t1, t2],
    entitlement: chance(g, 0.2) ? randInt(g, 40, 75) : 0,
  }
}

export interface HireResult {
  ok: boolean
  /** The board said no (a notice already told the owner). */
  voted?: boolean
  reason?: string
}

/**
 * Give a relative a job at the company. A vote first when it is an executive job, a made-up one
 * or well above the going rate. Returns what happened; popups and the log say it too.
 */
export function hireRelative(g: GameState, a: Asset, b: BizState, p: Person, o: HireOpts, ctx: { quiet?: boolean; asked?: boolean } = {}): HireResult {
  const plan = planHire(g, b, p, o)
  const block = planBlock(g, b, p, plan)
  if (block) return { ok: false, reason: block }
  const proposal = planProposal(p, plan)
  if (needsVote(g, a, b, proposal) && !boardAllows(g, a, b, proposal)) {
    addRelationship(p, -randInt(g, 1, 4))
    return { ok: false, voted: true, reason: 'The board turned it down.' }
  }
  const job: FamilyJob = {
    assetId: a.id,
    rank: plan.rank,
    focus: plan.focus,
    kind: plan.kind,
    title: plan.title,
    since: g.year,
    rankSince: g.year,
    pay: plan.pay,
    skill: plan.skill,
    mood: 72 + (ctx.asked ? 8 : 0),
    perf: 0,
    raised: 0,
    unpaid: 0,
    burn: 0,
    part: plan.part,
    groom: false,
    by: g.character.id,
    kin: typeof p.data.kin === 'string' ? p.data.kin : '',
  }
  job.perf = Math.round(expectedRating(job.skill, job.rank, job.mood))
  writeJob(p, job)
  delete p.data.nepoPast
  delete p.data.nepoGrudge
  setOccupation(p, job, a)
  const fam = familyOf(b)
  fam.hires += 1
  addRelationship(p, randInt(g, 5, 10))
  p.stats.happiness = clampN(p.stats.happiness + 5, 0, 100)
  // A made-up job spoils; a real job that is too big spoils a little; earning a place at the bottom does not.
  if (plan.kind === 'cushy') addEntitlement(p, randInt(g, 6, 12))
  else if (fitOf(job.skill, job.rank) < -10) addEntitlement(p, randInt(g, 1, 4))
  else if (job.rank <= 1 && entitlement(p) > 0) addEntitlement(p, -2)
  notePerson(p, `${plan.part ? 'Took a summer job' : 'Started'} as ${plan.title} at ${a.name} (age ${p.age}).`)
  count(g, 'familyHires')
  const reaction = staffReaction(g, a, b, p, job, 'hired')
  log(g, `I ${plan.kind === 'cushy' ? 'made up a job for' : 'hired'} ${myKin(p)}: ${plan.title} at ${a.name}.`, plan.kind === 'cushy' ? 'neutral' : 'good')
  if (!ctx.quiet) {
    const he = p.gender === 'male' ? 'He' : 'She'
    notice(
      g,
      plan.kind === 'cushy' ? 'A Job Appears' : plan.part ? 'Summer Job' : 'Welcome to the Family Business',
      `${p.firstName} ${plan.part ? 'will spend the summer at' : 'starts Monday at'} ${a.name} as ${plan.title}, paid ${money(plan.pay)} a year${plan.part ? ' (summer pay)' : ''} out of company cash. ${he} ${plan.kind === 'cushy' ? 'was given a desk, a title and no instructions.' : 'is very excited and has already ordered business cards.'}${reaction ? ` ${reaction}` : ''}`,
      { emoji: plan.kind === 'cushy' ? '\u{1F6CB}\u{FE0F}' : '\u{1F454}', tone: 'good' },
    )
  }
  if (o.groom) designateSuccessor(g, a, b, p, { quiet: ctx.quiet })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Moving up and down

/** Pay after a move to another rank: keep the same multiple of the going rate (at least the going rate when moving up). */
function movedPay(b: BizState, job: FamilyJob, to: number): number {
  const ratio = clampN(job.pay / Math.max(1, marketPay(b, job.rank)), to > job.rank ? 1 : 0.7, 2)
  return payAt(b, to, ratio)
}

export interface MovePlan {
  to: number
  title: string
  pay: number
  market: number
  skill: number
  cushy: boolean
}

/** The promotion (or demotion) of a relative by one rank (pure). */
export function movePlan(g: GameState, b: BizState, p: Person, job: FamilyJob, dir: 1 | -1): MovePlan | null {
  const to = job.rank + dir
  if (to < 0 || to >= 5) return null
  if (job.kind === 'cushy') return null
  return { to, title: titleFor(g, p, to, job.focus, 'real'), pay: movedPay(b, job, to), market: marketPay(b, to), skill: job.skill, cushy: false }
}

export function movePlanProposal(p: Person, m: MovePlan): Proposal {
  return { kind: 'familyHire', by: 'owner', amount: m.pay, skill: m.skill, rank: m.to, market: m.market, cushy: false, label: `Promote ${yourKin(p)} to ${m.title} at ${money(m.pay)} a year` }
}

export function promote(g: GameState, a: Asset, b: BizState, p: Person): HireResult {
  const job = readJob(p)
  if (!job || job.assetId !== a.id) return { ok: false, reason: 'They do not work here.' }
  const m = movePlan(g, b, p, job, 1)
  if (!m) return { ok: false, reason: job.kind === 'cushy' ? 'A made-up job has nowhere to go but out.' : 'This is as high as it goes (the CEO job has its own button).' }
  const age = ageBlock(p, m.to)
  if (age) return { ok: false, reason: age }
  const proposal = movePlanProposal(p, m)
  if (needsVote(g, a, b, proposal) && !boardAllows(g, a, b, proposal)) {
    addRelationship(p, -randInt(g, 1, 3))
    job.mood = clampN(job.mood - 8, 0, 100)
    writeJob(p, job)
    return { ok: false, voted: true, reason: 'The board turned it down.' }
  }
  job.rank = m.to
  job.title = m.title
  job.pay = m.pay
  job.rankSince = g.year
  job.mood = clampN(job.mood + 14, 0, 100)
  job.burn = 0
  job.part = false
  job.perf = Math.round(expectedRating(job.skill, job.rank, job.mood))
  writeJob(p, job)
  setOccupation(p, job, a)
  addRelationship(p, randInt(g, 3, 6))
  if (fitOf(job.skill, job.rank) < -10) addEntitlement(p, randInt(g, 1, 3))
  const reaction = staffReaction(g, a, b, p, job, 'promoted')
  notePerson(p, `Promoted to ${m.title} at ${a.name} (age ${p.age}).`)
  log(g, `I promoted ${myKin(p)} to ${m.title} at ${a.name}.`, 'good')
  notice(g, 'Promotion', `${p.firstName} is now ${m.title} at ${a.name}, paid ${money(m.pay)} a year.${reaction ? ` ${reaction}` : ''}`, { emoji: '\u{1F4C8}', tone: 'good' })
  return { ok: true }
}

export function demote(g: GameState, a: Asset, b: BizState, p: Person): HireResult {
  const job = readJob(p)
  if (!job || job.assetId !== a.id) return { ok: false, reason: 'They do not work here.' }
  if (isCeoOf(b, p)) return stepDownCeo(g, a, b, p)
  const m = movePlan(g, b, p, job, -1)
  if (!m) return { ok: false, reason: job.kind === 'cushy' ? 'A made-up job cannot be demoted. Let them go instead.' : 'They are already at the bottom.' }
  const entitled = entitlement(p) >= 60
  job.rank = m.to
  job.title = m.title
  job.pay = m.pay
  job.rankSince = g.year
  job.mood = clampN(job.mood - 22, 0, 100)
  job.burn = 0
  job.perf = Math.round(expectedRating(job.skill, job.rank, job.mood))
  writeJob(p, job)
  setOccupation(p, job, a)
  addRelationship(p, -(entitled ? 14 : 7))
  const fam = familyOf(b)
  fam.resent = Math.round(clampN(fam.resent - 6, 0, 100))
  if (job.groom) clearIf(b, p)
  notePerson(p, `Demoted to ${m.title} at ${a.name} (age ${p.age}).`)
  log(g, `I demoted ${myKin(p)} to ${m.title}.`, 'neutral')
  notice(g, 'Demotion', `${p.firstName} is now ${m.title}, paid ${money(m.pay)} a year. ${p.gender === 'male' ? 'He' : 'She'} took it ${entitled ? 'about as well as a cat takes a bath' : 'quietly, which is worse'}.`, { emoji: '\u{1F4C9}', tone: 'bad' })
  return { ok: true }
}

function clearIf(b: BizState, p: Person): void {
  const fam = familyOf(b)
  if (fam.succ.kind === 'person' && fam.succ.id === p.id) fam.succ = { kind: '', id: '' }
  const j = readJob(p)
  if (j && j.groom) {
    j.groom = false
    writeJob(p, j)
  }
}

// ---------------------------------------------------------------------------
// Pay

/** The pay proposal for a raise or a cut (pure). */
export function payProposal(p: Person, job: FamilyJob, b: BizState, pay: number): Proposal {
  return { kind: 'familyHire', by: 'owner', amount: pay, skill: job.skill, rank: job.rank, market: marketPay(b, job.rank), cushy: job.kind === 'cushy', label: `Pay ${yourKin(p)} ${money(pay)} a year as ${job.title}` }
}

/** How much a pay change moves their mood: a raise pleases, a cut hurts twice as much. */
export function payMood(job: FamilyJob, market: number, to: number): number {
  const was = job.pay / Math.max(1, market)
  const now = to / Math.max(1, market)
  const d = now - was
  return Math.round(clampN(d > 0 ? d * 30 : d * 60, -35, 20))
}

export function setPay(g: GameState, a: Asset, b: BizState, p: Person, mult: number): HireResult {
  const job = readJob(p)
  if (!job || job.assetId !== a.id) return { ok: false, reason: 'They do not work here.' }
  if (job.part) return { ok: false, reason: `${p.firstName}'s summer job pays the summer rate until ${p.gender === 'male' ? 'he' : 'she'} turns 18.` }
  const market = marketPay(b, job.rank)
  const pay = payAt(b, job.rank, mult)
  if (Math.abs(pay - job.pay) < Math.max(1, market * 0.02)) return { ok: false, reason: 'That is about what they earn now.' }
  const proposal = payProposal(p, job, b, pay)
  if (pay > job.pay && needsVote(g, a, b, proposal) && !boardAllows(g, a, b, proposal)) {
    job.mood = clampN(job.mood - 6, 0, 100)
    writeJob(p, job)
    return { ok: false, voted: true, reason: 'The board turned it down.' }
  }
  const mood = payMood(job, market, pay)
  const was = job.pay
  job.pay = pay
  job.mood = clampN(job.mood + mood, 0, 100)
  if (pay > was) job.raised = g.year
  job.unpaid = 0
  writeJob(p, job)
  if (isCeoOf(b, p) && b.manager) b.manager.salary = pay
  const fam = familyOf(b)
  const u = unearned(job, market)
  if (pay > was) fam.resent = Math.round(clampN(fam.resent + Math.max(0, u * 6), 0, 100))
  log(g, pay > was ? `I gave ${myKin(p)} a raise to ${money(pay)} a year.` : `I cut ${myKin(p)}'s pay to ${money(pay)} a year.`, pay > was ? 'good' : 'neutral')
  notice(g, pay > was ? 'Raise' : 'Pay Cut', `${p.firstName} will earn ${formatMoney(pay)} a year at ${a.name} (${pct(pay / Math.max(1, market))} of the going rate for ${job.title}). ${pay > was ? 'The thank-you was warm and brief.' : 'The thank-you was missing.'}`, { emoji: pay > was ? '\u{1F4B5}' : '\u{1F4C9}', tone: pay > was ? 'good' : 'bad' })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Letting go

/** Severance for a relative: the same labor law as anyone else. */
export function severanceFor(b: BizState, job: Pick<FamilyJob, 'pay'>): number {
  return Math.round((job.pay * severanceMonths(b.countryId)) / 12)
}

/** The relative's job ends: the record moves to their past, their sheet goes back to ordinary. */
export function endJob(g: GameState, a: Asset, b: BizState, p: Person, how: 'fired' | 'quit' | 'startup' | 'poached' | 'burnout' | 'closed' | 'replaced'): FamilyJob | null {
  const job = readJob(p)
  if (!job) return null
  writePast(p, { assetId: a.id, year: g.year, how, rank: job.rank })
  delete p.data.nepo
  clearIf(b, p)
  if (p.age >= 18 && /\bat\b/.test(p.occupation)) p.occupation = how === 'startup' ? 'Founder' : how === 'poached' ? 'Executive' : 'Unemployed'
  return job
}

export function fire(g: GameState, a: Asset, b: BizState, p: Person): HireResult {
  const job = readJob(p)
  if (!job || job.assetId !== a.id) return { ok: false, reason: 'They do not work here.' }
  const sev = severanceFor(b, job)
  const ceo = isCeoOf(b, p)
  if (ceo) {
    const r = replaceCeo(g, a, b, p, false)
    if (!r.ok) return r
  }
  const stillThere = readJob(p)
  if (stillThere) endJob(g, a, b, p, 'fired')
  if (!ceo && sev > 0) {
    b.cash -= sev
    b.yearCosts += sev
    // The relative is a real person: the severance is theirs, taxed like their pay.
    p.money = Math.round(p.money + Math.max(0, sev - incomeTax(b.countryId, sev)))
  }
  b.morale = clampN(b.morale - 3, 0, 100)
  const fam = familyOf(b)
  fam.fired += 1
  fam.resent = Math.round(clampN(fam.resent - 4, 0, 100))
  const kid = p.relation === 'child' || p.relation === 'stepchild' || p.relation === 'grandchild'
  const entitled = entitlement(p) >= 60
  addRelationship(p, -randInt(g, kid ? 22 : 16, kid ? 38 : 30) - (entitled ? 6 : 0))
  p.data.nepoGrudge = g.year
  p.stats.happiness = clampN(p.stats.happiness - 12, 0, 100)
  if (kid) addStat(g, 'happiness', -5)
  else addStat(g, 'happiness', -2)
  // The rest of the family takes sides.
  for (const q of g.people) {
    if (!q.alive || q.id === p.id) continue
    if (readJob(q)?.assetId === a.id) {
      const j2 = readJob(q)
      if (j2) {
        j2.mood = clampN(j2.mood - 5, 0, 100)
        writeJob(q, j2)
      }
    }
  }
  const he = p.gender === 'male' ? 'He' : 'She'
  let extra = ''
  if (chance(g, laborProtection(b.countryId) * 0.2 + (entitled ? 0.1 : 0.02))) {
    const cost = Math.round(job.pay * (0.5 + rand(g)))
    b.cash -= cost
    b.yearCosts += cost
    p.money = Math.round(p.money + cost)
    extra = ` ${he} sued for wrongful dismissal and the company settled for ${formatMoney(cost)}.`
  }
  notePerson(p, `Fired from ${a.name} (age ${p.age}).`)
  count(g, 'familyFired')
  log(g, `I fired ${myKin(p)} from ${a.name}.`, 'bad')
  remember(g, `Fired ${kid ? 'my own ' + (p.gender === 'male' ? 'son' : 'daughter') : p.firstName} from ${a.name}.`)
  const holiday = kid || p.relation === 'sibling' ? ' The next family holiday is going to be very quiet.' : ''
  const will = kid ? ` ${he} also asked, in a very level voice, whether ${p.gender === 'male' ? 'he' : 'she'} was still in your will.` : ''
  notice(g, 'Let Go', `You let ${p.firstName} go from ${a.name}${!ceo && sev > 0 ? ` (severance ${formatMoney(sev)}, as the law in ${getCountry(b.countryId).name} requires)` : ''}.${extra}${holiday}${will}`, { emoji: '\u{1F4E6}', tone: 'bad' })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// The top job

/** Pay for a relative as CEO: what the market asks for someone of their skill. */
export function ceoPayFor(b: BizState, job: Pick<FamilyJob, 'skill'>): number {
  return askingSalary(b, Math.round(job.skill), 0)
}

export function ceoProposal(p: Person, job: FamilyJob, b: BizState, pay: number): Proposal {
  return { kind: 'familyHire', by: 'owner', amount: pay, skill: job.skill, rank: 5, market: marketPay(b, 5), cushy: false, label: `Make ${yourKin(p)} CEO at ${money(pay)} a year` }
}

export function ceoBlock(_g: GameState, b: BizState, p: Person, job: FamilyJob): string | null {
  if (job.kind === 'cushy') return 'A made-up job is not a path to the top. Give them a real one first.'
  if (p.age < CEO_MIN_AGE) return `${p.firstName} is too young to run a company (${CEO_MIN_AGE} and up).`
  if (isCeoOf(b, p)) return `${p.firstName} is already CEO.`
  return null
}

/**
 * Make a relative the company's CEO: they become the hired-CEO model (their real skill, a CEO
 * contract). The owner steps down, or a hired CEO is bought out. Goes to the board when there is one.
 */
export function makeCeo(g: GameState, a: Asset, b: BizState, p: Person): HireResult {
  const job = readJob(p)
  if (!job || job.assetId !== a.id) return { ok: false, reason: 'They do not work here.' }
  const block = ceoBlock(g, b, p, job)
  if (block) return { ok: false, reason: block }
  const pay = ceoPayFor(b, job)
  const proposal = ceoProposal(p, job, b, pay)
  if (needsVote(g, a, b, proposal) && !boardAllows(g, a, b, proposal)) {
    job.mood = clampN(job.mood - 10, 0, 100)
    writeJob(p, job)
    addRelationship(p, -randInt(g, 2, 6))
    return { ok: false, voted: true, reason: 'The board turned it down.' }
  }
  const m = managerFromPerson(g, p, { ...job }, pay)
  const prev = b.ceo === 'manager' && b.manager ? b.manager.firstName + ' ' + b.manager.lastName : null
  const owner = runsIt(g, a)
  const h = handOver(g, a, b, m)
  settleAfterCeoChange(g, b)
  const formerFamilyCeo = h.outgoing?.personId ? g.people.find((x) => x.id === h.outgoing?.personId) : undefined
  if (formerFamilyCeo && formerFamilyCeo.id !== p.id) settleReplacedCeo(g, a, b, formerFamilyCeo)
  const done = readJob(p)
  if (done) {
    promoteToCeo(g, p, done, pay)
    const fam = familyOf(b)
    fam.succ = fam.succ.kind === 'person' && fam.succ.id === p.id ? { kind: '', id: '' } : fam.succ
    const u = unearned({ ...done, rank: 5, skill: done.skill, kind: 'real', pay }, marketPay(b, 5))
    const gap = clampN((85 - done.skill) / 85, 0, 1)
    fam.label = Math.round(clampN(fam.label + 10 + gap * 25 + u * 6, 0, 100))
    fam.resent = Math.round(clampN(fam.resent + gap * 18, 0, 100))
    b.morale = clampN(b.morale - Math.round(gap * 5), 0, 100)
  }
  addRelationship(p, randInt(g, 8, 14))
  p.stats.happiness = clampN(p.stats.happiness + 10, 0, 100)
  notePerson(p, `Became CEO of ${a.name} (age ${p.age}).`)
  count(g, 'familyCeos')
  log(g, `I made ${myKin(p)} the CEO of ${a.name}.`, 'good')
  notice(g, 'A New CEO', `${p.firstName} ${p.lastName} is now CEO of ${a.name} at ${formatMoney(pay)} a year.${owner ? ` You step back from day-to-day running (you still own ${pct(b.share)}).` : prev ? ` ${prev} was bought out${h.severance > 0 ? ` for ${formatMoney(h.severance)}` : ''}.` : ''}`, { emoji: '\u{1F451}', tone: 'good' })
  return { ok: true }
}

/**
 * Normalize a relative who still carries the CEO job after somebody else took the chair. The
 * family-specific replacement action and the ordinary Leadership shortlist both use this path so
 * a company can never keep two relatives on its books as CEO.
 */
function demoteFormerCeo(g: GameState, a: Asset, b: BizState, p: Person, payCap: number): FamilyJob | null {
  if (isCeoOf(b, p)) return null
  const job = readJob(p)
  if (!job || job.assetId !== a.id || job.rank < 5) return null
  job.rank = 4
  job.title = titleFor(g, p, 4, job.focus, 'real')
  job.pay = Math.min(job.pay, payCap)
  job.rankSince = g.year
  job.groom = false
  writeJob(p, job)
  setOccupation(p, job, a)
  return job
}

/** Settle a family CEO displaced outside the family-specific action (board, sale, normal shortlist). */
export function settleReplacedCeo(g: GameState, a: Asset, b: BizState, p: Person): boolean {
  const job = demoteFormerCeo(g, a, b, p, marketPay(b, 4) * 1.5)
  if (!job) return false
  job.mood = clampN(job.mood - 25, 0, 100)
  writeJob(p, job)
  addRelationship(p, -randInt(g, 4, 9))
  log(g, `${p.firstName} is no longer CEO of ${a.name}.`, 'neutral')
  return true
}

/** Replace a relative who is CEO with an outside manager (they stay on as a VP, or leave). */
export function replaceCeo(g: GameState, a: Asset, b: BizState, p: Person, stay: boolean): HireResult {
  if (!isCeoOf(b, p)) return { ok: false, reason: `${p.firstName} is not the CEO.` }
  const job = readJob(p)
  if (!job) return { ok: false, reason: 'They do not work here.' }
  const next = managerCandidate(g, b, randInt(g, 50, 72))
  handOver(g, a, b, next)
  settleAfterCeoChange(g, b)
  if (stay) demoteFormerCeo(g, a, b, p, payAt(b, 4, 1.6))
  return { ok: true }
}

function stepDownCeo(g: GameState, a: Asset, b: BizState, p: Person): HireResult {
  const job = readJob(p)
  const r = replaceCeo(g, a, b, p, true)
  if (!r.ok || !job) return r
  const cur = readJob(p)
  if (cur) {
    cur.mood = clampN(cur.mood - 25, 0, 100)
    writeJob(p, cur)
  }
  addRelationship(p, -randInt(g, 10, 18))
  notePerson(p, `Stepped down as CEO of ${a.name} at ${p.age}.`)
  log(g, `I replaced ${myKin(p)} as CEO of ${a.name} with an outside manager.`, 'neutral')
  notice(g, 'Stepping Down', `${p.firstName} is out as CEO of ${a.name} and back to ${cur?.title ?? 'the team'}. ${b.manager ? `${b.manager.firstName} ${b.manager.lastName} (skill ${b.manager.skill}) is running the company now.` : ''} ${p.gender === 'male' ? 'He' : 'She'} will remember this at the next family dinner.`, { emoji: '\u{1FA91}', tone: 'bad' })
  return r
}

// ---------------------------------------------------------------------------
// Succession

export type SuccessorTarget = { kind: 'person'; id: string } | { kind: 'staff'; id: string }

/** Why this person can't be named successor (null: they can). */
export function successorBlock(p: Person, job: FamilyJob): string | null {
  if (job.kind === 'cushy') return 'A made-up job is not a path to the top.'
  if (p.age < CEO_MIN_AGE - 1) return `${p.firstName} is too young to be groomed for the top (${CEO_MIN_AGE - 1} and up).`
  return null
}

/**
 * Name a relative as the person to run the company when you stop. With a board it is a vote on the
 * plan (the same self-dealing question as making them CEO). They are mentored: they learn faster.
 */
export function designateSuccessor(g: GameState, a: Asset, b: BizState, p: Person, ctx: { quiet?: boolean } = {}): HireResult {
  const job = readJob(p)
  if (!job || job.assetId !== a.id) return { ok: false, reason: 'They do not work here.' }
  const block = successorBlock(p, job)
  if (block) return { ok: false, reason: block }
  const proposal = ceoProposal(p, job, b, ceoPayFor(b, job))
  if (needsVote(g, a, b, { ...proposal, label: `Name ${yourKin(p)} as the next CEO` }) && !boardAllows(g, a, b, { ...proposal, label: `Name ${yourKin(p)} as the next CEO` })) {
    return { ok: false, voted: true, reason: 'The board turned it down.' }
  }
  const fam = familyOf(b)
  const prev = fam.succ.kind === 'person' ? g.people.find((x) => x.id === fam.succ.id) : undefined
  if (prev && prev.id !== p.id) {
    const pj = readJob(prev)
    if (pj) {
      pj.groom = false
      pj.mood = clampN(pj.mood - 12, 0, 100)
      writeJob(prev, pj)
    }
    addRelationship(prev, -randInt(g, 4, 9))
  }
  fam.succ = { kind: 'person', id: p.id }
  job.groom = true
  job.mood = clampN(job.mood + 8, 0, 100)
  writeJob(p, job)
  addRelationship(p, randInt(g, 3, 7))
  // The others who work here and were not chosen notice.
  for (const q of g.people) {
    if (!q.alive || q.id === p.id) continue
    const j = readJob(q)
    if (j && j.assetId === a.id && (q.relation === 'child' || q.relation === 'stepchild') && j.kind === 'real') {
      j.mood = clampN(j.mood - 6, 0, 100)
      writeJob(q, j)
    }
  }
  notePerson(p, `Named as the next head of ${a.name} (age ${p.age}).`)
  log(g, `I named ${myKin(p)} as my successor at ${a.name}.`, 'good')
  if (!ctx.quiet) notice(g, 'The Heir Apparent', `${p.firstName} is now being groomed to run ${a.name} one day. ${p.gender === 'male' ? 'He' : 'She'} gets your attention, your mentoring and a seat next to you in meetings. The others noticed the seat.`, { emoji: '\u{1F451}', tone: 'good' })
  return { ok: true }
}

export function designateStaff(g: GameState, a: Asset, b: BizState, staffId: string): HireResult {
  const s = b.staff.find((x) => x.id === staffId)
  if (!s) return { ok: false, reason: 'They no longer work here.' }
  const fam = familyOf(b)
  const prev = fam.succ.kind === 'person' ? g.people.find((x) => x.id === fam.succ.id) : undefined
  if (prev) {
    const pj = readJob(prev)
    if (pj) {
      pj.groom = false
      writeJob(prev, pj)
    }
  }
  fam.succ = { kind: 'staff', id: s.id }
  log(g, `I named ${s.firstName} ${s.lastName} as my successor at ${a.name}.`)
  notice(g, 'A Succession Plan', `${s.firstName} ${s.lastName}, ${a.name}'s ${s.role}, is the person you want to run the company when you stop.`, { emoji: '\u{1F4CB}' })
  return { ok: true }
}

export function clearSuccessor(g: GameState, b: BizState): void {
  const fam = familyOf(b)
  if (fam.succ.kind === 'person') {
    const p = g.people.find((x) => x.id === fam.succ.id)
    const j = p ? readJob(p) : null
    if (p && j) {
      j.groom = false
      writeJob(p, j)
    }
  }
  fam.succ = { kind: '', id: '' }
}

/** Pass the CEO job to the successor now (the owner keeps the shares). */
export function handOverToSuccessor(g: GameState, a: Asset, b: BizState): HireResult {
  const st = readFamily(b.family)
  if (!st.succ.kind) return { ok: false, reason: 'You have not named a successor.' }
  const m = successorManager(g, a, b, (skill) => askingSalary(b, skill, 0))
  if (!m) return { ok: false, reason: 'Your successor is not ready or no longer here.' }
  const p = m.personId ? g.people.find((x) => x.id === m.personId) : undefined
  const job = p ? readJob(p) : null
  if (p && job) {
    const proposal = ceoProposal(p, job, b, m.salary)
    if (needsVote(g, a, b, proposal) && !boardAllows(g, a, b, proposal)) return { ok: false, voted: true, reason: 'The board turned it down.' }
  }
  const owner = runsIt(g, a) || !!ceoJob(g, a.id)
  const h = handOver(g, a, b, m)
  settleAfterCeoChange(g, b)
  const formerFamilyCeo = h.outgoing?.personId ? g.people.find((x) => x.id === h.outgoing?.personId) : undefined
  if (formerFamilyCeo && formerFamilyCeo.id !== p?.id) settleReplacedCeo(g, a, b, formerFamilyCeo)
  afterSuccession(g, a, b, m)
  if (p) {
    addRelationship(p, randInt(g, 6, 12))
    const fam = familyOf(b)
    const gap = clampN((85 - m.skill) / 85, 0, 1)
    fam.label = Math.round(clampN(fam.label + 8 + gap * 25, 0, 100))
    fam.resent = Math.round(clampN(fam.resent + gap * 14, 0, 100))
    b.morale = clampN(b.morale - Math.round(gap * 4), 0, 100)
    notePerson(p, `Took over ${a.name} as CEO (age ${p.age}).`)
  }
  count(g, 'familyCeos')
  log(g, `I handed ${a.name} to ${m.firstName} ${m.lastName}.`, 'good')
  remember(g, `Handed ${a.name} over to ${m.firstName} ${m.lastName}.`)
  notice(g, 'The Handover', `${m.firstName} ${m.lastName} is now CEO of ${a.name} at ${formatMoney(m.salary)} a year (skill ${m.skill}).${owner ? ` You step back and keep your ${pct(b.share)} of the company.` : ''}${h.severance > 0 && h.outgoing ? ` The outgoing CEO's contract cost ${formatMoney(h.severance)}.` : ''}`, { emoji: '\u{1F451}', tone: 'good' })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Looking things up from a menu (live company)

/** The live business and its mutable state, or null when it is gone. */
export function liveBiz(g: GameState, assetId: string): { a: Asset; b: BizState } | null {
  const a = findBusiness(g, assetId)
  return a ? { a, b: bizOf(g, a) } : null
}

/** Odds the board says yes to a plan (1 when there is no vote; pure). */
export function planOdds(g: GameState, a: Asset, b: BizState, proposal: Proposal): number {
  return needsVote(g, a, b, proposal) ? passOdds(g, a, b, proposal) : 1
}
