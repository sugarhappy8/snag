import { afterEach, describe, expect, it, vi } from 'vitest'
import { scriptChoice, yearActionsUsed } from '../src/game/core'
import { policyOf, writePolicy } from '../src/game/nation/state'
import { runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { astronautCareerMenu, astronautJobNodes, yearlyAstronaut } from '../src/game/special/astronaut'
import { ERA, MISSIONS } from '../src/game/special/astronaut-data'
import {
  astroPromotionOk,
  bestRegimen,
  bidBlock,
  bidRivals,
  bidScore,
  buildOffers,
  legacyDest,
  manifestOf,
  resolveFlight,
  runBid,
  tourOptions,
  trainSkills,
  type Offer,
} from '../src/game/special/astronaut-flight'
import { astronautSim } from '../src/game/special/astronaut-sim'
import { astronautStore, type AstroState } from '../src/game/special/astronaut-state'
import { ASTRO_SPEC, FATAL_SHARE, fundingIndex, launchRisk, projectBody } from '../src/game/special/astronaut-world'
import { hire, ownerKey } from '../src/game/special/common'
import { CAREER_SIMS } from '../src/game/special/kit/careers'
import * as rivals from '../src/game/special/kit/rivals'
import { activeField, standingOf } from '../src/game/special/kit/rivals'
import { ACTION_BUDGET, careerCtx, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import type { ChoiceModal, GameState, Json, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { assertMenuPure, BAD_TEXT, careerRoots, checkLedger, finiteJson, nextYear, voiceProblems } from './career-kit'
import { makeTestGame } from './helpers'

const FLAG = 'special.astronaut.sim'
const LEGACY = 'special.astronaut'
const BOARD = 'career.astronaut.board'
const PLAN = 'career.astronaut.plan'

afterEach(() => {
  vi.restoreAllMocks()
  setCareerAudit(null)
})

/** No peer corps: every seat on the board is uncontested. */
const soloCorps = (): void => void vi.spyOn(rivals, 'activeField').mockReturnValue([])

/** A notice-kind modal: runScript keeps no replay token for it, so a script's own guards are what is tested. */
let serial = 0
const fake = (): ModalItem => ({ kind: 'notice', id: `t${++serial}`, title: '', text: '' })

const ctxOf = (g: GameState, s: AstroState = astronautStore.mut(g)): CareerCtx<AstroState> => careerCtx(g, 'astronaut', s, { ...ACTION_BUDGET })

interface Fx { g: GameState; s: AstroState }

/** A 2026 life with a Mission Specialist job, a migrated record (standing 70, skills 42) and cash. */
function newAstro(seed = 5, o: { year?: number; country?: string; level?: number; skills?: Partial<AstroState['skills']>; standing?: number; salary?: number; agency?: string; perf?: number; age?: number } = {}): Fx {
  const age = o.age ?? 36
  const g = makeTestGame(seed, { age, countryId: o.country ?? 'us' })
  g.year = o.year ?? 2026
  g.log = [{ age, year: g.year, entries: [] }]
  g.character.money = 500_000
  hire(g, { defId: 'astronaut', title: 'Mission Specialist', company: 'Orbital Exploration Agency', salary: o.salary ?? 100_000, level: o.level ?? 2, performance: o.perf ?? 70, data: { agency: o.agency ?? 'oea', lastMissionAge: -1 } })
  const s = astronautStore.mut(g)
  Object.assign(s.skills, o.skills ?? {})
  if (o.standing !== undefined) s.standing = o.standing
  return { g, s }
}

const missionRow = (g: GameState): MenuAction => {
  const n = astronautJobNodes(g).find((x) => 'id' in x && x.id === 'astro.mission')
  if (!n || n.type !== 'action') throw new Error('no Flight Board row')
  return n
}

const choiceOf = (g: GameState, scriptId: string): ChoiceModal | undefined => g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === scriptId)

/** Takes the first choice modal of a script off the queue, the way the store does when the player answers it. */
function take(g: GameState, scriptId: string): ChoiceModal {
  const at = g.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === scriptId)
  if (at < 0) throw new Error(`no ${scriptId} modal queued`)
  return g.queue.splice(at, 1)[0] as ChoiceModal
}

/** Answers every queued modal with its first choice (or the choice `pref` names for that script); returns what it saw. */
function settle(g: GameState, pref: Record<string, string> = {}): ModalItem[] {
  const seen: ModalItem[] = []
  for (let guard = 0; g.queue.length > 0 && guard < 100; guard++) {
    const m = g.queue.shift()!
    seen.push(m)
    const at = g.queue.length
    if (m.kind === 'choice') runScript(g, m.scriptId!, m.choices.some((c) => c.id === pref[m.scriptId!]) ? pref[m.scriptId!] : m.choices[0].id, m.data, m)
    else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue ?? 'Test', m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'done', m.data, m)
    g.queue.unshift(...g.queue.splice(at))
  }
  return seen
}

/** Opens the Flight Board and answers it all the way to a flight. */
function fly(g: GameState, pref: Record<string, string> = {}): ModalItem[] {
  const a = missionRow(g)
  if (a.disabledReason?.(g)) return []
  a.run(g)
  return settle(g, pref)
}

/** What a replay must not move: the flags, the cash, the rng, the year actions, the queue. */
const state = (g: GameState): string => JSON.stringify([g.flags, g.character.money, g.rng, g.yearActions, g.queue.length, g.character.alive])

const station = (o: Partial<Offer> = {}): Offer => ({ id: 'o0', type: 'station', days: 90, role: 'specialist', seats: 3, risk: 0.01, rival: null, edge: 0, ...o })

const nodesIn = (v: unknown): number => (Array.isArray(v) ? 1 + v.reduce((n: number, x) => n + nodesIn(x), 0) : v && typeof v === 'object' ? 1 + Object.values(v).reduce((n: number, x) => n + nodesIn(x), 0) : 1)

