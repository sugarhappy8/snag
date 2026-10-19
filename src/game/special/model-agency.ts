// Model 2.0 agency: signing, the contract kept in Job.data.contract, switching agencies, the renewal choice at the
// end of a term and the contract and switch rows. A legacy job is adopted by writing the contract it reads as
// (a Guarantee, exclusive, commission base + 3, two years from the first tick); the legacy special.model flag is
// never written. Every cash move goes through c.earn and c.pay; menus read `view` only. Imports from model.ts are
// used inside function bodies only: model.ts imports this file (through model-board.ts), not the other way round.
import { fullName, remember } from '../core'
import { chance } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent } from '../talents'
import type { ChoiceOption, GameState, Job, Json, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../types'
import { addColleague, blocked, hire, leave, money } from './common'
import { honest, oddsText } from './kit/crisis'
import { gatedAction } from './kit/menu'
import { cap } from './kit/state'
import { careerCtx, careerLog, careerSay, claimChoice, fit, offerChoice, type CareerCtx } from './kit/year'
import { AGENCIES, RANKS, RANK_MULT, looksBar, modelJob, viewModel } from './model'
import { commissionFor, lookValue, renewalOdds } from './model-core'
import { FACE_AGENCIES, TERM_YEARS, agencyOpen } from './model-data'
import { contractKey, modelStore, readContract, type MdContract, type ModelState } from './model-state'

export const RENEWAL_SCRIPT = 'career.model.renewal'
/** A contract is not renewed when the mood is under 35 or the look under 28. */
export const DROP = { mood: 35, look: 28 } as const
/** Years the mother agency keeps its 5% override after you leave. */
export const MOTHER_YEARS = 8
export const MOTHER_PCT = 5
/** Release fee when you leave mid-term: half of last year's commission, at least this. */
const RELEASE_MIN = 2_000
const ADVANCE = 3_000

const CONTRACT = '\u{1F4DD}'
const SWITCH = '\u{1F501}'
const LINE = 90

export type Terms = 'guarantee' | 'commission'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const info = (id: string, text: string): MenuInfo => ({ type: 'info', id, text: fit(text, LINE) })
const termsOf = (kind: Terms): string => (kind === 'guarantee' ? 'guarantee' : 'commission only')

// ---------------------------------------------------------------------------
// The contract in the job

/** The retainer a Guarantee pays: the agency's retainer times the title multiplier. */
export function retainerFor(tier: number, level: number): number {
  const a = AGENCIES[clamp(Math.round(fin(tier)), 0, AGENCIES.length - 1)]
  return Math.round(a.retainer * (RANK_MULT[clamp(Math.round(fin(level)), 0, RANK_MULT.length - 1)] ?? 1))
}

const storedContract = (job: Job): boolean => !!job.data.contract && typeof job.data.contract === 'object' && !Array.isArray(job.data.contract)

/** Writes `k` (normalized) as the job's contract. */
export function saveContract(job: Job, k: MdContract): void {
  job.data.contract = { ...k } as unknown as Json
}

/**
 * The model job's contract, written into Job.data.contract when it has none (a legacy job reads as a Guarantee,
 * exclusive, commission base + 3, two years from now). A stored contract of another job is replaced. Null for a job
 * that is not a model job. Actions and settle bodies only.
 */
export function ensureContract(g: GameState, job: Job): MdContract | null {
  let k = readContract(job, g)
  if (!k && job.defId === 'model') {
    delete job.data.contract
    k = readContract(job, g)
  }
  if (k && !storedContract(job)) saveContract(job, k)
  return k
}

/**
 * Takes a legacy job (or one signed by the legacy scripts) into the record: its contract, the mother agency and
 * the agency history. Writes only what is missing, so a second call changes nothing.
 */
export function adoptJob(g: GameState, s: ModelState, job: Job): void {
  if (!Number.isFinite(job.salary)) job.salary = 0 // a damaged job never reaches the ledger or the career history as NaN
  // a job the legacy scripts signed (no contract yet): the legacy hook pays its retainer this tick, so that is the floor
  if (!storedContract(job)) s.floor = Math.max(0, Math.round(fin(job.salary)))
  ensureContract(g, job)
  const year = g.year
  if (!s.mother) s.mother = { agency: job.company, booker: '', since: year, overrideUntil: 0 }
  if (!s.agencies.some((a) => a.to === 0 && a.name === job.company)) {
    for (const a of s.agencies) if (a.to === 0) a.to = year
    s.agencies = cap([...s.agencies, { name: job.company, from: Math.max(0, year - Math.max(0, fin(job.yearsAtCompany))), to: 0 }], 8)
  }
}

/** The override the mother agency takes on a fee booked now: 5% while it lasts, else 0. */
export function motherPct(s: ModelState, year: number): number {
  return s.mother && s.mother.overrideUntil >= year ? MOTHER_PCT : 0
}

// ---------------------------------------------------------------------------
// Agencies: gates and the release fee

/** Why this agency would not sign you now (looks, headshots, book, age, era), or null. Pure: the apply gate and the hint share it. */
export function agencyBlock(g: GameState, s: ModelState, name: string): string | null {
  const a = AGENCIES.find((x) => x.name === name)
  const gate = Object.hasOwn(FACE_AGENCIES, name) ? FACE_AGENCIES[name] : undefined
  if (!a || !gate) return "That agency doesn't exist."
  if (!agencyOpen(name, g.year)) return `${name} hasn't opened yet.`
  const c = g.character
  const bar = looksBar(g, a)
  if (c.stats.looks < bar) return `${name} wants Looks ${bar}%+.`
  if (viewModel(g).headshot < a.headshot) return `${name} wants headshots at ${a.headshot}%+.`
  if (s.book < gate.book) return `${name} wants a book of ${gate.book}+.`
  if (c.age > 38 - a.tier * 2 + (hasTalent(g, 'Modeling') ? 4 : 0)) return `${name} is looking for fresher faces.`
  return null
}

/** The fee for leaving now: free once the term has run, else half of the latest year's commission, at least 2,000. Pure. */
export function releaseFee(g: GameState, s: ModelState, k: MdContract | null): number {
  if (!k || g.year >= k.until) return 0
  const last = s.ledger.reduce((m, r) => Math.max(m, r.year), 0)
  const commission = s.ledger.filter((r) => r.year === last).reduce((n, r) => n + r.agency, 0)
  return Math.max(RELEASE_MIN, Math.round(commission / 2))
}

/** Why you can't move to this agency right now, or null. */
export function switchBlock(g: GameState, s: ModelState, name: string): string | null {
  const job = modelJob(g)
  if (job && job.company === name) return 'You already work there.'
  const why = agencyBlock(g, s, name)
  if (why) return why
  const fee = releaseFee(g, s, job ? readContract(job, g) : null)
  return fee > 0 && g.character.money < fee ? `You can't cover the ${money(fee)} release fee.` : null
}

/** The best agency that would sign you right now and is a step up from yours, or null. Pure. */
export function bestSwitch(g: GameState, s: ModelState): string | null {
  const job = modelJob(g)
  const mine = AGENCIES.find((a) => a.name === job?.company)?.tier ?? -1
  const ok = AGENCIES.filter((a) => a.tier > mine && agencyBlock(g, s, a.name) === null)
  return ok.length ? ok[ok.length - 1].name : null
}

/** Freelance work is closed while an adopted exclusive contract runs. Pure. */
export function freelanceBlock(g: GameState): string | null {
  const job = modelJob(g)
  if (!job || !modelStore.has(g)) return null
  return readContract(job, g)?.exclusive ? 'Your contract is exclusive. Freelance work would breach it.' : null
}

// ---------------------------------------------------------------------------
// Signing

interface Carry {
  level: number
  performance: number
  sabotaged: number
}

/** Hires the model job at `agency` with a fresh contract. The caller has checked the gates and left any old model job. */
function sign(c: CareerCtx<ModelState>, agency: string, kind: Terms, carry: Carry | null): MdContract | null {
  const { g, s, year } = c
  const a = AGENCIES.find((x) => x.name === agency)
  if (!a) return null
  const guarantee = kind === 'guarantee'
  const level = clamp(Math.round(fin(carry?.level)), 0, RANKS.length - 1)
  const salary = guarantee ? retainerFor(a.tier, level) : 0
  const advance = g.character.age < 23 && s.book < 30 ? ADVANCE * (a.tier + 1) : 0
  const { job } = hire(g, { defId: 'model', title: RANKS[level], company: agency, salary, level, performance: carry?.performance, data: { tier: a.tier, gigsThisYear: 0, sabotaged: Math.round(fin(carry?.sabotaged)) } })
  const booker = addColleague(g, agency, 'Booker', { ageOffset: [-4, 16] })
  const k: MdContract = {
    appointmentId: contractKey(job),
    agency,
    tier: a.tier,
    commission: commissionFor(a.tier, s.rep, guarantee),
    guarantee,
    exclusive: guarantee,
    since: year,
    until: year + (TERM_YEARS[a.tier] ?? 2),
    advance,
    unrecouped: advance,
    bookerId: booker.id,
    bookerName: fullName(booker),
  }
  saveContract(job, k)
  s.floor = salary
  for (const row of s.agencies) if (row.to === 0) row.to = year
  s.agencies = cap([...s.agencies, { name: agency, from: year, to: 0 }], 8)
  if (!s.mother) s.mother = { agency, booker: k.bookerName, since: year, overrideUntil: 0 }
  if (advance > 0) c.earn('Agency advance', advance)
  return k
}

/**
 * Signs with an agency on one of two contracts. Guarantee: a retainer (the agency's retainer x the title multiplier),
 * exclusive, commission base + 3. Commission only: no retainer, not exclusive, base commission. The term runs 2 years
 * at tier 0, 3 at tiers 1 and 2, 4 at tier 3. Under 23 with a book under 30 the agency also advances 3,000 x (tier + 1),
 * booked as income and recouped from later fees. Actions and scripts only.
 */
export function signWith(c: CareerCtx<ModelState>, agency: string, kind: Terms): void {
  const k = sign(c, agency, kind, null)
  if (!k) return
  const { g } = c
  careerLog(c, `I signed with ${agency}.`, 'good')
  remember(g, `Signed with ${agency} as a model.`)
  careerSay(c, 'Signed', `${agency} signed you ${k.guarantee ? `on a guarantee of ${money(g.character.job?.salary ?? 0)} a year` : 'on commission only'}. The term runs to ${k.until}.`, CONTRACT, 'good')
}

/**
 * Moves to another agency: the new agency's gates, a release fee (free once the term has run) through c.pay, a mid-term
 * exit costs 10 reputation, and the old agency keeps a 5% override for 8 years. Done as leave then hire so the
 * appointment id changes and the old booker goes. The terms default to the ones you had. Actions and scripts only.
 */
export function switchAgency(c: CareerCtx<ModelState>, agency: string, kind?: Terms): void {
  const { g, s, year } = c
  const job = modelJob(g)
  const old = job ? readContract(job, g) : null
  const why = switchBlock(g, s, agency)
  if (why) {
    careerSay(c, 'Switch Agency', why, SWITCH)
    return
  }
  const fee = releaseFee(g, s, old)
  if (fee > 0 && !c.pay('Release fee', fee)) {
    careerSay(c, 'Switch Agency', `You can't cover the ${money(fee)} release fee.`, SWITCH)
    return
  }
  if (old && year < old.until) s.rep = clamp(Math.round((s.rep - 10) * 10) / 10, 0, 100)
  const from = job?.company ?? ''
  if (from && (!s.mother || s.mother.overrideUntil < year)) s.mother = { agency: from, booker: old?.bookerName ?? '', since: year, overrideUntil: year + MOTHER_YEARS }
  const carry: Carry | null = job ? { level: job.level, performance: job.performance, sabotaged: fin(job.data.sabotaged) } : null
  if (job) leave(g, 'quit')
  const k = sign(c, agency, kind ?? (old && !old.guarantee ? 'commission' : 'guarantee'), carry)
  if (!k) return
  careerLog(c, from ? `I left ${from} for ${agency}.` : `I signed with ${agency}.`, 'good')
  careerSay(c, 'New Agency', `${from ? `You left ${from} for ${agency}` : `You signed with ${agency}`}${fee > 0 ? ` and paid a ${money(fee)} release fee` : ''}. It's a ${termsOf(k.guarantee ? 'guarantee' : 'commission')} deal to ${k.until}.`, SWITCH, 'good')
}

// ---------------------------------------------------------------------------
// The end of a term

/** Moves the term on: a new term from now, and any advance still owed is written off (no debt). */
function renewTerm(job: Job, k: MdContract, year: number, commission = k.commission): MdContract {
  const next: MdContract = { ...k, commission: clamp(Math.round(commission), 12, 30), until: year + (TERM_YEARS[k.tier] ?? 2), advance: 0, unrecouped: 0 }
  saveContract(job, next)
  return next
}

/**
 * At the end of the term: mood under 35 or a look under 28 drops you (fired, a Dropped notice, the career history);
 * else the renewal takes the year's choice slot and waits a year when the slot is taken. Settle bodies only.
 */
export function contractEnd(c: CareerCtx<ModelState>): void {
  const { g, s, year } = c
  const job = modelJob(g)
  if (!job) return
  const k = readContract(job, g)
  if (!k || year < k.until) return
  const look = lookValue(g, s)
  if (s.mood < DROP.mood || look < DROP.look) {
    for (const row of s.agencies) if (row.to === 0) row.to = year
    leave(g, 'fired')
    careerLog(c, `${k.agency} dropped me.`, 'bad')
    careerSay(c, 'Dropped', `${k.agency} didn't renew you. ${s.mood < DROP.mood ? 'They said you seemed worn out.' : 'They said your look no longer fits their books.'}`, '\u{1F4C9}', 'bad')
    return
  }
  const push = oddsText(renewalOdds(s.rep, s.book))
  const choices: ChoiceOption[] = [
    { id: 'renew', label: 'Renew as is', emoji: CONTRACT },
    { id: 'push', label: 'Push for terms', emoji: '\u{1F4AA}', ...honest(g, 'Modeling', `${push.charAt(0).toUpperCase()}${push.slice(1)} the agent gives ground.`) },
    { id: 'walk', label: 'Walk away', emoji: '\u{1F6AA}' },
  ]
  offerChoice(c, RENEWAL_SCRIPT, 'Contract Renewal', `Your contract with ${k.agency} has run its term. Renew, push for better terms or walk away. What will you do?`, choices, { agency: k.agency }, CONTRACT)
}

defineScript(RENEWAL_SCRIPT, (g, choice, data) => {
  if (!g.character.alive || (choice !== 'renew' && choice !== 'push' && choice !== 'walk')) return
  const job = modelJob(g)
  if (!job || !modelStore.has(g)) return
  const s = modelStore.mut(g)
  if (!claimChoice(g, s, data, `renewal.${g.year}`)) return
  const k = ensureContract(g, job)
  if (!k || g.year < k.until) return
  const c = careerCtx(g, 'model', s)
  const year = g.year
  if (choice === 'walk') {
    for (const row of s.agencies) if (row.to === 0) row.to = year
    leave(g, 'quit')
    careerLog(c, `I walked away from ${k.agency}.`)
    careerSay(c, 'Walked Away', `You left ${k.agency} at the end of your term.`, '\u{1F6AA}')
    return
  }
  if (choice === 'renew') {
    const next = renewTerm(job, k, year)
    s.mood = clamp(Math.round((s.mood + 3) * 10) / 10, 0, 100)
    careerLog(c, `I renewed with ${k.agency}.`, 'good')
    careerSay(c, 'Renewed', `${k.agency} renewed you to ${next.until}.${k.unrecouped > 0 ? " The advance you still owed is written off." : ''}`, CONTRACT, 'good')
    return
  }
  // push: the odds are the ones the hint printed
  if (chance(g, renewalOdds(s.rep, s.book))) {
    const next = renewTerm(job, k, year, k.commission - 3)
    s.mood = clamp(Math.round((s.mood + 5) * 10) / 10, 0, 100)
    careerLog(c, `I pushed ${k.agency} and got a better rate.`, 'good')
    careerSay(c, 'Renewed', `The agent gave ground. Your commission is ${next.commission}% to ${next.until}.`, CONTRACT, 'good')
    return
  }
  const next = renewTerm(job, k, year)
  s.mood = clamp(Math.round((s.mood - 10) * 10) / 10, 0, 100)
  careerLog(c, `I pushed ${k.agency} and got nowhere.`, 'bad')
  careerSay(c, 'Renewed', `The agent held firm. You renewed as is to ${next.until}, and the meeting wore you out.`, CONTRACT, 'bad')
})

// ---------------------------------------------------------------------------
// Rows

type Spec = Omit<Parameters<typeof gatedAction<ModelState>>[0], 'career' | 'store'>

function row(spec: Spec, visible?: (g: GameState) => boolean): MenuAction {
  return { ...gatedAction<ModelState>({ career: 'model', store: modelStore, ...spec }), ...(visible ? { visible } : {}) }
}

const signedNow = (g: GameState): boolean => !!modelJob(g)

/** The contract as plain lines: the agency, the deal, the commission and term, the advance, the mother override. Pure. */
export function contractLines(g: GameState): string[] {
  const job = modelJob(g)
  const k = job ? readContract(job, g) : null
  if (!job || !k) return ['You have no agency contract.']
  const s = modelStore.view(g)
  const lines = [
    `${k.agency}. ${RANKS[clamp(Math.round(fin(job.level)), 0, RANKS.length - 1)]}.`,
    k.guarantee ? `Guarantee of ${money(fin(job.salary))} a year, exclusive.` : 'Commission only. No retainer, and you can freelance.',
    `Commission ${k.commission}%. The term runs to ${k.until}.`,
  ]
  if (k.advance > 0) lines.push(`Advance ${money(k.advance)}, ${money(k.unrecouped)} left to recoup.`)
  const pct = motherPct(s, g.year)
  if (pct > 0 && s.mother) lines.push(`${s.mother.agency} keeps ${pct}% until ${s.mother.overrideUntil}.`)
  return lines
}

function contractMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'model.contract',
    label: 'Contract',
    emoji: CONTRACT,
    visible: signedNow,
    subtitle: (g) => {
      const k = readContract(modelJob(g), g)
      return k ? fit(`${k.agency}, ${termsOf(k.guarantee ? 'guarantee' : 'commission')}`, LINE) : ''
    },
    header: () => 'Your agency takes a commission on every booking. A guarantee pays a retainer and ties you to the agency.',
    children: (g) => contractLines(g).map((text, i) => info(`model.contract.${i}`, text)),
  }
}

function switchMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'model.switch',
    label: 'Switch Agency',
    emoji: SWITCH,
    visible: signedNow,
    subtitle: (g) => {
      const job = modelJob(g)
      const fee = releaseFee(g, modelStore.view(g), job ? readContract(job, g) : null)
      return fee > 0 ? `Release fee ${money(fee)}` : 'Free to go, your term has run'
    },
    header: () => 'Leaving mid-term costs a release fee and 10 reputation. Your old agency keeps 5% for 8 years.',
    children: (g) => {
      const job = modelJob(g)
      const open = AGENCIES.filter((a) => agencyOpen(a.name, g.year) && a.name !== job?.company)
      if (open.length === 0) return [info('model.switch.none', 'No other agency is open yet.')]
      const best = bestSwitch(g, modelStore.view(g))
      return open.flatMap((a) =>
        (['guarantee', 'commission'] as const).map((kind) =>
          row({
            id: `model.switch.${a.tier}.${kind}`,
            label: `${a.name}, ${termsOf(kind)}`,
            emoji: SWITCH,
            subtitle: (gg) => {
              const fee = releaseFee(gg, modelStore.view(gg), modelJob(gg) ? readContract(modelJob(gg), gg) : null)
              return fit(`Looks ${looksBar(gg, a)}%+, book ${FACE_AGENCIES[a.name].book}+. ${fee > 0 ? `Fee ${money(fee)}.` : 'No fee.'}`, LINE)
            },
            gate: (gg, ss) => blocked(gg, 16) ?? switchBlock(gg, ss, a.name),
            hint: (gg) => (kind === 'guarantee' && best === a.name ? (honest(gg, 'Modeling', 'The top agency that would sign you right now.').hint ?? null) : null),
            confirm: (gg) => {
              const cur = modelJob(gg)
              const fee = releaseFee(gg, modelStore.view(gg), cur ? readContract(cur, gg) : null)
              return fee > 0 ? fit(`Leave ${cur?.company ?? 'your agency'} for ${a.name}? The release fee is ${money(fee)}.`, 120) : null
            },
            run: (c) => switchAgency(c, a.name, kind),
          }),
        ),
      )
    },
  }
}

/** The contract and the switch menus (hidden until you are signed). */
export function agencyRows(_g: GameState): MenuNode[] {
  return [contractMenu(), switchMenu()]
}
