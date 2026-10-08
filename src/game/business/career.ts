// Who runs the company: the owner as CEO (a special-category Job) or a hired general manager.
import { count, endJob, log, notice } from '../core'
import { marketOf } from '../data/markets'
import { masterBusiness } from '../mastery'
import { bell, chance, pick, rand, randInt } from '../rng'
import type { Asset, GameState, Job } from '../types'
import { randomFirstName, randomLastName } from '../world'
import { boardOf, readBoard } from './board-state'
import { bestPlan, LASTING_YEARS, localEcon, maxProduction, niceAmount, planFor, planOutcome, priceBounds, type Worth } from './economy'
import { isDeepTech } from './deeptech-state'
import { afterSuccession, successorManager } from './nepo-succession'
import { CEO_STYLES, ceoJob, OWNER_JOB, readBiz, totalOutlets, type BizState, type CeoStyle, type Manager } from './state'
import { clampN, round2 } from './util'

/** Hired CEOs above this skill run the company like real executives (business/board-ceo.ts). */
export const SMART_SKILL = 75

export interface StyleInfo {
  label: string
  emoji: string
  /** What they lean toward when choices are close. */
  note: string
}

export const STYLE_INFO: Record<CeoStyle, StyleInfo> = {
  grower: { label: 'Grower', emoji: '\u{1F331}', note: 'opens new sites and spends on marketing' },
  costCutter: { label: 'Cost-cutter', emoji: '\u{2702}\u{FE0F}', note: 'trims costs, suppliers and deadweight' },
  steady: { label: 'Steady hand', emoji: '\u{2693}', note: 'keeps what works and pays down debt' },
  visionary: { label: 'Visionary', emoji: '\u{1F52D}', note: 'bets on new products and new markets' },
}

/** A manager's style (old saves have none: steady). */
export function styleOf(m: Manager | null | undefined): CeoStyle {
  return m?.style && CEO_STYLES.includes(m.style) ? m.style : 'steady'
}

/** How straight a manager plays, 0-100 (old saves: 70). */
export function integrityOf(m: Manager | null | undefined): number {
  return clampN(typeof m?.integrity === 'number' ? m.integrity : 70, 0, 100)
}

/** A sensible yearly salary for whoever runs a company of this size in its market. */
export function ceoPayNorm(b: BizState): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  const base = Math.max(e.wage * 1.6, e.m.minWage * 2, 12_000)
  const revenue = b.last?.revenue ?? 0
  const size = 1 + Math.log10(1 + totalOutlets(b)) + Math.max(0, Math.log10(Math.max(1, revenue) / 1e6))
  return niceAmount(clampN(base * size, 8_000, 25_000_000))
}

/** The most the board (or the tax office) will let you pay yourself. */
export function maxOwnerSalary(b: BizState): number {
  const norm = ceoPayNorm(b)
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return Math.round(clampN(Math.max(norm * 3, revenue * 0.15), 20_000, 50_000_000))
}

export function managerName(m: Manager): string {
  return `${m.firstName} ${m.lastName}`
}

/**
 * What a CEO of this skill asks for here: better ones cost more, rare stars (85+) a lot more, and
 * a company that churns through CEOs pays a premium (a revolving door scares candidates).
 */
export function askingSalary(b: BizState, skill: number, churn = readBoard(b.board).churn): number {
  const star = skill >= 85 ? 1 + (skill - 85) / 20 : 1
  return niceAmount(ceoPayNorm(b) * (0.6 + skill / 100) * star * (1 + 0.08 * Math.min(5, churn)))
}

/** A general-manager candidate for this company (skill varies; better ones cost more). */
export function managerCandidate(g: GameState, b: BizState, skill?: number): Manager {
  const gender = randInt(g, 0, 1) === 0 ? 'male' : 'female'
  const s = Math.round(clampN(skill ?? randInt(g, 40, 85), 1, 100))
  return {
    firstName: randomFirstName(g, b.countryId, gender),
    lastName: randomLastName(g, b.countryId),
    gender,
    skill: s,
    salary: askingSalary(b, s),
    since: g.year,
    style: pick(g, CEO_STYLES),
    integrity: clampN(bell(g, 30, 100), 0, 100),
  }
}

export type SearchKind = 'standard' | 'executive'