describe('astronaut flight board', () => {
  it('prints an edge equal to bidScore minus the rival score, and the hint marks the largest edge', () => {
    const { g, s } = newAstro(5, { level: 3, skills: { eva: 60, pilot: 60, team: 60 } })
    const offers = buildOffers(g, s)
    expect(offers.length).toBeGreaterThan(1)
    const field = activeField(g, ASTRO_SPEC, s.memory)
    for (const o of offers) {
      expect(o.rival).not.toBeNull()
      expect(o.edge).toBe(bidScore(g, s, o) - field.find((x) => x.rival.id === o.rival!.id)!.score)
      expect(o.seats).toBe(MISSIONS[o.type].seatCount)
    }
    const top = offers.reduce((best, o) => (o.edge > best.edge ? o : best))

    // Without the talent the board names no best seat; with it, the one with the largest edge.
    missionRow(g).run(g)
    const plain = choiceOf(g, BOARD)!
    expect(plain.choices.filter((c) => c.hint)).toEqual([])
    g.queue = []
    g.yearActions = {}
    g.character.talent = 'Academics'
    missionRow(g).run(g)
    const m = choiceOf(g, BOARD)!
    const hinted = m.choices.filter((c) => c.hint)
    expect(hinted).toHaveLength(1)
    expect(hinted[0].id).toBe(top.id)
    expect(hinted[0].hint).toContain(`${top.edge >= 0 ? '+' : ''}${top.edge}`)
    expect(hinted[0].hint).not.toMatch(/will/)
    expect(m.choices.at(-1)?.id).toBe('cancel')
    for (const o of offers) expect(m.choices.find((c) => c.id === o.id)?.label).toContain(`edge ${o.edge >= 0 ? '+' : ''}${o.edge}`)
    expect(m.text).toMatch(/What will you do\?$/)
  })

  it('shows the seats as info rows and reads without drawing g.rng or writing [RF5]', () => {
    const { g, s } = newAstro(5)
    const rows = astronautJobNodes(g).filter((n) => 'id' in n && n.id.startsWith('astro.board.'))
    expect(rows).toHaveLength(buildOffers(g, s).length)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) if (r.type === 'info') expect(String(r.text).length).toBeLessThanOrEqual(90)
    const before = JSON.stringify(g)
    buildOffers(g, s)
    bidRivals(g, s, 'station')
    expect(JSON.stringify(g)).toBe(before)
  })

  it('builds at most four seats, none under funding 20, and never the Moon in 2026', () => {
    const { g, s } = newAstro(5, { skills: { pilot: 60 } })
    const offers = buildOffers(g, s)
    expect(offers.length).toBeGreaterThan(0)
    expect(offers.length).toBeLessThanOrEqual(4)
    expect(offers.some((o) => o.type === 'moon' || o.type === 'mars' || o.type === 'deep')).toBe(false)
    expect(offers.every((o) => o.role !== 'commander')).toBe(true) // rank 2: no command seat
    expect(missionRow(g).disabledReason?.(g)).toBeNull()
    // a starved space line, a gloomy public and a lobby under water: funding under 20 builds no seats and says why
    const p = structuredClone(policyOf(g, 'us'))
    p.national.budget.space = 0.5
    writePolicy(g, p)
    s.mood = 0
    s.lobby = -6
    expect(fundingIndex(g, s)).toBeLessThan(20)
    expect(buildOffers(g, s)).toEqual([])
    expect(missionRow(g).disabledReason?.(g)).toBe('No flights are scheduled this year.')
    // the manifest follows funding and the era
    expect(manifestOf(2026, 10)).toBe(1)
    expect(manifestOf(2026, 100)).toBe(6)
    expect(manifestOf(1978, 100)).toBe(2)
    expect(ERA.lull.manifest).toBe(1)
  })

  it('gates roles by level and skill inside run, not only in the menu', () => {
    // a commander seat built for a rank-4 astronaut is refused once the rank is 3, by a direct bid
    let found: { g: GameState; s: AstroState; o: Offer } | null = null
    for (let year = 2021; year < 2031 && !found; year++) {
      const fx = newAstro(5, { year, level: 4, skills: { pilot: 60, eva: 60, team: 60 } })
      const o = buildOffers(fx.g, fx.s).find((x) => x.role === 'commander')
      if (o) found = { ...fx, o }
    }
    expect(found).not.toBeNull()
    const { g, s, o } = found!
    expect(bidBlock(g, s, o)).toBeNull()
    g.character.job!.level = 3
    expect(bidBlock(g, s, o)).toMatch(/Mission Commander/)
    const flags = JSON.stringify(g.flags)
    expect(runBid(ctxOf(g, s), o.id)).toBe('lost')
    expect(yearActionsUsed(g, 'astro.bid')).toBe(0)
    expect(yearActionsUsed(g, 'astro.mission')).toBe(0)
    expect(JSON.stringify(g.flags)).toBe(flags)
    expect(g.queue.some((m) => m.kind === 'notice' && /Mission Commander/.test(m.text))).toBe(true)

    // a pilot seat with pilot skill 49 is refused, and with 50 it is open
    const fx = newAstro(5, { level: 3, skills: { pilot: 60, eva: 60, team: 60 } })
    const seat = buildOffers(fx.g, fx.s).find((x) => x.role === 'pilot')
    expect(seat).toBeDefined()
    fx.s.skills.pilot = 49
    expect(bidBlock(fx.g, fx.s, seat!)).toMatch(/pilot skill/)
    expect(runBid(ctxOf(fx.g, fx.s), seat!.id)).toBe('lost')
    expect(yearActionsUsed(fx.g, 'astro.bid')).toBe(0)
    fx.s.skills.pilot = 50
    expect(bidBlock(fx.g, fx.s, seat!)).toBeNull()
    // the specialist seat needs rank 1; a candidate is refused with the legacy words
    fx.g.character.job!.level = 0
    expect(bidBlock(fx.g, fx.s, station())).toMatch(/not cleared/)
  })

  it('refuses a tour that would pass dose 100 and a bid in a grounded year, by direct run [RF3]', () => {
    soloCorps()
    const { g, s } = newAstro(5, { skills: { pilot: 60 } })
    s.dose = 80
    missionRow(g).run(g)
    const board = take(g, BOARD)
    runScript(g, BOARD, buildOffers(g, s).find((o) => o.type === 'station')!.id, board.data, board)
    // 80 + 180 x 0.12 passes 100: only the 90-day tour is left, so the length step is skipped for the care plan
    const plan = take(g, PLAN)
    expect(plan.data).toMatchObject({ step: 'regimen', days: 90 })
    expect(tourOptions(g, s, station())).toEqual([90])
    const flights = s.flights.length
    const cash = g.character.money
    // a direct run of the length step with the longer tour is refused, whatever the menu showed
    runScript(g, PLAN, 'd180', { ...(plan.data as Record<string, Json>), step: 'days', n: 'by-hand' }, fake())
    expect(astronautStore.view(g).flights).toHaveLength(flights)
    expect(g.character.money).toBe(cash)
    expect(g.queue.some((m) => m.kind === 'notice' && /not open to you/.test(m.text))).toBe(true)
    // and the care plan step with a longer tour in its data is refused too
    runScript(g, PLAN, 'standard', { ...(plan.data as Record<string, Json>), days: 180, n: 'by-hand-2' }, fake())
    expect(astronautStore.view(g).flights).toHaveLength(flights)
    expect(g.character.money).toBe(cash)

    // a grounded year: the row is disabled with the reason, a direct run says it and changes nothing, a direct bid is refused
    const h = newAstro(6)
    h.s.mark.groundedYear = h.g.year
    const offer = buildOffers(h.g, h.s)[0]
    const row = missionRow(h.g)
    expect(row.disabledReason?.(h.g)).toMatch(/leave/)
    const before = JSON.stringify(h.g.flags)
    row.run(h.g)
    expect(JSON.stringify(h.g.flags)).toBe(before)
    expect(runBid(ctxOf(h.g, h.s), offer.id)).toBe('lost')
    expect(yearActionsUsed(h.g, 'astro.bid')).toBe(0)
    expect(JSON.stringify(h.g.flags)).toBe(before)

    // a full dose bans flights outright
    const d = newAstro(7)
    d.s.dose = 100
    expect(missionRow(d.g).disabledReason?.(d.g)).toMatch(/radiation/)
  })
})

