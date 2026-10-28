// Astronaut 2.0 sim: the yearly entry the kit runs after the legacy hook has booked its year (the legacy hook still
// pays the salary, moves performance, retires and promotes; the sim never pays salary). The kit's settleYear owns the
// marker, the peer ranking, the report row and the popup budget; `run` is the year itself: the world (funding, mood,
// safety), the body, the family, the world manifest and its accidents, the class intake, standing and the inquiries.
// It closes the year just ended (flights of year - 1). Flight pay is earned when the flight resolves, not here.
import { seeded } from '../assets'
import { addRelationship, addStat } from '../core'
import { chance, randInt, weightedPick } from '../rng'
import { outcomeTag } from '../timeMachine'
import type { GameState } from '../types'
import { astronautJob } from './astronaut'
import { astroCrises, forcedChoice, reportCard } from './astronaut-events'
import { adminFallout, adminYear, hallOfFame, memoirTail, noteFirsts } from './astronaut-exits'
import { crewNames, jobAccess, manifestOf } from './astronaut-flight'
import { runBoard, classYear } from './astronaut-class'
import { CAUSES, CAUSE_WEIGHT, COVERUP, FRACTURE_LINE, FRACTURE_ODDS, LOSS, MISSIONS, PEER_PREP, RECOVERY, STRAIN, BONE_LINE, type MissionId } from './astronaut-data'
import { astronautStore, readAstro, type AstroState } from './astronaut-state'
import { ASTRO_SPEC, fundingIndex, launchRisk, missionsOpen, moodTarget, shock, tourDays } from './astronaut-world'
import type { CareerSim } from './kit/careers'
import { familySeed } from './kit/rivals'
import { cap, nextId } from './kit/state'
import { budgetLevel, careerLog, careerSay, settleYear, type CareerCtx } from './kit/year'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const round1 = (n: number): number => Math.round(n * 10) / 10
const list = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

const PARTNERS = new Set(['spouse', 'partner', 'fiance'])
/** A stress fracture follows the flight after a 'Return early' answer this often. */
const EARLY_FRACTURE = 0.15

/** The legacy profile keeps counting landings and spacewalks the old scripts book; the tally never falls behind it. */
function syncLegacy(s: AstroState, g: GameState): void {
  const legacy = readAstro(g)
  s.tally.evas = Math.max(s.tally.evas, legacy.spacewalks)
  s.tally.lunar = Math.max(s.tally.lunar, legacy.moonLandings)
  s.tally.mars = Math.max(s.tally.mars, legacy.marsLandings)
}

/** A partner at 50+ strain loses a little warmth each year; at 60+ each child under 18 loses 2. */
function familyCost(g: GameState, s: AstroState): void {
  if (s.family < STRAIN.partnerFrom) return
  const partner = g.people.find((p) => p.alive && PARTNERS.has(p.relation))
  if (partner) addRelationship(g, partner, -Math.min(6, Math.round((s.family - 40) / 6)))
  if (s.family < STRAIN.childFrom) return
  for (const p of g.people) if (p.alive && p.relation === 'child' && p.age < 18) addRelationship(g, p, -2)
}

/** A peer's flight is lost: 1 to 3 crew are named in one new inquiry, mood and safety fall. */
function peerLoss(c: CareerCtx<AstroState>, type: MissionId, i: number): void {
  const { g, s } = c
  const lost = crewNames(g, `lost.${c.year}.${i}`, randInt(g, 1, 3))
  const cause = weightedPick(g, CAUSES, (x) => CAUSE_WEIGHT[x])
  s.inquiries = cap([...s.inquiries, { id: nextId(s, 'iq'), year: c.year, cause, lost, involved: false, yearsOpen: 0, status: 'open', stance: '', coverup: false }], 4)
  s.mood = clamp(s.mood - LOSS.mood, 0, 100)
  s.safety = clamp(s.safety - LOSS.safety, 15, 95)
  careerSay(c, 'Lost Crew', `A ${MISSIONS[type].label.toLowerCase()} was lost. ${list(lost)} didn't come home.`, '\u{1F4A5}', 'bad')
  // An administrator who pushed the schedule last year can lose the post over a schedule cause.
  if (cause === 'schedule') adminFallout(c)
}

/**
 * Inquiries age a year at a time (never in the year they open). One year in, an inquiry you were not part of closes
 * with safety +4, unless you hold rank 3 or more: then it waits for your testimony (the forced choice). A cover-up
 * leaks 20% a year for 4 years after the loss (standing -8, mood -8). Still unanswered at 3 years it closes as a
 * recusal, with blame +1 when you were involved.
 */
function ageInquiries(c: CareerCtx<AstroState>): void {
  const { g, s, year } = c
  const senior = (astronautJob(g)?.level ?? 0) >= 3
  for (const i of s.inquiries) {
    if (i.status === 'open' && i.year < year) {
      i.yearsOpen = Math.min(9, i.yearsOpen + 1)
      if (i.yearsOpen === 1 && !i.involved && !senior) {
        i.status = 'closed'
        s.safety = clamp(s.safety + 4, 15, 95)
      } else if (i.yearsOpen >= 3) {
        i.status = 'closed'
        if (i.stance === '') {
          i.stance = 'recuse'
          if (i.involved) s.tally.blame = Math.min(20, s.tally.blame + 1)
        }
      }
    }
    if (i.coverup && year - i.year <= COVERUP.years && chance(g, COVERUP.leak)) {
      i.coverup = false
      s.standing = clamp(s.standing - COVERUP.standing, 0, 100)
      s.mood = clamp(s.mood - COVERUP.mood, 0, 100)
      careerSay(c, 'Report Leaked', "A report leaked. The agency's account of the inquiry didn't hold.", '\u{1F4F0}', 'bad')
    }
  }
}

