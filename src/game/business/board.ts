// The board of directors. A company has a board once anyone else owns part of it (investors,
// public shareholders) or it belongs to a conglomerate. The board keeps whoever is CEO (the player
// or a hired manager) in check: big decisions need its approval, it sets the hired CEO's mandate
// and limits, reviews performance every year and can fire the CEO.
//
// Modules: board-state.ts (plain-JSON state in BizState.board, seats that follow ownership,
// mandates and limits), board-vote.ts (proposals, honest per-director odds, the exact pass
// probability, vetoes, minority lawsuits), board-ceo.ts (the smart hired CEO's yearly turn and the
// CEO letter), board-menu.ts (the company screen's Board rows). This file is the public API.
//
// For conglomerates (business/conglomerate.ts):
//  - registerGroupBoard(provider) marks member companies (they always get a board; the group's
//    people fill the owner's seats);
//  - members(g, a), ownerControls(g, a) and mandateOf(g, a) read a company's board;
//  - vote(g, a, b, proposal) puts a proposal to it ({ kind: 'merge', merit, gain, ... });
//    passOdds() is the exact chance it passes (for hints), needsVote()/boardAllows() gate actions;
//  - setMandate(g, a, b, mandate, limits?) applies a mandate the group has decided.
import { addStat, count, formatMoney, log, notice, remember, scriptChoice } from '../core'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { Asset, GameState, MenuNode } from '../types'
import { askingSalary, ceoValue, handOver, managerCandidate, managerName, optimizerGain, shortlist } from './career'
import {
  boardExists,
  boardOf,
  boardView,
  clampLimits,
  controlsBoard,
  makeDirector,
  mandateDef,
  syncSeats,
  takeDirectorKey,
  type BoardState,
  type Director,
  type Limits,
  type Mandate,
} from './board-state'
import { capexBudget, payCap, performance, reserveDollars, vote } from './board-vote'
import { ownerAvailable } from './board-ceo'
import { boardMenuNodes } from './board-menu'
import { readTech } from './deeptech-state'
import { bizWorth, niceAmount } from './economy'
import { bizOf, findBusiness, hasExecutiveShares, readBiz, runsIt, type BizState, type Manager, type Statement } from './state'
import { clampN, markBest, money, num, pct, rec, str } from './util'

export { registerGroupBoard, MANDATES, mandateDef, type BoardState, type Director, type GroupBoardInfo, type Limits, type Mandate } from './board-state'
export { boardAllows, needsVote, passOdds, vote, type Proposal, type ProposalKind, type VoteResult } from './board-vote'

/** True when this company has a board that can say no (outside owners, listed, or in a group). */
export function hasBoard(g: GameState, b: BizState): boolean {
  return boardExists(g, b)
}

/** The Leadership › Board rows on a company's screen (members, votes, mandate). [] when none. */
export function boardNodes(g: GameState, a: Asset): MenuNode[] {
  return boardMenuNodes(g, a)
}

/** The directors as they sit now (pure; [] without a board). */
export function members(g: GameState, a: Asset): Director[] {
  const cur = findBusiness(g, a.id)
  if (!cur) return []
  const b = readBiz(g, cur)
  return boardExists(g, b) ? boardView(g, cur, b).members : []
}

/** True when the owner's people hold a majority of the board (or there is no board). */
export function ownerControls(g: GameState, a: Asset): boolean {
  const cur = findBusiness(g, a.id)
  if (!cur) return true
  const b = readBiz(g, cur)
  return !boardExists(g, b) || controlsBoard(boardView(g, cur, b))
}

/** The mandate and limits the CEO works under, with the limits in dollars. */
export function mandateOf(g: GameState, a: Asset): { mandate: Mandate; limits: Limits; budget: number; reserve: number; payCap: number } {
  const cur = findBusiness(g, a.id) ?? a
  const b = readBiz(g, cur)
  const st = boardView(g, cur, b)
  return { mandate: st.mandate, limits: { ...st.limits }, budget: capexBudget(b, st), reserve: reserveDollars(b, st), payCap: payCap(b, st) }
}