describe('astronaut flights', () => {
  it('keeps 300 seeded station flights within the launch-risk band', () => {
    const { g, s } = newAstro(5)
    const risk = launchRisk(g, s, 'station', 180, { prep: 1.2, squeeze: false, rocketeer: false })
    expect(risk * FATAL_SHARE).toBeGreaterThanOrEqual(0.002)
    expect(risk * FATAL_SHARE).toBeLessThanOrEqual(0.01)
    let deaths = 0
    for (let seed = 1; seed <= 300; seed++) {
      const h = structuredClone(g)
      h.rng = seed
      resolveFlight(ctxOf(h), station({ days: 180 }), 180, 'standard')
      if (!h.character.alive) deaths++
    }
    expect(deaths).toBeLessThanOrEqual(6)
  })

  it('opens exactly one inquiry per lost crew', () => {
    const { g, s } = newAstro(5)
    s.safety = 40
    s.mark.rush = true // a schedule squeeze: 1.3 x the risk
    let losses = 0
    for (let seed = 1; seed <= 1500 && losses < 6; seed++) {
      const h = structuredClone(g)
      h.rng = seed
      const mood = astronautStore.view(h).mood
      resolveFlight(ctxOf(h), station({ days: 180 }), 180, 'standard')
      const t = astronautStore.view(h)
      const lost = t.flights.filter((f) => f.result === 'anomaly').length
      expect(t.inquiries.length).toBe(lost) // one inquiry for one loss, none for a clean flight or a death
      if (lost === 0) continue
      losses++
      const inq = t.inquiries[0]
      expect(inq.lost.length).toBeGreaterThanOrEqual(1)
      expect(inq.lost.length).toBeLessThanOrEqual(3)
      expect(t.flights[0].crew).toEqual(expect.arrayContaining(inq.lost))
      expect([inq.involved, inq.status, inq.yearsOpen, inq.stance, inq.coverup, inq.year]).toEqual([true, 'open', 0, '', false, h.year])
      expect(['hardware', 'procedure', 'schedule', 'crew']).toContain(inq.cause)
      expect(t.mood).toBe(mood - 18)
      expect(t.safety).toBe(30)
      expect(t.mark.rush).toBe(false) // the squeeze was spent
      expect(t.tally.flights).toBe(0) // a failed launch is not a flight flown
      expect(h.character.alive).toBe(true)
    }
    expect(losses).toBeGreaterThan(0)
  })

  it('flies a clean tour: pay through the ledger, the body, the record, a crewmate', () => {
    soloCorps()
    const { g, s } = newAstro(5)
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    s.skills.fit = 70
    const body = projectBody(s, 180, 'standard', 70)
    expect([body.bone, body.muscle, body.dose, body.strain].map((x) => +x.toFixed(1))).toEqual([4.9, 7.6, 21.6, 8.4])
    const cash = g.character.money
    let h = g
    for (let seed = 1; seed <= 40; seed++) {
      h = structuredClone(g)
      h.rng = seed
      resolveFlight(ctxOf(h), station({ days: 180 }), 180, 'standard')
      if (astronautStore.view(h).flights[0]?.result === 'clean') break
    }
    const t = astronautStore.view(h)
    expect(t.flights).toHaveLength(1)
    expect(t.flights[0]).toMatchObject({ year: 2026, type: 'station', role: 'specialist', days: 180, regimen: 'standard', result: 'clean' })
    expect(t.flights[0].crew).toHaveLength(2)
    expect([t.bone, t.muscle, t.dose, t.family]).toEqual([95.1, 92.4, 21.6, 8.4])
    expect([t.flights[0].bone, t.flights[0].dose]).toEqual([95.1, 21.6])
    expect(t.tally).toMatchObject({ flights: 1, days: 180, commands: 0 })
    expect(astronautJobNodes(h).length).toBeGreaterThan(0)
    expect(h.character.job!.data.lastMissionAge).toBe(h.character.age)
    const pay = events.filter((e) => e.t === 'earn' && e.label === 'Flight pay')
    expect(pay).toHaveLength(1)
    const amount = pay[0].t === 'earn' ? pay[0].amount : 0
    expect(amount).toBeGreaterThan(0)
    expect(amount).toBeLessThanOrEqual(0.4 * 100_000)
    expect(h.character.money - cash).toBe(amount)
    const mates = h.people.filter((p) => p.relation === 'coworker' && p.contextId === h.character.job!.company)
    expect(mates).toHaveLength(1)
    expect(`${mates[0].firstName} ${mates[0].lastName}`).toBe(t.flights[0].crew[0])
  })

  it('settles once per (year, age) and pays salary once, the sim never pays it [RF3]', () => {
    const { g } = newAstro(5)
    const m0 = g.character.money
    g.year += 1
    g.character.age += 1
    yearlySpecial(g)
    expect(g.character.money - m0).toBe(100_000) // the legacy hook paid the salary
    const once = JSON.stringify(g)
    const rng = g.rng
    yearlySpecial(g)
    expect(JSON.stringify(g)).toBe(once)
    expect(g.rng).toBe(rng)
    const t = astronautStore.view(g)
    expect(t.years).toBe(1)
    expect(t.rows).toHaveLength(1)
    expect(t.rows[0].income).toBe(0)
    // the sim alone moves no cash either
    const k = newAstro(8)
    const cash = k.g.character.money
    nextYear(k.g, astronautSim.yearly)
    expect(k.g.character.money).toBe(cash)
  })

  it('conserves money over 10 yearly cycles', () => {
    soloCorps()
    const { g } = newAstro(5, { age: 30 })
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const m0 = g.character.money
    let salary = 0
    let flown = 0
    for (let y = 0; y < 10 && g.character.alive; y++) {
      fly(g)
      flown = astronautStore.view(g).flights.length
      if (g.character.job) g.character.job.performance = 80
      salary += g.character.job?.salary ?? 0
      nextYear(g, yearlySpecial)
      settle(g)
    }
    setCareerAudit(null)
    const earned = events.reduce((n, e) => n + (e.t === 'earn' ? e.amount : 0), 0)
    const paid = events.reduce((n, e) => n + (e.t === 'pay' ? e.amount : 0), 0)
    expect(g.character.alive).toBe(true)
    expect(flown).toBeGreaterThanOrEqual(5)
    expect(earned).toBeGreaterThan(0)
    expect(events.filter((e) => e.t === 'earn').every((e) => e.t === 'earn' && e.label === 'Flight pay')).toBe(true)
    expect(g.character.money - m0).toBe(salary + earned - paid)
    expect(checkLedger(events, g).filter((x) => !x.startsWith('note-'))).toEqual([])
    expect(astronautStore.view(g).rows).toHaveLength(10)
  })

  it('pays flight pay once through the bridge, with no arrive bonus on top', () => {
    let checked = false
    for (let seed = 1; seed <= 30 && !checked; seed++) {
      const { g, s } = newAstro(seed)
      const events: AuditEvent[] = []
      setCareerAudit((e) => events.push(e))
      const cash = g.character.money
      resolveFlight(ctxOf(g, s), station({ type: 'orbit', days: 3, seats: 2 }), 3, 'standard')
      if (!g.character.alive) continue
      const modals = settle(g)
      setCareerAudit(null)
      if (!g.character.alive) continue
      const earned = events.reduce((n, e) => n + (e.t === 'earn' ? e.amount : 0), 0)
      expect(events.filter((e) => e.t === 'earn')).toHaveLength(1)
      expect(g.character.money - cash).toBe(earned) // exactly the flight pay: nothing else moved cash
      expect(modals.some((m) => 'text' in m && /mission bonus/.test(m.text))).toBe(false)
      checked = true
    }
    expect(checked).toBe(true)
    expect(buildOffers(newAstro(5).g, newAstro(5).s).some((o) => o.type === 'moon')).toBe(false)
    expect(['hop', 'orbit', 'orbiter', 'own'].map((t) => legacyDest(t as never))).toEqual(['flight', 'flight', 'flight', 'flight'])
    expect(['station', 'satellite', 'moon', 'deep', 'mars'].map((t) => legacyDest(t as never))).toEqual(['station', 'satellite', 'moon', 'deep', 'mars'])
  })

  it('runs the whole board: bid, tour length, care plan, flight [RF3]', () => {
    soloCorps()
    const { g } = newAstro(5, { skills: { pilot: 60 } })
    const cash = g.character.money
    for (let seed = 1; seed <= 20; seed++) {
      const h = structuredClone(g)
      h.rng = seed
      missionRow(h).run(h)
      const board = take(h, BOARD)
      expect(board.choices.length).toBeGreaterThan(1)
      // pick a station tour so the plan has two steps
      const pick = buildOffers(h, astronautStore.view(h)).find((o) => o.type === 'station')!
      runScript(h, BOARD, pick.id, board.data, board)
      const plan = take(h, PLAN)
      expect(plan.choices.map((c) => c.id)).toEqual(['d90', 'd180']) // rank 2: no year-long tour
      expect(plan.text).toMatch(/What will you do\?$/)
      runScript(h, PLAN, 'd180', plan.data, plan)
      const care = take(h, PLAN)
      expect(care.choices.map((c) => c.id)).toEqual(['light', 'standard', 'intense'])
      expect(care.choices.filter((c) => c.hint)).toEqual([]) // no Academics talent
      runScript(h, PLAN, 'standard', care.data, care)
      expect(yearActionsUsed(h, 'astro.mission')).toBe(1)
      if (!h.character.alive || astronautStore.view(h).flights.at(-1)?.result !== 'clean') continue
      expect(astronautStore.view(h).flights).toHaveLength(1)
      expect(h.character.money).toBeGreaterThan(cash)
      // the year's flight is spent: the row says so
      expect(missionRow(h).disabledReason?.(h)).toMatch(/already flew/)
      return
    }
    throw new Error('no seed gave a clean station flight')
  })

  it('marks the care plan with the lowest bone loss plus injury cost, for Academics only', () => {
    const { g, s } = newAstro(5, { skills: { pilot: 60 } })
    s.skills.fit = 70
    expect(bestRegimen(s, 180)).toBe('standard')
    s.skills.fit = 100
    expect(bestRegimen(s, 180)).toBe('intense') // a fit body takes the hard regimen's small injury chance
    s.skills.fit = 0
    expect(bestRegimen(s, 180)).toBe('standard')
    s.skills.fit = 70
    g.character.talent = 'Academics'
    const offers = buildOffers(g, s)
    const stationSeat = offers.find((o) => o.type === 'station')!
    expect(stationSeat).toBeDefined()
    soloCorps()
    missionRow(g).run(g)
    const board = take(g, BOARD)
    runScript(g, BOARD, stationSeat.id, board.data, board)
    const plan = take(g, PLAN)
    runScript(g, PLAN, 'd180', plan.data, plan)
    const care = take(g, PLAN)
    const hinted = care.choices.filter((c) => c.hint)
    expect(hinted.map((c) => c.id)).toEqual(['standard'])
    expect(hinted[0].hint).toMatch(/Bone about \d+ after this tour/)
  })

  it('offers the year-long station tour only from 2015 and at rank 3', () => {
    const low = newAstro(5, { level: 2 })
    expect(tourOptions(low.g, low.s, station())).toEqual([90, 180])
    const high = newAstro(5, { level: 3 })
    expect(tourOptions(high.g, high.s, station())).toEqual([90, 180, 365])
    const old = newAstro(5, { level: 3, year: 2010 })
    expect(tourOptions(old.g, old.s, station())).toEqual([90, 180])
    const dosed = newAstro(5, { level: 3 })
    dosed.s.dose = 60
    expect(tourOptions(dosed.g, dosed.s, station())).toEqual([90, 180]) // 60 + 365 x 0.12 passes 100
    const outpost = newAstro(5, { year: 1990 })
    expect(tourOptions(outpost.g, outpost.s, station())).toEqual([28, 56, 84])
  })

  it('rejects a stale or unknown board modal, and a replay [RF3]', () => {
    soloCorps()
    const { g } = newAstro(5)
    missionRow(g).run(g)
    const board = take(g, BOARD)
    const id = board.choices[0].id

    // an unknown seat, another owner, another year: nothing moves
    const base = state(g)
    runScript(g, BOARD, 'o9', board.data, fake())
    expect(state(g)).toBe(base)
    runScript(g, BOARD, id, { ...(board.data as Record<string, Json>), owner: 'v2:9:somebody-else' }, fake())
    expect(state(g)).toBe(base)
    g.year += 1
    runScript(g, BOARD, id, board.data, fake())
    g.year -= 1
    expect(state(g)).toBe(base)

    // the real answer flies once; a second answer to the same board does nothing
    runScript(g, BOARD, id, board.data, board)
    const plan = choiceOf(g, PLAN)
    expect(plan ?? g.queue.length).toBeTruthy()
    const planData = plan?.data
    settle(g)
    const after = state(g)
    runScript(g, BOARD, id, board.data, fake())
    expect(state(g)).toBe(after)
    if (planData) {
      runScript(g, PLAN, 'd90', planData, fake())
      runScript(g, PLAN, 'standard', planData, fake())
      expect(state(g)).toBe(after)
    }
    expect(astronautStore.view(g).flights.length).toBeLessThanOrEqual(1)
  })

  it('bids against a named rival: two bids a year, the second 3 lower, a lost bid spends only the bid', () => {
    /** The seat with a rival, with standing set so that your score equals theirs: a coin flip, give or take the swings. */
    const even = (fx: Fx): Offer => {
      const o = buildOffers(fx.g, fx.s).reduce((best, x) => (x.rival && x.edge > best.edge ? x : best), { edge: -1000 } as Offer) // the weakest rival is within reach
      const rival = bidScore(fx.g, fx.s, o) - o.edge
      fx.s.standing = Math.max(0, Math.min(100, Math.round((rival - 0.3 * fx.s.skills[o.role === 'pilot' ? 'pilot' : o.role === 'commander' ? 'team' : 'eva'] - 4 * fx.g.character.job!.level) / 0.5)))
      return buildOffers(fx.g, fx.s).find((x) => x.id === o.id)!
    }
    const { g, s } = newAstro(5, { level: 3, skills: { eva: 60, pilot: 60, team: 60 } })
    const seat = even({ g, s })
    expect(seat.rival).not.toBeNull()
    expect(Math.abs(seat.edge)).toBeLessThanOrEqual(2)
    // some seed wins, some loses; a win spends the year's flight, a loss does not
    let won = 0
    let lost = 0
    for (let seed = 1; seed <= 60 && (won === 0 || lost === 0); seed++) {
      const h = structuredClone(g)
      h.rng = seed
      const r = runBid(ctxOf(h), seat.id)
      const t = astronautStore.view(h)
      const row = t.memory.find((m) => m.id === seat.rival!.id)!
      expect(r === 'won' || r === 'lost').toBe(true)
      expect(row).toMatchObject({ met: 1, won: r === 'won' ? 1 : 0, lost: r === 'lost' ? 1 : 0 })
      expect(yearActionsUsed(h, 'astro.bid')).toBe(1)
      expect(yearActionsUsed(h, 'astro.mission')).toBe(r === 'won' ? 1 : 0)
      if (r === 'won') won++
      else lost++
    }
    expect(won).toBeGreaterThan(0)
    expect(lost).toBeGreaterThan(0)
    // 12 ahead of the rival wins nearly always, 12 behind nearly never (the swings are -5..5 and -4..4)
    const rate = (shift: number): number => {
      const h0 = structuredClone(g)
      astronautStore.mut(h0).standing = Math.max(0, Math.min(100, s.standing + shift))
      let n = 0
      for (let seed = 1; seed <= 80; seed++) {
        const h = structuredClone(h0)
        h.rng = seed
        if (runBid(ctxOf(h), seat.id) === 'won') n++
      }
      return n
    }
    expect(rate(+24)).toBeGreaterThan(70)
    expect(rate(-24)).toBeLessThan(10)
    // the second bid of a year is 3 lower: the same seed that wins the first bid by a hair loses the second
    const k = structuredClone(g)
    const c = ctxOf(k)
    k.rng = 3
    runBid(c, seat.id)
    k.yearActions['astro.mission'] = 0
    runBid(c, seat.id)
    expect(yearActionsUsed(k, 'astro.bid')).toBe(2)
    // a third is refused and spends nothing
    k.queue = []
    expect(runBid(c, seat.id)).toBe('lost')
    expect(yearActionsUsed(k, 'astro.bid')).toBe(2)
    expect(k.queue.some((m) => m.kind === 'notice' && /two bids/.test(m.text))).toBe(true)
  })

  it('makes a seat sure when no rival fits, and names no roster rival lost in an inquiry', () => {
    soloCorps()
    const { g, s } = newAstro(5)
    expect(buildOffers(g, s).every((o) => o.rival === null && o.edge === 0)).toBe(true)
    const r = runBid(ctxOf(g, s), buildOffers(g, s)[0].id)
    expect(r).toBe('sure')
    expect(yearActionsUsed(g, 'astro.mission')).toBe(1)
    vi.restoreAllMocks()
    const fx = newAstro(5)
    const seat = buildOffers(fx.g, fx.s).find((o) => o.rival)!
    fx.s.inquiries = [{ id: 'iq1', year: 2024, cause: 'hardware', lost: [seat.rival!.name], involved: false, yearsOpen: 0, status: 'open', stance: '', coverup: false }]
    expect(buildOffers(fx.g, fx.s).some((o) => o.rival?.name === seat.rival!.name)).toBe(false)
    expect(bidRivals(fx.g, fx.s, 'station').some((x) => x.name === seat.rival!.name)).toBe(false)
  })
})