function run(c: CareerCtx<AstroState>, live: boolean): string | void {
  const { g, s, year } = c
  // The memoir tail pays whatever the corps says. Out of it (cadet, retired, no job) only what is already earned
  // pays out, and a retirement at 60 or over enters the Hall of Fame.
  memoirTail(c)
  if (!live) return hallOfFame(c)
  const job = astronautJob(g)
  if (!job) return
  syncLegacy(s, g)
  const last = s.flights.filter((f) => f.year === year - 1)
  const flew = last.length > 0
  const clean = last.filter((f) => f.result === 'clean').length
  const aborts = last.filter((f) => f.result === 'abort').length
  const commands = last.filter((f) => f.result === 'clean' && f.role === 'commander').length

  // 1. The world: funding from the line, the economy, the mood and the lobby (a pure read).
  const funding = fundingIndex(g, s, year)
  s.fund = cap([...s.fund, funding], 6)
  s.lobby = Math.trunc(s.lobby / 2) + 0 // this year's funding counted the whole lobby; it halves toward zero for the next

  // 2. Mood: toward the era's target, the year's shock, clean flights up, aborts down. A lost crew of yours hit it when it happened.
  s.mood = clamp(Math.round(s.mood + Math.round(0.25 * (moodTarget(year) - s.mood)) + shock(year, g.character.countryId) + 2 * clean - 4 * aborts), 0, 100)

  // 3. Safety culture: funding keeps it up, a thin year or a cut space line wears it down. A cut counts for this year and the next.
  if (budgetLevel(g, 'space') < 1) s.cool.cut = Math.min(9999, year + 1)
  const cut = (s.cool.cut ?? -1) >= year
  s.safety = clamp(s.safety + (funding >= 60 ? 2 : 0) - (funding < 35 ? 3 : 0) - (cut ? 3 : 0), 15, 95)

  // 4. Body: free recovery (more in a year at home), then the price of thin bones. Dose never recovers.
  const rest = flew ? RECOVERY.flight : RECOVERY.rest
  s.bone = Math.min(100, round1(s.bone + rest.bone))
  s.muscle = Math.min(100, round1(s.muscle + rest.muscle))
  if (s.bone < BONE_LINE) addStat(g, 'health', -Math.min(3, Math.ceil((BONE_LINE - s.bone) / 10)))
  if (s.bone < FRACTURE_LINE && chance(g, FRACTURE_ODDS)) {
    addStat(g, 'health', -randInt(g, 5, 10))
    careerLog(c, 'I had a stress fracture.', 'bad')
  }
  // Returning early last year risks a stress fracture on the flight that followed (the flag covers that one year).
  if (flew && (s.cool.early ?? -1) >= year - 1 && chance(g, EARLY_FRACTURE)) {
    addStat(g, 'health', -randInt(g, 5, 10))
    careerLog(c, 'I had a stress fracture after flying too soon.', 'bad')
  }

  // 5. Family strain: a year at home eases it, high strain costs the relationships at home.
  if (!flew) s.family = Math.max(0, round1(s.family - STRAIN.home))
  familyCost(g, s)

  // 6. The world manifest: n flights a year (yours is one of them); each peer flight rolls the same launch risk.
  const ac = jobAccess(g)
  const open = ac ? missionsOpen(g, ac.agency, year).filter((t) => t !== 'own') : []
  const peers = Math.max(0, manifestOf(year, funding) - (flew ? 1 : 0))
  for (let i = 0; i < peers && open.length > 0; i++) {
    const type = seeded(`astro|${familySeed(g)}|peer|${year}|${i}${outcomeTag(g, year)}`).pick(open)
    const days = tourDays(type, year)[0]
    if (chance(g, launchRisk(g, s, type, days, { prep: PEER_PREP, squeeze: false, rocketeer: ac?.agency === 'rocketeer' }))) peerLoss(c, type, i)
  }

  // 7. Class intake: the year's class is logged (not yours: rank 0) with its seats, finalists and cut.
  if (ac && classYear(ac.agency, year)) {
    const r = runBoard(g, s, ac.id, year, { roll: 0 })
    s.classes = cap([...s.classes, { year, agency: ac.id, seats: r.seats, finalists: r.finalists, rank: 0, cut: r.cut, mates: [] }], 6)
  }

  // 8. Standing follows performance, flights and commands; two idle years in a row cost 2 (admin years fly nothing).
  const idle = job.level >= 1 && job.level < 6 && !flew && !s.flights.some((f) => f.year === year - 2)
  s.standing = clamp(Math.round(s.standing + Math.round(0.25 * (job.performance - s.standing)) + 4 * clean + 2 * commands - (idle ? 2 : 0)), 0, 100)
  s.peak = Math.max(s.peak, s.standing)

  // 9. Inquiries, the firsts the record has earned, and an administrator's year (no flights, and the budget choice).
  ageInquiries(c)
  noteFirsts(s, year)
  if (astronautJob(g)) adminYear(c)

  // 10. The report card, then the forced choices (the medical board, testimony, the budget): the kit offers a random crisis after.
  reportCard(c)
  forcedChoice(c)

  return `Funding ${funding}, mood ${s.mood}, safety ${s.safety}, bone ${Math.round(s.bone)}.`
}

const hook = settleYear({
  career: 'astronaut',
  store: astronautStore,
  incomeLabel: 'Fees',
  active: (g) => !!astronautJob(g),
  run,
  peers: { spec: ASTRO_SPEC, score: (_g, s) => s.standing },
  crises: astroCrises,
})

export const astronautSim: CareerSim = { id: 'astronaut', key: 'astronaut.sim', yearly: hook }