/** Apply a mandate (the default limits for it, or the ones given). No vote: callers decide first. */
export function setMandate(g: GameState, a: Asset, b: BizState, mandate: Mandate, limits?: Partial<Limits>): void {
  const st = boardOf(b)
  syncSeats(g, a, b, st)
  st.mandate = mandate
  st.limits = clampLimits(limits ?? {}, mandateDef(mandate).limits)
}

// ---------------------------------------------------------------------------
// The yearly review

/** How the year matched the mandate, -1..1 (deep tech before it sells: its milestones). */
function mandateScore(b: BizState, st: BoardState, s: Statement): number {
  const perf = performance(b)
  if (s.revenue <= 0) return perf
  const margin = s.net / s.revenue
  const h = b.history
  const prev = h.length >= 2 ? h[h.length - 2] : null
  const growth = prev && prev.revenue > 0 ? clampN(s.revenue / prev.revenue - 1, -0.5, 0.8) : 0
  const loss = s.net < 0 ? -0.3 : 0
  const v =
    st.mandate === 'growth'
      ? growth * 2.5 + margin * 1.5 + loss
      : st.mandate === 'profit'
        ? margin * 5 + (prev && prev.profit > 0 ? clampN(s.net / prev.profit - 1, -1, 1) * 0.3 : 0) + loss
        : st.mandate === 'cash'
          ? margin * 4 + (s.net > 0 ? 0.1 : 0) + loss
          : perf + loss * 0.5
  return clampN(Number.isFinite(v) ? v : 0, -1, 1)
}

/** Directors retire or quit in protest now and then; their seats are filled by new ones. */
function directorTurnover(g: GameState, a: Asset, b: BizState, st: BoardState): void {
  const leaving = st.members.filter((d) => d.seat !== 'owner' && d.seat !== 'group' && (chance(g, 0.06) || (d.loyalty < 10 && chance(g, 0.4))))
  if (!leaving.length) return
  for (const d of leaving) {
    const i = st.members.findIndex((x) => x.key === d.key)
    if (i < 0) continue
    const next = makeDirector(g, a, b, d.seat, takeDirectorKey(st))
    st.members[i] = next
  }
}

/**
 * The board's pick from a fresh shortlist: the most capable candidate it can pay (boards stretch
 * a quarter past their own pay policy for talent), the better value on a tie of skill bands.
 */
function boardPick(g: GameState, b: BizState, st: BoardState): Manager {
  const list = shortlist(g, b, 'standard')
  const w = bizWorth(g, b)
  const gain = optimizerGain(g, b)
  const cap = payCap(b, st) * 1.25
  const within = list.filter((m) => m.salary <= cap)
  const pool = within.length ? within : [...list].sort((x, y) => x.salary - y.salary).slice(0, 1)
  const score = (m: Manager) => Math.floor(m.skill / 10) * 1e15 + ceoValue(w, m, gain)
  return pool.reduce((best, m) => (score(m) > score(best) ? m : best), pool[0])
}

function tallyNote(yes: number, no: number): string {
  return `${yes}\u{2013}${no}`
}