/**
 * A headhunter's shortlist. A standard search finds four candidates across the range (now and then
 * a rare 85-95 star); an executive search finds five strong ones and always one star.
 */
export function shortlist(g: GameState, b: BizState, kind: SearchKind = 'standard'): Manager[] {
  const bands: [number, number][] = kind === 'executive' ? [[62, 78], [70, 84], [76, 88], [80, 92]] : [[38, 58], [52, 72], [64, 82], [70, 86]]
  const out = bands.map(([lo, hi]) => managerCandidate(g, b, randInt(g, lo, hi)))
  if (kind === 'executive' || chance(g, 0.12)) out.push(managerCandidate(g, b, 85 + Math.floor(Math.pow(rand(g), 2) * 16)))
  return out
}

/** A headhunter's fee for a fresh shortlist; every extra search this year costs half as much again. */
export function headhunterFee(b: BizState, kind: SearchKind, searchesThisYear: number): number {
  const base = ceoPayNorm(b) * (kind === 'executive' ? 0.25 : 0.08)
  return Math.max(500, niceAmount(base * (1 + 0.5 * Math.max(0, searchesThisYear))))
}

/** Years of a new CEO's contract (buying it out early costs half the pay still owed). */
export const CEO_CONTRACT_YEARS = 3

/**
 * Severance for letting a hired CEO go: half the pay left on a fresh contract, or a payout that
 * grows with tenure (a quarter of a year's pay, plus a tenth per year served, up to two years').
 */
export function ceoSeverance(m: Manager, year: number): number {
  const tenure = Math.max(0, year - m.since)
  const left = Math.max(0, CEO_CONTRACT_YEARS - tenure)
  const k = Math.max(left * 0.5, Math.min(2, 0.25 + 0.1 * tenure))
  const v = Math.round(Math.max(0, m.salary) * k)
  return Number.isFinite(v) ? v : 0
}

/**
 * A general manager's yearly worth before the optimizer: their skill lifts sales (customers notice
 * a well-run place), trims overhead and sets the mood, against their salary.
 */
export function baseManagerValue(w: Worth, m: Pick<Manager, 'skill' | 'salary'>): number {
  return m.skill * (w.contrib / 1500 + w.overhead / 1000 + w.moraleTarget / 12 / LASTING_YEARS) - m.salary
}

/**
 * What a CEO who plans with the optimizer earns over the sloppy plan next year: the best plan's
 * expected profit against the plan a 75-or-below manager makes on average (the going price,
 * production to demand). Same scenarios as the Annual Report's planner; never touches g.rng.
 * Price-and-production companies only (studios and deep tech plan with their own models).
 */
export function optimizerGain(g: GameState, b: BizState): number {
  if (b.industry === 'gameStudio' || isDeepTech(b)) return 0
  const best = bestPlan(g, b, { quick: true })
  const bounds = priceBounds(b)
  const price = round2(clampN(planFor(g, b, g.year, { calm: true }).suggested, bounds.min, bounds.max))
  const plan = planFor(g, b, g.year, { price, calm: true })
  const production = Math.round(clampN(plan.demand * 1.02 - b.inventory, 0, maxProduction(g, b)))
  const auto = planOutcome(g, b, price, production, { quick: true }).profit
  const gain = best.profit - auto
  return Number.isFinite(gain) ? Math.max(0, gain) : 0
}

/** Share of the optimizer's gain a smart CEO actually captures (their small mistakes shrink with skill). */
export function captureOf(skill: number): number {
  return skill > SMART_SKILL ? clampN(skill / 100, 0, 1) : 0
}

/**
 * A CEO candidate's yearly value to this company: the base worth of their skill against their pay,
 * plus (above 75) the profit the optimizer finds that a sloppier plan leaves on the table.
 * `gain` is optimizerGain(g, b), computed once per shortlist.
 */
export function ceoValue(w: Worth, m: Pick<Manager, 'skill' | 'salary'>, gain: number): number {
  return baseManagerValue(w, m) + captureOf(m.skill) * Math.max(0, gain)
}

/** Put a manager in charge (the owner keeps the shares). */
export function installManager(g: GameState, b: BizState, m?: Manager): Manager {
  const mgr = m ?? managerCandidate(g, b, randInt(g, 45, 70))
  b.ceo = 'manager'
  b.manager = { ...mgr, since: g.year }
  delete b.manager.bonus
  delete b.manager.asked
  return b.manager
}