describe('astronaut text and eras', () => {
  it('keeps the kit text in voice, free of holes, and every flight and ledger sound across five eras', () => {
    const places: [string, number][] = [['us', 1962], ['us', 1985], ['jp', 1990], ['us', 2026], ['us', 2045]]
    for (const [country, year] of places) {
      const { g } = newAstro(2, { country, year, level: 3, skills: { eva: 60, pilot: 60, fit: 60, team: 60 } })
      const events: AuditEvent[] = []
      setCareerAudit((e) => events.push(e))
      const modals: ModalItem[] = []
      let flights = 0
      for (let y = 0; y < 12 && g.character.alive; y++) {
        modals.push(...fly(g))
        if (g.character.job) g.character.job.performance = 80
        nextYear(g, yearlySpecial)
        modals.push(...settle(g))
      }
      setCareerAudit(null)
      flights = astronautStore.view(g).flights.length
      const where = `${country} ${year}`
      expect(flights, where).toBeGreaterThan(0)
      for (const e of events) {
        if (e.t !== 'text') continue
        expect(voiceProblems(e.text, e.role), `${where}: ${e.text}`).toEqual([])
      }
      for (const m of modals) if ('text' in m) expect(m.text, where).not.toMatch(BAD_TEXT)
      expect(checkLedger(events, g).filter((x) => !x.startsWith('note-')), where).toEqual([])
      expect(finiteJson(g), where).toEqual([])
      // the era's flights: no Moon before 1969 and none in 2026, nothing but orbit and hops in 1962
      const flown = astronautStore.view(g).flights
      for (const f of flown.filter((x) => x.year < 1969)) expect(['hop', 'orbit'], where).toContain(f.type)
      for (const f of flown.filter((x) => x.year >= 2026 && x.year < 2031)) expect(f.type, where).not.toBe('moon')
    }
  })
})