/** A hired CEO's profit bonus (within the pay policy), a raise request now and then, and poachers. */
function payYear(g: GameState, a: Asset, b: BizState, st: BoardState, s: Statement, score: number): void {
  const m = b.manager
  if (!m) return
  // The bonus: a slice of profit scaled by how well they met the mandate, capped by the pay policy.
  const room = Math.max(0, payCap(b, st) - m.salary)
  const bonus = Math.round(Math.min(room, Math.max(0, s.net) * 0.02 * clampN(0.5 + score, 0.25, 1.5), Math.max(0, b.cash - reserveDollars(b, st) * 0.5)))
  if (bonus >= 500) {
    b.cash -= bonus
    b.yearCosts += bonus
    m.bonus = bonus
    log(g, `${managerName(m)} earned a ${money(bonus)} bonus at ${a.name}.`, 'neutral')
  } else delete m.bonus
  const tenure = g.year - m.since
  // Great CEOs who deliver ask for more every few years.
  if (m.skill >= 80 && tenure >= 2 && score > 0.2 && num(m.asked) <= g.year - 3 && chance(g, 0.5)) {
    m.asked = g.year
    // At least what the market now pays a CEO of their calibre to run a company this size.
    const ask = niceAmount(Math.max(m.salary * (1.15 + 0.01 * randInt(g, 0, 10)), askingSalary(b, m.skill, 0)))
    if (ownerAvailable(g) && (!boardExists(g, b) || controlsBoard(st))) {
      queueRaise(g, a, b, m, ask)
      return
    }
    // The board decides; with no board and an owner who can't (a minor heir, a prisoner), the
    // trustees grant it when keeping the CEO is worth the money.
    const r = boardExists(g, b)
      ? vote(g, a, b, { kind: 'ceoPay', by: 'ceo', label: `Raise ${managerName(m)}'s pay to ${money(ask)} a year`, amount: ask, skill: m.skill }, { quiet: true })
      : { passed: raiseValues(g, b, m, ask).grant >= raiseValues(g, b, m, ask).refuse, skipped: false }
    if (r.passed) {
      m.salary = ask
      log(g, `${a.name}'s board gave ${managerName(m)} a raise to ${money(ask)} a year.`, 'neutral')
    } else if (!hasExecutiveShares(m) && chance(g, 0.4)) {
      poached(g, a, b, st, m, 'after the board turned down a raise')
      return
    }
  }
  // Rivals come for the best, and an underpaid star listens.
  const underpaid = m.salary < askingSalary(b, m.skill, 0) * 0.85
  if (!hasExecutiveShares(m) && m.skill >= 85 && tenure >= 2 && chance(g, 0.02 + (underpaid ? 0.05 : 0))) poached(g, a, b, st, m, 'by a rival')
}

/** A deputy who steps up when the CEO leaves suddenly: a notch below them, never a star. */
function interim(g: GameState, b: BizState, m: Manager): Manager {
  return managerCandidate(g, b, Math.round(clampN(m.skill - randInt(g, 5, 20), 40, 80)))
}

/** A star CEO leaves for a rival; a deputy keeps the lights on until the owner picks again. */
function poached(g: GameState, a: Asset, b: BizState, st: BoardState, m: Manager, how: string): void {
  // Also guard queued raise responses: shares may have been granted after the popup opened.
  if (hasExecutiveShares(m)) return
  const next = boardExists(g, b) && !controlsBoard(st) ? boardPick(g, b, st) : interim(g, b, m)
  const prev = managerName(m)
  // They resigned: no severance, but the change still costs morale.
  handOver(g, a, b, next, { forCause: true })
  log(g, `${prev} was poached ${how} and left ${a.name}.`, 'bad')
  notice(g, 'CEO Poached', `${prev}, ${a.name}'s CEO, was poached ${how}. ${managerName(next)} (skill ${next.skill}) is running the company for now${boardExists(g, b) && !controlsBoard(st) ? ', picked by the board' : '. You can pick someone else under Leadership'}.`, { emoji: '\u{1F3C3}', tone: 'bad' })
}

const RAISE = defineScript('business.board.raise', (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d) return
  const b = bizOf(g, a)
  const m = b.manager
  if (!m || b.ceo !== 'manager' || `${m.firstName} ${m.lastName}` !== str(d.who)) return
  const ask = Math.max(0, Math.round(num(d.ask)))
  if (choice === 'grant') {
    const st = boardOf(b)
    if (boardExists(g, b) && ask > payCap(b, st)) {
      const r = vote(g, a, b, { kind: 'ceoPay', by: 'owner', label: `Raise ${managerName(m)}'s pay to ${money(ask)} a year`, amount: ask, skill: m.skill })
      if (!r.passed) {
        if (!hasExecutiveShares(m) && chance(g, 0.4)) poached(g, a, b, st, m, 'after the board turned down the raise you backed')
        return
      }
    }
    m.salary = ask
    log(g, `I gave ${managerName(m)} a raise to ${money(ask)} a year.`, 'neutral')
    notice(g, 'Raise Granted', `${managerName(m)} will earn ${formatMoney(ask)} a year running ${a.name}. ${m.gender === 'female' ? 'She' : 'He'} promised another record year.`, { emoji: '\u{1F91D}', tone: 'good' })
    return
  }
  if (!hasExecutiveShares(m) && chance(g, RAISE_WALK)) {
    poached(g, a, b, boardOf(b), m, 'after you said no to a raise')
    return
  }
  log(g, `I turned down ${managerName(m)}'s request for a raise.`, 'neutral')
  notice(g, 'Raise Refused', hasExecutiveShares(m) ? `${managerName(m)} was disappointed, but stays committed as a shareholder. Salary remains ${formatMoney(m.salary)} a year.` : `${managerName(m)} grumbled, polished the r\u{E9}sum\u{E9}, took a long lunch with a headhunter and went back to work.`, { emoji: '\u{1F610}' })
})