export interface Handover {
  /** Severance paid to the CEO who left (0 when fired for cause or when the owner ran it). */
  severance: number
  /** Morale points the change cost. */
  moraleHit: number
  outgoing: Manager | null
}

/**
 * Hand the company to a new hired CEO, whoever runs it now. The outgoing hired CEO gets their
 * severance from company cash (none when fired for cause); churning CEOs costs morale; the new
 * CEO starts with a clean slate with the board. Ends the player's CEO job if they ran it.
 */
export function handOver(g: GameState, a: Asset, b: BizState, next: Manager, opts: { forCause?: boolean } = {}): Handover {
  const st = boardOf(b)
  const outgoing = b.ceo === 'manager' && b.manager ? { ...b.manager } : null
  const severance = outgoing && !opts.forCause ? ceoSeverance(outgoing, g.year) : 0
  if (severance > 0) {
    b.cash -= severance
    b.yearCosts += severance
  }
  const moraleHit = st.churn >= 1 ? Math.round(clampN(2 + 3 * st.churn, 0, 15)) : 0
  b.morale = clampN(b.morale - moraleHit, 0, 100)
  st.churn = Math.round((st.churn + 1) * 100) / 100
  st.patience = 60
  st.warnings = 0
  st.misses = 0
  st.scheme = null
  if (ceoJob(g, a.id) && b.ceo !== 'manager') stepDown(g, a, b, next)
  else installManager(g, b, next)
  return { severance, moraleHit, outgoing }
}

/**
 * The owner takes over from a hired CEO: the outgoing CEO's severance and the churn are the same
 * as any other change at the top. Returns what it cost.
 */
export function ownerTakesOver(g: GameState, b: BizState): Handover {
  const st = boardOf(b)
  const outgoing = b.ceo === 'manager' && b.manager ? { ...b.manager } : null
  const severance = outgoing ? ceoSeverance(outgoing, g.year) : 0
  if (severance > 0) {
    b.cash -= severance
    b.yearCosts += severance
  }
  const moraleHit = st.churn >= 1 ? Math.round(clampN(2 + 3 * st.churn, 0, 15)) : 0
  b.morale = clampN(b.morale - moraleHit, 0, 100)
  if (outgoing) st.churn = Math.round((st.churn + 1) * 100) / 100
  st.patience = 60
  st.warnings = 0
  st.misses = 0
  st.scheme = null
  return { severance, moraleHit, outgoing }
}

/**
 * Make the player CEO of this business, quitting whatever main job they had (another business
 * they ran gets a general manager). Returns the title of the job they quit, if any.
 */
export function becomeCeo(g: GameState, a: Asset, b: BizState, title = 'Founder & CEO'): string | null {
  const c = g.character
  let quit: string | null = null
  if (c.job && !(c.job.defId === OWNER_JOB && c.job.data.assetId === a.id)) {
    const prev = c.job
    if (prev.defId === OWNER_JOB) {
      const other = g.assets.find((x) => x.id === prev.data.assetId)
      if (other && other.kind === 'business') {
        const ob = other.details as unknown as BizState
        if (ob && typeof ob === 'object') installManager(g, ob)
      }
    }
    quit = prev.title
    endJob(g, 'job', 'quit')
  }
  b.ceo = 'owner'
  b.manager = null
  if (!b.ownerSalary) b.ownerSalary = Math.min(ceoPayNorm(b), maxOwnerSalary(b))
  const job: Job = {
    defId: OWNER_JOB,
    title,
    company: a.name,
    category: 'special',
    salary: b.ownerSalary,
    level: 0,
    performance: 60,
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: { assetId: a.id, startAge: c.age, roleStartAge: c.age },
  }
  c.job = job
  count(g, 'jobs')
  // Taking charge is the first hands-on business action for Main Character Syndrome. Keep this
  // in the central transition so founding, buying and replacing a hired CEO all unlock the same
  // bounded owner-CEO skill floor without making menu previews mutate state.
  masterBusiness(g)
  return quit
}

/** Step down as CEO (the company keeps running under a manager). */
export function stepDown(g: GameState, a: Asset, b: BizState, m?: Manager): Manager {
  const mgr = installManager(g, b, m)
  if (ceoJob(g, a.id)) endJob(g, 'job', 'quit')
  return mgr
}