describe('astronaut yearly sim', () => {
  const tick = (g: GameState): void => nextYear(g, astronautSim.yearly)

  it('is registered after the actor and runs through yearlySpecial', () => {
    expect(CAREER_SIMS.map((x) => x.id)).toEqual(['actor', 'astronaut'])
    expect(astronautSim.key).toBe('astronaut.sim')
    const { g } = newAstro(5)
    nextYear(g, yearlySpecial)
    expect(astronautStore.view(g).years).toBe(1)
  })

  it('does nothing without a job and a record, and creates the record at v1 once from a legacy life [RF4]', () => {
    const h = makeTestGame(8, { age: 40 })
    h.year = 2026
    const before = JSON.stringify(h)
    nextYear(h, astronautSim.yearly)
    expect(Object.keys(h.flags).filter((k) => k.includes('astronaut'))).toEqual([])
    expect(JSON.stringify(h)).not.toBe(before) // only the year and age moved

    const g = makeTestGame(3, { age: 40 })
    g.year = 1995
    g.flags[LEGACY] = { owner: ownerKey(g), graduated: true, missions: 5, spacewalks: 2, moonLandings: 1, marsLandings: 0, articles: 1, research: 12, planets: [{ name: 'Kepler-12b', kind: 'gas giant', age: 38 }], firstWords: 'Hi Mom!' } as unknown as Json
    hire(g, { defId: 'astronaut', title: 'Mission Specialist', company: 'NASA', salary: 98_000, level: 2, performance: 70, data: { agency: 'oea', lastMissionAge: 39 } })
    const legacy = JSON.stringify(g.flags[LEGACY])
    const data = JSON.stringify(g.character.job!.data)
    tick(g)
    expect((g.flags[FLAG] as unknown as { v: number }).v).toBe(1)
    expect(JSON.stringify(g.flags[LEGACY])).toBe(legacy) // the legacy flag is never written
    expect(JSON.stringify(g.character.job!.data)).toBe(data)
    expect(astronautStore.view(g).tally.flights).toBe(5)
    expect(astronautStore.view(g).years).toBe(1)
  })

  it('moves funding, mood and safety by the rules and keeps them in bounds', () => {
    const { g, s } = newAstro(5, { year: 1998 })
    s.mood = 40
    s.safety = 60
    tick(g) // 1999: the shuttle era's target is 52
    const t = astronautStore.view(g)
    expect(t.fund).toEqual([fundingIndexAt(g, 1999, 40)])
    expect(t.mood).toBe(40 + Math.round(0.25 * (52 - 40)))
    // 2000: the era turns (target 50) and the year's world shock (+4) lands
    const before = t.mood
    tick(g)
    const u = astronautStore.view(g)
    expect(u.fund).toHaveLength(2)
    expect(u.mood).toBe(Math.max(0, Math.min(100, Math.round(before + Math.round(0.25 * (50 - before)) + 4))))
    for (let i = 0; i < 12; i++) tick(g)
    const v = astronautStore.view(g)
    expect(v.fund.length).toBeLessThanOrEqual(6)
    for (const n of [...v.fund, v.mood, v.safety, v.bone, v.muscle, v.family, v.dose]) expect(Number.isFinite(n)).toBe(true)
    expect(v.safety).toBeGreaterThanOrEqual(15)
    expect(v.safety).toBeLessThanOrEqual(95)
    expect(v.mood).toBeGreaterThanOrEqual(0)
    expect(v.mood).toBeLessThanOrEqual(100)
  })

  it('wears safety down on a thin year and a cut space line, and builds it with funding', () => {
    const lo = newAstro(5, { year: 2026 })
    lo.s.mood = 0
    lo.s.lobby = -6
    lo.s.safety = 60
    const f = fundingIndex(lo.g, lo.s, 2027)
    tick(lo.g)
    expect(astronautStore.view(lo.g).safety).toBe(f >= 60 ? 62 : f < 35 ? 57 : 60)
    const hi = newAstro(5, { year: 2026 })
    hi.s.mood = 100
    hi.s.lobby = 20
    hi.s.safety = 60
    expect(fundingIndex(hi.g, hi.s, 2027)).toBeGreaterThanOrEqual(60)
    tick(hi.g)
    expect(astronautStore.view(hi.g).safety).toBe(62)
  })

  it('recovers bone and muscle faster at home, and thin bones cost health and risk a fracture', () => {
    const rest = newAstro(5)
    rest.s.bone = 80
    rest.s.muscle = 70
    tick(rest.g)
    expect(astronautStore.view(rest.g).bone).toBe(83)
    expect(astronautStore.view(rest.g).muscle).toBe(78)
    const flew = newAstro(5)
    flew.s.bone = 80
    flew.s.muscle = 70
    flew.s.flights = [{ year: 2026, type: 'orbit', role: 'specialist', days: 3, regimen: 'standard', result: 'clean', crew: [], bone: 80, dose: 1 }]
    tick(flew.g)
    expect(astronautStore.view(flew.g).bone).toBe(81)
    expect(astronautStore.view(flew.g).muscle).toBe(73)
    // bone 50 costs health 2 (ceil(20/10)) and some seed breaks a bone
    const thin = newAstro(5)
    thin.s.bone = 50
    const health = thin.g.character.stats.health
    let fractures = 0
    for (let seed = 1; seed <= 60; seed++) {
      const h = structuredClone(thin.g)
      h.rng = seed
      tick(h)
      expect(h.character.stats.health).toBeLessThanOrEqual(health - 2)
      if (h.character.stats.health < health - 2) fractures++
    }
    expect(fractures).toBeGreaterThan(0)
    expect(fractures).toBeLessThan(30)
  })

  it('eases family strain at home and strains the partner and the children', () => {
    const { g, s } = newAstro(5)
    s.family = 65
    g.people.push(
      { id: 'p1', firstName: 'Sam', lastName: 'Lee', gender: 'female', age: 36, alive: true, relation: 'spouse', relationship: 80, stats: { happiness: 50, health: 50, smarts: 50, looks: 50 }, money: 0, occupation: 'x', traits: [], yearsKnown: 5, livesWithPlayer: true, notes: [], data: {} },
      { id: 'p2', firstName: 'Kai', lastName: 'Lee', gender: 'male', age: 9, alive: true, relation: 'child', relationship: 80, stats: { happiness: 50, health: 50, smarts: 50, looks: 50 }, money: 0, occupation: 'x', traits: [], yearsKnown: 9, livesWithPlayer: true, notes: [], data: {} },
    )
    tick(g)
    expect(astronautStore.view(g).family).toBe(55) // a year at home: -10
    // strain 55 at the strain step: partner -min(6, round(15/6)) = -3; under 60 the child is spared
    expect(g.people.find((p) => p.id === 'p1')!.relationship).toBe(77)
    expect(g.people.find((p) => p.id === 'p2')!.relationship).toBe(80)
    const k = newAstro(5)
    k.s.family = 100
    k.s.flights = [{ year: 2026, type: 'orbit', role: 'specialist', days: 3, regimen: 'standard', result: 'clean', crew: [], bone: 100, dose: 1 }]
    k.g.people.push({ ...g.people[0], id: 'p3', relation: 'child', age: 5, relationship: 80 })
    tick(k.g)
    expect(k.g.people.find((p) => p.id === 'p3')!.relationship).toBe(78) // 60+ strain: each child under 18 loses 2
  })

  it('rolls peer accidents on the manifest: one inquiry, 1 to 3 named crew, mood -18, safety -10', () => {
    const { g, s } = newAstro(5)
    s.safety = 15
    let events = 0
    for (let seed = 1; seed <= 500 && events < 5; seed++) {
      const h = structuredClone(g)
      h.rng = seed
      const t0 = astronautStore.view(h)
      tick(h)
      const t = astronautStore.view(h)
      expect(t.inquiries.length === 0 || t.inquiries.length === 1 || t.inquiries.length === 2).toBe(true)
      if (t.inquiries.length === 0) continue
      events++
      const inq = t.inquiries[0]
      expect(inq).toMatchObject({ year: 2027, involved: false, status: 'open', yearsOpen: 0, stance: '', coverup: false })
      expect(inq.lost.length).toBeGreaterThanOrEqual(1)
      expect(inq.lost.length).toBeLessThanOrEqual(3)
      expect(t0.mood).toBeGreaterThan(0)
    }
    expect(events).toBeGreaterThan(0)
  })

  it('ages inquiries: unrelated ones close with safety +4, unanswered ones close as recusal and blame you [RF3]', () => {
    const { g, s } = newAstro(5)
    s.safety = 50
    const open = (id: string, year: number, o: Partial<AstroState['inquiries'][number]> = {}): AstroState['inquiries'][number] => ({ id, year, cause: 'hardware', lost: ['A B'], involved: false, yearsOpen: 0, status: 'open', stance: '', coverup: false, ...o })
    s.inquiries = [open('iq1', 2025), open('iq2', 2024, { involved: true, yearsOpen: 2 }), open('iq3', 2027), open('iq4', 2025, { involved: true })]
    tick(g)
    const t = astronautStore.view(g)
    const by = (id: string) => t.inquiries.find((i) => i.id === id)!
    expect(by('iq1')).toMatchObject({ status: 'closed', yearsOpen: 1 })
    expect(by('iq2')).toMatchObject({ status: 'closed', yearsOpen: 3, stance: 'recuse' })
    expect(by('iq3')).toMatchObject({ status: 'open', yearsOpen: 0 }) // opened this very tick: not aged
    expect(by('iq4')).toMatchObject({ status: 'open', yearsOpen: 1 }) // involved: waits for the testimony
    expect(t.tally.blame).toBe(1)
    expect(t.safety).toBeGreaterThanOrEqual(54) // +4 for iq1 (and the world's own step)
    // a replay changes nothing
    const once = JSON.stringify(g)
    astronautSim.yearly(g)
    expect(JSON.stringify(g)).toBe(once)
  })

  it('leaks a cover-up now and then: standing -8, mood -8', () => {
    const { g, s } = newAstro(5)
    s.inquiries = [{ id: 'iq1', year: 2025, cause: 'schedule', lost: ['A B'], involved: true, yearsOpen: 1, status: 'open', stance: 'protect', coverup: true }]
    let leaks = 0
    for (let seed = 1; seed <= 60; seed++) {
      const h = structuredClone(g)
      h.rng = seed
      const before = astronautStore.view(h)
      tick(h)
      const t = astronautStore.view(h)
      if (t.inquiries[0].coverup) continue
      leaks++
      expect(t.standing).toBeLessThanOrEqual(before.standing - 8 + 4)
      expect(h.queue.some((m) => m.kind === 'notice' && m.title === 'Report Leaked')).toBe(true)
    }
    expect(leaks).toBeGreaterThan(0)
    expect(leaks).toBeLessThan(40)
    s.inquiries[0].coverup = false
    const h = structuredClone(g)
    tick(h)
    expect(h.queue.some((m) => m.kind === 'notice' && m.title === 'Report Leaked')).toBe(false)
  })

  it('logs the class in a class year, and moves standing toward performance', () => {
    const { g } = newAstro(5, { perf: 90, standing: 50 })
    tick(g) // 2027: a class year for the own agency (2020 + 2k)? no: 2026 is, 2027 is not
    expect(astronautStore.view(g).classes).toHaveLength(0)
    tick(g) // 2028
    const t = astronautStore.view(g)
    expect(t.classes).toHaveLength(1)
    expect(t.classes[0]).toMatchObject({ year: 2028, agency: 'oea', rank: 0, mates: [] })
    expect(t.classes[0].seats).toBeGreaterThan(0)
    expect(t.classes[0].finalists).toBe(t.classes[0].seats * 4 + 6)
    expect(t.standing).toBeGreaterThan(50)
  })

  it('costs standing after two idle years and rewards a clean flight and a command', () => {
    const { g, s } = newAstro(5, { perf: 70, standing: 70 })
    tick(g)
    expect(astronautStore.view(g).standing).toBe(68) // idle: no flight this year or last
    const f = newAstro(5, { perf: 70, standing: 70 })
    f.s.flights = [{ year: 2026, type: 'station', role: 'commander', days: 90, regimen: 'standard', result: 'clean', crew: [], bone: 90, dose: 10 }]
    tick(f.g)
    expect(astronautStore.view(f.g).standing).toBe(76) // +4 clean, +2 command
    const cand = newAstro(5, { perf: 70, standing: 70, level: 0 })
    tick(cand.g)
    expect(astronautStore.view(cand.g).standing).toBe(70) // a candidate is never idle
    void s
  })

  it('syncs the legacy landings and spacewalks into the tally and never lets it fall behind', () => {
    const { g } = newAstro(5)
    g.flags[LEGACY] = { owner: ownerKey(g), graduated: true, missions: 2, spacewalks: 4, moonLandings: 1, marsLandings: 2 } as unknown as Json
    tick(g)
    expect(astronautStore.view(g).tally).toMatchObject({ evas: 4, lunar: 1, mars: 2 })
    ;(g.flags[LEGACY] as unknown as { spacewalks: number }).spacewalks = 1
    tick(g)
    expect(astronautStore.view(g).tally.evas).toBe(4)
  })

  it('runs only the tail once the job is gone', () => {
    const { g } = newAstro(5)
    nextYear(g, yearlySpecial)
    g.character.job = null
    const t0 = astronautStore.view(g)
    nextYear(g, astronautSim.yearly)
    const t = astronautStore.view(g)
    expect(t.rows).toHaveLength(2)
    expect([t.fund, t.mood, t.safety, t.bone]).toEqual([t0.fund, t0.mood, t0.safety, t0.bone])
  })
})