/** Chance a CEO who is refused a raise walks out (to a rival who was already calling). */
const RAISE_WALK = 0.35

/** A year of the CEO's value to the company with the raise, and (expected) without it. */
function raiseValues(g: GameState, b: BizState, m: Manager, ask: number): { grant: number; refuse: number } {
  const w = bizWorth(g, b)
  const gain = optimizerGain(g, b)
  const stay = ceoValue(w, m, gain)
  // Losing them means an average replacement (skill 60 at the asking pay).
  const typical = ceoValue(w, { skill: 60, salary: askingSalary(b, 60) }, gain)
  const walk = hasExecutiveShares(m) ? 0 : RAISE_WALK
  return { grant: ceoValue(w, { ...m, salary: ask }, gain), refuse: (1 - walk) * stay + walk * typical }
}

function queueRaise(g: GameState, a: Asset, b: BizState, m: Manager, ask: number): void {
  const choices = [
    { id: 'grant', label: `Give the raise (${money(ask)} a year)`, emoji: '\u{1F4B5}' },
    { id: 'refuse', label: 'Say no', emoji: '\u{1F645}' },
  ]
  const v = raiseValues(g, b, m, ask)
  markBest(g, choices, (id) => (id === 'grant' ? v.grant : id === 'refuse' ? v.refuse : null), (id) =>
    id === 'grant' ? `Best move: ${m.firstName} is worth more than the raise` : 'Best move: the raise costs more than keeping them is worth',
  )
  scriptChoice(
    g,
    RAISE,
    'Your CEO Wants a Raise',
    `${managerName(m)} has run ${a.name} for ${g.year - m.since} years and the results are in. ${m.gender === 'female' ? 'She' : 'He'} wants ${formatMoney(ask)} a year (now ${formatMoney(m.salary)}). ${hasExecutiveShares(m) ? 'As a shareholder, they will stay even if the raise is refused.' : 'They hinted that rivals have been calling.'}`,
    choices,
    { emoji: '\u{1F4BC}', data: { assetId: a.id, who: `${m.firstName} ${m.lastName}`, ask } },
  )
}

// ---------------------------------------------------------------------------
// Rogue CEOs

const SCHEMES: Record<'empire' | 'perks' | 'books', { what: string; caught: string }> = {
  empire: { what: 'empire building', caught: 'pouring company money into vanity projects nobody approved: a marble headquarters, a sports club sponsorship and their cousin\u{2019}s struggling company' },
  perks: { what: 'lavish perks', caught: 'billing the company for a chauffeured car, a country house and a very expensive "client dinner" habit' },
  books: { what: 'cooked books', caught: 'inflating the numbers to hit bonus targets' },
}

function schemeCost(b: BizState, kind: 'empire' | 'perks' | 'books', salary: number): number {
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  const v = kind === 'empire' ? Math.max(b.valuation * 0.04, salary * 0.5) : kind === 'perks' ? revenue * 0.012 + salary * 0.3 : revenue * 0.01 + salary * 0.2
  // A drain, not a heist: at most a quarter of the cash a year (a scheme runs up to three years).
  return Math.round(clampN(Number.isFinite(v) ? v : 0, 0, Math.max(0, b.cash) * 0.25))
}

/** How likely misconduct is caught in a year: a strong, independent board sees most of it. */
export function oversight(g: GameState, b: BizState, st: BoardState): number {
  if (!st.members.length) {
    const c = g.character
    return clampN(0.15 + (ownerAvailable(g) ? c.stats.smarts / 300 : 0), 0, 0.5)
  }
  const ind = st.members.filter((d) => d.seat === 'independent').length
  const inv = st.members.filter((d) => d.seat === 'investor').length
  const cautious = st.members.filter((d) => d.stance === 'caution').length
  return clampN(0.3 + 0.08 * ind + 0.06 * inv + 0.05 * cautious + (b.public ? 0.1 : 0), 0, 0.92)
}