/**
 * Keep the CEO job and the businesses consistent: a business whose owner no longer works there
 * (prison, a new job, inheritance) gets a manager; a CEO job whose company is gone ends.
 */
export function syncCeo(g: GameState): void {
  const c = g.character
  const job = ceoJob(g)
  if (job) {
    const a = g.assets.find((x) => x.id === job.data.assetId && x.kind === 'business')
    if (!a) {
      endJob(g, 'job', 'other')
      log(g, `I'm no longer running ${job.company}: it isn't mine anymore.`, 'bad')
    } else {
      job.company = a.name
      // A WIP/hand-edited save may already have a Main Character owner-CEO but no mastery record.
      // Repair it at the action-side yearly sync before the company simulation reads ceoSkill.
      masterBusiness(g)
    }
  }
  for (const a of g.assets) {
    if (a.kind !== 'business') continue
    const d = a.details as unknown as BizState
    // An heir who was their family company's CEO now owns it and runs it as owner-CEO (nobody is
    // their own hired manager).
    if (d.ceo === 'manager' && d.manager?.personId && d.manager.personId === c.id) {
      const b = readBiz(g, a)
      if (c.alive && !c.prison && c.age >= 18) {
        becomeCeo(g, a, d, b.founderName && b.founderName === `${c.firstName} ${c.lastName}` ? 'Founder & CEO' : 'Owner & CEO')
        log(g, `I took over ${a.name} as its owner and CEO.`, 'good')
      } else {
        installManager(g, d, managerCandidate(g, b, randInt(g, 45, 70)))
        log(g, `${a.name} hired an interim general manager until I can run it.`, 'neutral')
      }
      continue
    }
    if (d.ceo === 'manager') continue
    if (ceoJob(g, a.id)) continue
    const b = readBiz(g, a)
    // The successor the owner named in advance (a son or daughter, a key employee) takes over; else a headhunted manager.
    const heir = c.prison ? null : successorManager(g, a, b, (skill) => askingSalary(b, skill, 0))
    const mgr = heir ?? managerCandidate(g, b, randInt(g, 45, 70))
    d.ceo = 'manager'
    d.manager = { ...mgr, since: g.year }
    if (heir) afterSuccession(g, a, d, d.manager)
    const who = `${mgr.firstName} ${mgr.lastName}`
    if (c.prison) log(g, `With me behind bars, ${a.name} hired ${who} as interim general manager.`, 'neutral')
    else if (heir) log(g, `${who} took over ${a.name} as CEO, as I had planned.`, 'good')
    else log(g, `${who} took over day-to-day management of ${a.name}.`, 'neutral')
  }
}

/** Short note on what the local labor market means for hiring a manager. */
export function managerMarketNote(b: BizState): string {
  const m = marketOf(b.countryId)
  return m.laborCost >= 1.2 ? 'Executives here are expensive.' : m.laborCost <= 0.3 ? 'Experienced managers are affordable here.' : ''
}

// ---------------------------------------------------------------------------
// The CEO's letter

/** True when the owner can take a decision in person (not a minor, not in prison, alive). */
export function ownerAvailable(g: GameState): boolean {
  const c = g.character
  return c.alive && !c.prison && c.age >= 18
}

/**
 * The CEO's yearly letter to the owner: a popup when something big happened (at most one per
 * company a year), a line in the life log otherwise. Kept on the company screen until the next.
 */
export function ceoLetter(g: GameState, a: Asset, b: BizState, lines: string[], big: boolean): void {
  const m = b.manager
  if (!m || b.ceo !== 'manager' || !g.character.alive) return
  const st = boardOf(b)
  if (st.letter === g.year) return
  st.letter = g.year
  st.memo = lines.slice(0, 10)
  const who = managerName(m)
  const style = STYLE_INFO[styleOf(m)]
  if (big && lines.length > 1 && ownerAvailable(g)) {
    notice(g, `${a.name}: Letter from the CEO`, `Dear ${g.character.firstName},\n${lines.map((x) => `\u{2022} ${x}`).join('\n')}\n\u{2014} ${who}, CEO (${style.label.toLowerCase()})`, { emoji: '\u{1F4DD}' })
    return
  }
  log(g, `${who}'s letter from ${a.name}: ${lines.length > 1 ? lines.slice(0, 2).join(' ') : lines[0] ?? 'business as usual.'}`, 'neutral')
}