/** F the sim reads for a year from a record whose mood is `mood`. */
function fundingIndexAt(g: GameState, year: number, mood: number): number {
  const h = structuredClone(g)
  h.year = year
  const s = astronautStore.view(h)
  return fundingIndex(h, { ...s, mood }, year)
}

describe('astronaut levers', () => {
  it('trains a corps skill by the drill, and does nothing without a record', () => {
    const none = makeTestGame(4, { age: 36 })
    none.year = 2026
    hire(none, { defId: 'astronaut', title: 'Astronaut', company: 'NASA', salary: 90_000, level: 1, performance: 60, data: { agency: 'oea', lastMissionAge: -1 } })
    trainSkills(none, 'pool', 5)
    expect(astronautStore.has(none)).toBe(false)
    const { g, s } = newAstro(5)
    for (const [choice, skill] of [['pool', 'eva'], ['sim', 'pilot'], ['centrifuge', 'fit'], ['survival', 'team']] as const) {
      const was = s.skills[skill]
      trainSkills(g, choice, 5)
      expect(astronautStore.view(g).skills[skill]).toBe(was + 5)
    }
    const weak = astronautStore.mut(g)
    weak.skills = { eva: 60, pilot: 60, fit: 20, team: 60 }
    trainSkills(g, undefined, 4)
    expect(astronautStore.view(g).skills.fit).toBe(24)
    weak.skills.eva = 99
    trainSkills(g, 'pool', 8)
    expect(astronautStore.view(g).skills.eva).toBe(100)
    // through the legacy training script: the drill's gain moves the matching skill
    const h = newAstro(6)
    const perf = h.g.character.job!.performance
    runScript(h.g, 'special.astro.train', 'pool', undefined, fake())
    const gain = h.g.character.job!.performance - perf
    expect(gain).toBeGreaterThanOrEqual(3)
    expect(astronautStore.view(h.g).skills.eva).toBe(42 + gain)
  })

  it('gates promotion on standing and a corps seat, and passes without a record', () => {
    const bare = makeTestGame(4, { age: 36 })
    expect(astroPromotionOk(bare, 3)).toBe(true)
    const { g, s } = newAstro(5, { standing: 49 })
    expect(astroPromotionOk(g, 1)).toBe(false)
    s.standing = 50
    expect(astroPromotionOk(g, 1)).toBe(true)
    s.standing = 59
    expect(astroPromotionOk(g, 3)).toBe(false) // needs 60
    s.standing = 100
    for (const next of [1, 2, 3, 4, 5]) expect(astroPromotionOk(g, next)).toBe(true)
    // rank 5 has one seat: you must lead the corps
    s.standing = 74
    expect(astroPromotionOk(g, 5)).toBe(standingOf(g, ASTRO_SPEC, 74, s.memory).rank <= 1)
    s.standing = 65
    expect(astroPromotionOk(g, 4)).toBe(false) // needs 66
  })

  it('keeps the legacy hook byte-identical for a no-record life apart from edit (b) [RF4]', () => {
    const make = (level: number, age: number, seed: number): GameState => {
      const g = makeTestGame(seed, { age })
      g.year = 2026
      g.character.money = 1_000
      hire(g, { defId: 'astronaut', title: 'Mission Specialist', company: 'NASA', salary: 98_000, level, performance: 80, data: { agency: 'oea', lastMissionAge: age - 2 } })
      g.flags[LEGACY] = { owner: ownerKey(g), graduated: true, missions: 5, spacewalks: 0, moonLandings: 0, marsLandings: 0, articles: 0, research: 0, planets: [], firstWords: '' } as unknown as Json
      return g
    }
    const hook = (g: GameState): void => {
      g.year += 1
      g.character.age += 1
      yearlyAstronaut(g)
    }
    // mandatory retirement: 60 with no record, whatever the rank
    const a = make(6, 59, 3)
    hook(a)
    expect(a.character.job).toBeNull()
    expect(a.character.careerHistory.at(-1)?.reason).toBe('retired')
    // with a record, a rank-6 administrator serves to 68; a rank-5 chief still retires at 60
    const b = make(6, 59, 3)
    astronautStore.mut(b)
    hook(b)
    expect(b.character.job).not.toBeNull()
    const c = make(5, 59, 3)
    astronautStore.mut(c)
    hook(c)
    expect(c.character.job).toBeNull()
    // promotion: a record that clears the gate leaves the outcome (and the rng) exactly as with no record
    let promoted = 0
    for (let seed = 1; seed <= 30; seed++) {
      const none = make(1, 40, seed)
      const rec = make(1, 40, seed)
      const s = astronautStore.mut(rec)
      s.standing = 100
      hook(none)
      hook(rec)
      expect(JSON.stringify(rec.character)).toBe(JSON.stringify(none.character))
      expect(rec.rng).toBe(none.rng)
      if (none.character.job?.level === 2) promoted++
      // a record under the gate blocks the promotion and leaves everything else
      const low = make(1, 40, seed)
      astronautStore.mut(low).standing = 10
      hook(low)
      expect(low.character.job?.level).toBe(1)
    }
    expect(promoted).toBeGreaterThan(0)
  })

  it('keeps the legacy offer and apply paths for a modal queued before the board existed [RF4]', () => {
    const g = makeTestGame(7, { age: 30 })
    g.year = 2026
    g.flags[LEGACY] = { owner: ownerKey(g), graduated: true, missions: 0, spacewalks: 0, moonLandings: 0, marsLandings: 0, articles: 0, research: 0, planets: [], firstWords: '' } as unknown as Json
    // a legacy offer modal carries no board data: it hires with no class record
    scriptChoice(g, 'special.astro.offer', 'Graduation Day', 'x', [{ id: 'oea', label: 'Agency' }, { id: 'decline', label: 'No' }])
    const m = g.queue.shift() as ChoiceModal
    runScript(g, 'special.astro.offer', 'oea', m.data, m)
    expect(g.character.job?.defId).toBe('astronaut')
    expect(astronautStore.has(g)).toBe(false)
    // with the board's result in the modal, the class is logged
    const h = makeTestGame(7, { age: 30 })
    h.year = 2026
    h.flags[LEGACY] = g.flags[LEGACY]
    h.flags[LEGACY] = { owner: ownerKey(h), graduated: true, missions: 0, spacewalks: 0, moonLandings: 0, marsLandings: 0, articles: 0, research: 0, planets: [], firstWords: '' } as unknown as Json
    scriptChoice(h, 'special.astro.offer', 'Graduation Day', 'x', [{ id: 'oea', label: 'Agency' }], { data: { oea: { rank: 3, finalists: 24, seats: 8, cut: 60, passed: true, mates: ['Ana Wu', 'Li Chen'] } } })
    const n = h.queue.shift() as ChoiceModal
    runScript(h, 'special.astro.offer', 'oea', n.data, n)
    expect(astronautStore.view(h).classes).toEqual([{ year: 2026, agency: 'oea', seats: 8, finalists: 24, rank: 3, cut: 60, mates: ['Ana Wu', 'Li Chen'] }])
    // a board that did not pass logs nothing
    const k = makeTestGame(7, { age: 30 })
    k.year = 2026
    k.flags[LEGACY] = { owner: ownerKey(k), graduated: true } as unknown as Json
    scriptChoice(k, 'special.astro.offer', 'Graduation Day', 'x', [{ id: 'oea', label: 'Agency' }], { data: { oea: { rank: 30, finalists: 24, seats: 8, cut: 60, passed: false, mates: [] } } })
    const q = k.queue.shift() as ChoiceModal
    runScript(k, 'special.astro.offer', 'oea', q.data, q)
    expect(astronautStore.has(k)).toBe(false)
  })

  it('resolves a legacy special.astro.dest modal queued before the record exists [RF4]', () => {
    let checked = false
    for (let seed = 1; seed <= 30 && !checked; seed++) {
      const g = makeTestGame(seed, { age: 36 })
      g.year = 2026
      g.character.money = 1_000
      g.flags[LEGACY] = { owner: ownerKey(g), graduated: true, missions: 3, spacewalks: 1, moonLandings: 0, marsLandings: 0, articles: 0, research: 0, planets: [], firstWords: '' } as unknown as Json
      hire(g, { defId: 'astronaut', title: 'Mission Specialist', company: 'NASA', salary: 98_000, level: 2, performance: 70, data: { agency: 'oea', lastMissionAge: -1 } })
      const keys = Object.keys(g.flags[LEGACY] as object)
      scriptChoice(g, 'special.astro.dest', 'Mission Briefing', 'x', [{ id: 'station', label: 'Station' }])
      const m = g.queue.shift() as ChoiceModal
      runScript(g, 'special.astro.dest', 'station', m.data, m)
      settle(g, { 'special.astro.asteroid': 'straight' })
      if (!g.character.alive) continue
      const gained = g.character.money - 1_000
      // legacy pay: the arrive bonus (6% of the salary x 0.8 to 1.3, to the hundred), through earnIncome, once
      const lo = Math.round((98_000 * 0.06 * 0.8) / 100) * 100
      const hi = Math.round((98_000 * 0.06 * 1.3) / 100) * 100
      if ((g.flags[LEGACY] as unknown as { missions: number }).missions === 4) {
        expect(gained).toBeGreaterThanOrEqual(lo)
        expect(gained).toBeLessThanOrEqual(hi)
      }
      expect(Object.keys(g.flags[LEGACY] as object)).toEqual(keys)
      expect(g.flags[FLAG]).toBeUndefined()
      expect(astronautStore.has(g)).toBe(false)
      checked = true
    }
    expect(checked).toBe(true)
  })

  it('pays for bone rehab through the ledger, once a year, and refuses when nothing is lost or you cannot pay', () => {
    const { g, s } = newAstro(5)
    s.bone = 80
    s.muscle = 70
    const row = astronautJobNodes(g).find((n) => 'id' in n && n.id === 'astro.rehab') as MenuAction
    expect(row.disabledReason?.(g)).toBeNull()
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const cash = g.character.money
    row.run(g)
    const t = astronautStore.view(g)
    expect([t.bone, t.muscle]).toEqual([82.5, 76])
    const pay = events.filter((e) => e.t === 'pay')
    expect(pay).toHaveLength(1)
    expect(g.character.money).toBe(cash - (pay[0].t === 'pay' ? pay[0].amount : 0))
    expect(row.subtitle && typeof row.subtitle === 'function' ? row.subtitle(g) : '').toMatch(/Bone \+2\.5, muscle \+6/)
    // once a year: a direct second run changes nothing
    const before = JSON.stringify(g.flags)
    row.run(g)
    expect(JSON.stringify(g.flags)).toBe(before)
    expect(checkLedger(events, g)).toEqual([])
    // full strength: nothing to rebuild; no cash: refused
    const full = newAstro(5)
    expect(row.disabledReason?.(full.g)).toMatch(/full strength/)
    const poor = newAstro(5)
    poor.s.bone = 50
    poor.g.character.money = 10
    expect(row.disabledReason?.(poor.g)).toMatch(/afford/)
    const flags = JSON.stringify(poor.g.flags)
    row.run(poor.g)
    expect(JSON.stringify(poor.g.flags)).toBe(flags)
  })

  it('takes family leave only at strain 40 and over, once a year, and grounds the year', () => {
    const { g, s } = newAstro(5)
    const row = astronautJobNodes(g).find((n) => 'id' in n && n.id === 'astro.family') as MenuAction
    expect(row.disabledReason?.(g)).toMatch(/under 40/)
    s.family = 55
    s.standing = 60
    expect(row.disabledReason?.(g)).toBeNull()
    const happy = g.character.stats.happiness
    row.run(g)
    const t = astronautStore.view(g)
    expect([t.family, t.mark.groundedYear, t.standing]).toEqual([30, 2026, 57])
    expect(g.character.stats.happiness).toBe(Math.min(100, happy + 6))
    expect(missionRow(g).disabledReason?.(g)).toMatch(/leave/)
    expect(row.disabledReason?.(g)).toMatch(/under 40|already/)
    const flags = JSON.stringify(g.flags)
    row.run(g)
    expect(JSON.stringify(g.flags)).toBe(flags)
  })

  it('shows the class, its seats and cut on the apply row, hints the class taste, and runs the board', () => {
    const grad = (seed: number, smarts: number, athleticism: number): GameState => {
      const g = makeTestGame(seed, { age: 30, stats: { happiness: 80, health: 95, smarts, looks: 60 } })
      g.year = 2026
      g.character.hidden.athleticism = athleticism
      g.character.education.degrees.push({ kind: 'bachelor', name: "Bachelor's in Physics", major: 'Physics', school: 'State University', age: 22 })
      g.flags[LEGACY] = { owner: ownerKey(g), graduated: true, academyApps: 1, missions: 0, spacewalks: 0, moonLandings: 0, marsLandings: 0, articles: 0, research: 0, planets: [], firstWords: '' } as unknown as Json
      return g
    }
    const applyRow = (g: GameState): MenuAction => {
      const find = (nodes: MenuNode[]): MenuAction | undefined => {
        for (const n of nodes) {
          if (n.type === 'action' && n.id === 'astro.apply.oea') return n
          if (n.type === 'menu') {
            const hit = find(n.children(g))
            if (hit) return hit
          }
        }
        return undefined
      }
      const hit = find([astronautCareerMenu])
      if (!hit) throw new Error('no apply row')
      return hit
    }
    const g = grad(7, 100, 100)
    const row = applyRow(g)
    expect(row.disabledReason?.(g)).toBeNull()
    expect(typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle).toMatch(/^Class 2026, \d+ seats, \d+ finalists, cut about \d+$/)
    expect(row.hint?.(g) ?? null).toBeNull() // no Academics talent
    g.character.talent = 'Academics'
    expect(row.hint?.(g)).toMatch(/This class wants (pilot|engineer|scientist|physician)s\. You read as an? (pilot|engineer|scientist|physician)\./)
    row.run(g)
    expect(g.character.job?.defId).toBe('astronaut')
    expect(g.queue.some((m) => m.kind === 'notice' && /You placed \d+(st|nd|rd|th) of \d+\. The class took \d+\./.test(m.text))).toBe(true)
    expect(astronautStore.view(g).classes).toHaveLength(1)
    expect(astronautStore.view(g).classes[0]).toMatchObject({ year: 2026, agency: 'oea' })

    // one try a year; a weak graduate misses and keeps the Academy status
    const w = grad(7, 30, 5)
    w.character.stats.health = 50
    const wrow = applyRow(w)
    wrow.run(w)
    expect(w.character.job).toBeNull()
    expect(w.queue.some((m) => m.kind === 'notice' && /You placed/.test(m.text))).toBe(true)
    w.queue = []
    wrow.run(w)
    expect(w.queue.some((m) => m.kind === 'notice' && /already applied/.test(m.text))).toBe(true)

    // not a class year (2027), or no agency that flies crews (1950, a country with none): disabled with a reason
    const off = grad(7, 100, 100)
    off.year = 2027
    expect(applyRow(off).disabledReason?.(off)).toMatch(/No class is forming/)
    const early = grad(7, 100, 100)
    early.year = 1970
    early.character.countryId = 'fr'
    expect(applyRow(early).disabledReason?.(early)).toMatch(/No agency here flies crews/)
    // a direct run on a closed class is refused too
    const flags = JSON.stringify(off.flags)
    applyRow(off).run(off)
    expect(JSON.stringify(off.flags)).toBe(flags)
    expect(off.character.job).toBeNull()
  })
})