function rogueYear(g: GameState, a: Asset, b: BizState, st: BoardState): void {
  const m = b.manager
  if (!m) return
  const watch = oversight(g, b, st)
  if (st.scheme) {
    const kind = st.scheme.kind
    const take = schemeCost(b, kind, m.salary)
    b.cash -= take
    b.yearCosts += take
    st.scheme.taken += take
    if (!chance(g, watch) && g.year - st.scheme.since < 3) return
    const taken = st.scheme.taken
    const back = Math.round(taken * 0.3)
    b.cash += back
    b.yearIncome += back
    let fine = 0
    if (kind === 'books' && taken > 0) {
      fine = Math.round(taken * 0.5)
      b.cash -= fine
      b.yearCosts += fine
      b.brand = clampN(b.brand - 8, 0, 100)
    }
    const by = st.members.length ? 'the board\u{2019}s audit committee' : 'your accountant'
    const who = managerName(m)
    const next = st.members.length && !controlsBoard(st) ? boardPick(g, b, st) : interim(g, b, m)
    handOver(g, a, b, next, { forCause: true })
    log(g, `${a.name}'s CEO ${who} was fired for ${SCHEMES[kind].what}.`, 'bad')
    remember(g, `${a.name}'s CEO was caught ${SCHEMES[kind].what === 'cooked books' ? 'cooking the books' : `on ${SCHEMES[kind].what}`}.`)
    notice(
      g,
      'Rogue CEO Caught',
      `${by.charAt(0).toUpperCase()}${by.slice(1)} caught ${who} ${SCHEMES[kind].caught}. ${taken > 0 ? `It cost ${a.name} ${formatMoney(taken)}; ${formatMoney(back)} was clawed back${fine > 0 ? ` and regulators fined the company ${formatMoney(fine)}` : ''}.` : 'They were caught before it cost the company anything.'} ${who} was fired for cause (no severance) and ${managerName(next)} is in charge now.`,
      { emoji: '\u{1F6A8}', tone: 'bad' },
    )
    return
  }
  // Rare: about 1% a year for a typical hire, more for a shady one.
  const odds = 0.04 * (1 - clampN(typeof m.integrity === 'number' ? m.integrity : 70, 0, 100) / 100)
  if (!chance(g, odds)) return
  const kind = pick(g, ['empire', 'perks', 'books'] as const)
  // A strong board stops it before it starts more often than not.
  if (chance(g, watch * 0.5)) {
    log(g, `${a.name}'s ${st.members.length ? 'board' : 'auditor'} quietly stopped ${managerName(m)} from ${SCHEMES[kind].what}.`, 'neutral')
    st.patience = clampN(st.patience - 15, 0, 100)
    return
  }
  st.scheme = { kind, since: g.year, taken: 0 }
}

// ---------------------------------------------------------------------------
// Warnings and firing

function deepTechPressure(b: BizState): number {
  if (!b.tech || b.public) return 0
  const t = readTech(b.tech)
  return t.series >= 1 ? t.pressure : 0
}

