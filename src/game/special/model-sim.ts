// Model 2.0 sim: the yearly entry the kit runs after the legacy hook has booked its year (the legacy hook still pays
// the retainer, moves performance, promotes, drops and walks Fashion Week; it is untouched). The kit's settleYear owns
// the marker, the peer ranking, the report row and the popup budget; `run` is the year itself: the fees booked last
// year pay out, the retainer is offset, strain, look, book, buzz, reputation and mood move, the ranking is booked and
// the contract term is checked. It closes the year just ended: fees cast in year Y pay at the tick of year Y + 1.
// A board that was worked is replaced by the new year's board (written once, so it holds all year); an idle record
// writes nothing, and the board is derived on demand and written by the first cast.
import { addStat } from '../core'
import { addFame, fameOf, short } from './common'
import type { CareerSim } from './kit/careers'
import { standingOf } from './kit/rivals'
import { settleYear, careerLog, careerSay, type CareerCtx } from './kit/year'
import { modelJob } from './model'
import { adoptJob, contractEnd, saveContract } from './model-agency'
import { buildBoard } from './model-board'
import { modelCrises } from './model-events'
import { protegeIncome, unlockExits } from './model-exit'
import { MODEL_SPEC, bookAfter, lookValue, rankingOf, scoreOf, settleFee, strainNext } from './model-core'
import { FOCUS, KINDS, TIER_PRESTIGE } from './model-data'
import { modelStore, payOut, readContract, type MdOffer, type ModelState } from './model-state'
import { totalFollowers } from './social'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const round1 = (n: number): number => Math.round(n * 10) / 10
const COUNT_MAX = 1e6

/** The long-tail term rankingOf adds below a score of 70, so a past ranking can be rebuilt from its score. */
const tail = (score: number): number => Math.round(40 * clamp((70 - score) / 60, 0, 1) ** 1.5)

interface Settled {
  /** Bookings paid this settle. */
  n: number
  /** Fees kept after the agency's and the mother's cuts (before the retainer is offset). */
  kept: number
  days: number
  trips: number
  wins: { points: number }[]
}

const isShow = (o: MdOffer): boolean => KINDS[o.kind]?.show === true

/**
 * Pays the offers booked last year, each flipped to paid first. A fee splits into the agency's cut, the mother
 * agency's override, the advance it recoups and the net; under a Guarantee the retainer the legacy hook just paid
 * (`s.floor`) is covered from the net first, so the total is max(floor, net fees). The cover is booked as recouped on
 * the ledger row, so gross = agency + mother + recoup + net exactly.
 */
function settleBooked(c: CareerCtx<ModelState>, job: ReturnType<typeof modelJob>): Settled {
  const { g, s } = c
  const out: Settled = { n: 0, kept: 0, days: 0, trips: 0, wins: [] }
  const k = job ? readContract(job, g) : null
  let unrecouped = k?.unrecouped ?? 0
  let floorLeft = Math.max(0, fin(s.floor))
  const f = FOCUS[s.focus] ?? FOCUS.editorial
  for (const o of s.board.items) {
    if (o.status !== 'booked') continue
    o.status = 'paid'
    const t = o.terms ?? { agency: '', commission: 0, mother: 0 }
    // a full likeness licence cuts digital fees 5% for the three years of castings it covers
    const fee = o.kind === 'digital' && (s.cool.licence ?? -1) >= c.year - 1 ? Math.round(o.fee * 0.95) : o.fee
    const split = settleFee(fee, t.commission, t.mother, unrecouped)
    const cover = Math.min(floorLeft, split.net)
    payOut(c, o.house || 'Client', fee, { agency: split.agency, mother: split.mother, recoup: split.recoup + cover })
    unrecouped -= split.recoup
    floorLeft -= cover
    out.n += 1
    out.kept += split.net
    out.days += o.days
    if (o.abroad && isShow(o)) out.trips += 1
    out.wins.push({ points: (KINDS[o.kind]?.points ?? 0) * (TIER_PRESTIGE[o.minTitle] ?? 1.5) * (isShow(o) ? f.showBook : f.workBook) })
    s.life.booked = Math.min(COUNT_MAX, s.life.booked + 1)
    if (o.kind === 'face') s.life.faces = Math.min(COUNT_MAX, s.life.faces + 1)
    if (isShow(o)) s.life.shows = Math.min(COUNT_MAX, s.life.shows + 1)
  }
  if (job && k && out.n > 0 && unrecouped !== k.unrecouped) saveContract(job, { ...k, unrecouped: Math.max(0, unrecouped) })
  return out
}