describe('astronaut hostile records', () => {
  const big = (n: number): string => 'x'.repeat(n)

  it('keeps junk sim records harmless and renders pure [RF1] [RF5]', () => {
    const junk: unknown[] = [
      null,
      [],
      'x',
      { standing: Number.NaN, bone: Number.NaN, flights: 'bad', classes: [1, {}, null], inquiries: 7, skills: 'x', fund: 'x', mark: 3, tally: [] },
      { flights: Array.from({ length: 500 }, (_, i) => ({ year: 2000 + (i % 30), type: 'station', role: 'pilot', days: 1e9, result: 'clean', crew: Array.from({ length: 50 }, () => big(10_000)) })), inquiries: Array.from({ length: 99 }, (_, i) => ({ id: `iq${i}`, year: 2020, lost: [big(10_000)], involved: true })), classes: Array.from({ length: 99 }, (_, i) => ({ year: 1990 + i, agency: big(10_000), seats: 1e9 })), dose: 1e9, bone: -1e300, mood: 1e300, safety: -50, lobby: 1e9, family: Infinity },
    ]
    for (const [i, j] of junk.entries()) {
      const { g } = newAstro(20 + i)
      g.flags[FLAG] = (j && typeof j === 'object' && !Array.isArray(j) ? { ...j, owner: ownerKey(g) } : j) as unknown as Json
      // a legacy profile with damaged fields, as the safety tests write them
      g.flags[LEGACY] = { owner: ownerKey(g), planets: 'bad', missions: Number.NaN, spacewalks: 'x', moonLandings: Infinity, credits: 'bad', rejectedBy: 'bad', graduated: true } as unknown as Json
      expect(() => yearlySpecial(g), `junk ${i}`).not.toThrow()
      expect(() => nextYear(g, yearlySpecial), `junk ${i} again`).not.toThrow()
      expect(() => assertMenuPure(g, careerRoots('astronaut')), `menus ${i}`).not.toThrow()
      expect(() => fly(g), `board ${i}`).not.toThrow()
      expect(JSON.stringify(g.flags[FLAG])).not.toMatch(/NaN|Infinity|e\+\d\d/)
      const t = astronautStore.view(g)
      expect(t.flights.length).toBeLessThanOrEqual(12)
      expect(t.inquiries.length).toBeLessThanOrEqual(4)
      expect(t.classes.length).toBeLessThanOrEqual(6)
      expect(t.dose).toBeLessThanOrEqual(100)
      expect(t.bone).toBeGreaterThanOrEqual(15)
    }
  })

  it('renders every row on a frozen state, with and without a record [RF5]', () => {
    const { g } = newAstro(5)
    expect(() => assertMenuPure(g, careerRoots('astronaut'))).not.toThrow()
    const bare = makeTestGame(6, { age: 36 })
    bare.year = 2026
    hire(bare, { defId: 'astronaut', title: 'Astronaut', company: 'NASA', salary: 90_000, level: 1, performance: 60, data: { agency: 'oea', lastMissionAge: -1 } })
    expect(astronautStore.has(bare)).toBe(false)
    expect(() => assertMenuPure(bare, careerRoots('astronaut'))).not.toThrow()
    expect(astronautStore.has(bare)).toBe(false)
    // a graduate in a class year (the apply rows read the board and the class's taste) and one in a year with no class
    for (const year of [2026, 2027]) {
      const grad = makeTestGame(6, { age: 30, stats: { happiness: 80, health: 95, smarts: 90, looks: 60 } })
      grad.year = year
      grad.character.talent = 'Academics'
      grad.character.education.degrees.push({ kind: 'bachelor', name: "Bachelor's in Physics", major: 'Physics', school: 'State University', age: 22 })
      grad.flags[LEGACY] = { owner: ownerKey(grad), graduated: true, academyApps: 1, missions: 0, spacewalks: 0, moonLandings: 0, marsLandings: 0, articles: 0, research: 0, planets: [], firstWords: '' } as unknown as Json
      expect(() => assertMenuPure(grad, careerRoots('astronaut')), `graduate ${year}`).not.toThrow()
    }
    // a frozen cadet
    const cadet = makeTestGame(6, { age: 25 })
    cadet.year = 2026
    hire(cadet, { defId: 'astronaut.cadet', title: 'Space Academy Cadet', company: 'Orion Space Academy', salary: 14_000, performance: 70, data: { training: 70, yearsLeft: 1 } })
    expect(() => assertMenuPure(cadet, careerRoots('astronaut'))).not.toThrow()
  })

  it('stays under 6,000 JSON nodes and 40 KB after 40 simulated years', () => {
    soloCorps()
    const { g } = newAstro(31, { age: 24 })
    g.character.money = 5_000_000
    for (let y = 0; y < 40 && g.character.alive; y++) {
      if (g.character.job) {
        g.character.job.performance = 80
        fly(g)
        if (y % 3 === 0 && g.character.job) {
          const rehab = astronautJobNodes(g).find((n) => 'id' in n && n.id === 'astro.rehab') as MenuAction | undefined
          if (rehab && !rehab.disabledReason?.(g)) rehab.run(g)
        }
      }
      g.queue = g.queue.filter((m) => m.kind === 'choice')
      nextYear(g, yearlySpecial)
      settle(g)
    }
    const raw = g.flags[FLAG]
    expect(raw).toBeDefined()
    expect(nodesIn(raw)).toBeLessThan(6000)
    expect(JSON.stringify(raw).length).toBeLessThan(40_000)
    expect(JSON.stringify(g)).not.toMatch(/NaN|Infinity/)
    expect(astronautStore.view(g).years).toBeGreaterThan(10)
  })
})