function reviewCeo(g: GameState, a: Asset, b: BizState, st: BoardState, score: number): void {
  const control = controlsBoard(st)
  const c = g.character
  if (runsIt(g, a)) {
    const pressure = deepTechPressure(b)
    const slumping = (b.public && b.slump >= 2) || st.patience < 20 || pressure >= 80
    if (!control && st.patience < 35 && st.warnings === 0 && !slumping) {
      st.warnings = 1
      notice(g, 'The Board Is Restless', `${a.name}'s directors met without you. They want ${mandateDef(st.mandate).brief}, and the last year wasn't it. You don't control the board: a few more like that and they will look for a new CEO.`, { emoji: '\u{1F3DB}\u{FE0F}', tone: 'bad' })
      return
    }
    if (control || !slumping || !chance(g, 0.35)) return
    const name = `${c.firstName} ${c.lastName}`
    const r = vote(g, a, b, { kind: 'fire', by: 'board', label: `Replace ${name} as CEO` }, { quiet: true })
    if (!r.passed) {
      st.warnings += 1
      log(g, `${a.name}'s board voted on replacing me as CEO and I survived, ${tallyNote(r.yes, r.no)}.`, 'neutral')
      return
    }
    const next = boardPick(g, b, st)
    handOver(g, a, b, next)
    const job = c.careerHistory[c.careerHistory.length - 1]
    if (job) job.reason = 'fired'
    count(g, 'fired')
    addStat(g, 'happiness', pressure >= 80 ? -12 : -10)
    if (b.tech && pressure >= 80) {
      const t = rec(b.tech)
      if (t) t.pressure = 30
    }
    const stuck = b.tech ? readTech(b.tech).stuck : 0
    log(g, pressure >= 80 ? `${a.name}'s investors voted me out as CEO.` : `The board of ${a.name} fired me as CEO.`, 'bad')
    remember(g, pressure >= 80 ? `Was pushed out as CEO of ${a.name} by its investors.` : `Was fired as CEO of ${a.name} by its board.`)
    const why = pressure >= 80 ? `Your investors control the board, and after ${stuck >= 2 ? `${stuck} years` : 'years'} without a milestone they ran out of patience.` : b.slump >= 2 ? `After ${b.slump} straight years of falling profits, the board ran out of patience.` : 'The board ran out of patience with the results.'
    notice(g, pressure >= 80 ? 'Pushed Out' : 'Ousted!', `${why} They voted ${tallyNote(r.yes, r.no)} to replace you as CEO of ${a.name} with ${managerName(next)}. You still own ${pct(b.share)} of the company, which is some comfort, and a lot of money.`, { emoji: '\u{1FA91}', tone: 'bad' })
    return
  }
  const m = b.manager
  if (!m || b.ceo !== 'manager') return
  if (st.patience < 35 && st.warnings === 0) {
    st.warnings = 1
    log(g, `${a.name}'s board warned ${managerName(m)} about the results.`, 'bad')
    return
  }
  if (st.misses < (control ? 3 : 2) || st.patience >= 25 || !chance(g, control ? 0.4 : 0.6)) return
  const r = vote(g, a, b, { kind: 'fire', by: 'board', label: `Replace ${managerName(m)} as CEO` }, { quiet: true })
  if (!r.passed) return
  const next = boardPick(g, b, st)
  const prev = managerName(m)
  const h = handOver(g, a, b, next)
  log(g, `${a.name}'s board fired CEO ${prev} and hired ${managerName(next)}.`, 'bad')
  notice(
    g,
    'Board Fires CEO',
    `After ${st.misses || 2} years of missed targets, ${a.name}'s board voted ${tallyNote(r.yes, r.no)} to fire ${prev}${h.severance > 0 ? ` (severance: ${formatMoney(h.severance)})` : ''}. The new CEO is ${managerName(next)}, skill ${next.skill}/100, at ${formatMoney(next.salary)} a year.${score < -0.5 ? ' Nobody on the board is calling it a surprise.' : ''}`,
    { emoji: '\u{1FA91}', tone: 'bad' },
  )
}

/** Yearly board review after the books close (performance, CEO pay, firing, mandates). */
export function boardYear(g: GameState, a: Asset, b: BizState, s: Statement): void {
  if (!g.character.alive || !findBusiness(g, a.id)) return
  const exists = boardExists(g, b)
  const managed = b.ceo === 'manager' && !!b.manager
  if (!exists && !managed && !b.board) return
  const st = boardOf(b)
  syncSeats(g, a, b, st)
  st.churn = Math.round(st.churn * 0.6 * 100) / 100
  const score = mandateScore(b, st, s)
  st.misses = score < -0.15 ? st.misses + 1 : Math.max(0, st.misses - 1)
  st.patience = Math.round(clampN(st.patience + score * 25 - (b.slump >= 2 ? 8 : 0) + (score > 0.2 ? 5 : 0), 0, 100))
  if (deepTechPressure(b) >= 80) st.patience = Math.min(st.patience, 15)
  for (const d of st.members) if (d.seat !== 'owner' && d.seat !== 'group') d.loyalty = Math.round(clampN(d.loyalty + score * 6, 0, 100))
  if (exists) directorTurnover(g, a, b, st)
  if (managed) {
    rogueYear(g, a, b, st)
    if (b.ceo === 'manager' && b.manager) payYear(g, a, b, st, s, score)
  }
  if (exists) reviewCeo(g, a, b, st, score)
}

export const boardInternals = { RAISE, oversight, mandateScore, rogue: rogueYear }