function run(c: CareerCtx<ModelState>, live: boolean): string | void {
  const { g, s, year } = c
  const job = live ? modelJob(g) : null
  if (job) adoptJob(g, s, job)
  const passed = s.board.items.filter((o) => o.status === 'passed').length
  const paid = settleBooked(c, job)
  // last year's board is closed: its offers are paid, lost or passed. A board that was worked is replaced by this year's
  // (written once, so it holds all year); an idle record writes nothing and derives the board on demand.
  const stale = s.board.items.length > 0 && s.board.year < year
  const worked = stale && s.board.items.some((o) => o.status !== 'open')
  if (stale) s.board = { year: 0, items: [] }
  if (!job) {
    for (const a of s.agencies) if (a.to === 0) a.to = year // the stint ended when the job did
    s.floor = 0 // with the job gone only the booked rows settle
    protegeIncome(c) // and the desk, when there is one
    return paid.n > 0 ? `Kept ${short(paid.kept)}.` : undefined
  }

  // strain, then the look it costs
  const rest = (s.restYear === year - 1 ? 30 : 0) + (s.planYear === year - 1 ? 15 : 0)
  s.strain = round1(strainNext(s.strain, paid.days, paid.trips, rest))
  if (s.strain > 75) addStat(g, 'health', -2)

  // book, buzz, reputation and mood
  s.book = round1(bookAfter(s.book, paid.wins))
  s.buzz = clamp(round1(0.7 * s.buzz + 8 * Math.min(3, paid.n) + 0.15 * fameOf(g) + Math.min(12, 3 * Math.log10(1 + Math.max(0, fin(totalFollowers(g))) / 1000))), 0, 100)
  s.rep = clamp(round1(s.rep + 2 * paid.n - 8 * passed), 0, 100)
  s.mood = clamp(round1(0.8 * s.mood + 12 + 0.25 * (fin(job.performance, 50) - 50) - 10 * passed - (s.strain > 75 ? 8 : 0)), 0, 100)

  // the score, the ranking and the report line
  const score = scoreOf(lookValue(g, s), s.book, s.buzz, s.rep)
  s.standing = Math.round(score)
  s.peak = Math.max(s.peak, s.standing)
  const ranking = rankingOf(g, s)
  const ranked = standingOf(g, MODEL_SPEC, score, s.memory).top.length > 0
  const last = s.rows[s.rows.length - 1]
  const before = last && last.rank > 0 ? last.rank + tail(last.standing) : 0
  // the best ranking counts the years you worked
  if (ranked && paid.n > 0 && (s.life.peak === 0 || ranking < s.life.peak)) {
    s.life.peak = Math.min(1000, ranking)
    s.life.peakYear = year
  }
  if (ranked && ranking === 1) {
    addFame(g, 5)
    careerLog(c, 'I was named Model of the Year.', 'good')
    careerSay(c, 'Model of the Year', "You're the top model of the year.", '\u{1F3C6}', 'good')
  }
  const bits: string[] = []
  if (ranked) bits.push(ranking > 50 ? 'Outside the top 50.' : `Ranking ${ranking}${before > 0 && before !== ranking ? (ranking < before ? `, up ${before - ranking}` : `, down ${ranking - before}`) : ''}.`)
  if (paid.kept > 0) bits.push(`Kept ${short(paid.kept)}.`)
  const note = bits.join(' ')
  if (note) careerLog(c, note)

  // the term: dropped or renewed
  contractEnd(c)

  // what the next legacy tick pays: the retainer under a guarantee, nothing on commission only
  const held = modelJob(g)
  const k = held ? readContract(held, g) : null
  if (held && k && !k.guarantee) held.salary = 0
  s.floor = held && k?.guarantee ? Math.max(0, Math.round(fin(held.salary))) : 0
  if (worked && held) s.board = { year, items: buildBoard(g, s) }
  // the exits you have earned are announced once, and a desk pays its proteges
  unlockExits(c)
  protegeIncome(c)
  return note
}

const hook = settleYear({
  career: 'model',
  store: modelStore,
  incomeLabel: 'Bookings',
  active: (g) => !!modelJob(g),
  run,
  peers: { spec: MODEL_SPEC, score: (g, s) => scoreOf(lookValue(g, s), s.book, s.buzz, s.rep) },
  crises: modelCrises,
})

export const modelSim: CareerSim = { id: 'model', key: 'model.sim', yearly: hook }
