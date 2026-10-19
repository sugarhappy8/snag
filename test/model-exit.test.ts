import { afterEach, describe, expect, it } from 'vitest'
import { foundingProblem } from '../src/game/business/founding'
import { jobRequirementProblem } from '../src/game/careers'
import { seeded } from '../src/game/assets'
import { yearActionsUsed } from '../src/game/core'
import { getJobDef } from '../src/game/data/jobs'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { hire, ownerKey } from '../src/game/special/common'
import { ACTION_BUDGET, careerCtx, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import { modelCareerMenu, modelJobNodes } from '../src/game/special/model'
import { signWith } from '../src/game/special/model-agency'
import { labelHeadStart } from '../src/game/special/model-core'
import { MODEL_DEFS } from '../src/game/special/model-events'
import { PROTEGE_FEE, PROTEGE_MAX, PROTEGE_YEARS, SCOUT_COST, deskPrice, exitBlock, exitReady, isRetired, modelExitRows, protegeIncome, protegePay, retireModel, retireSummary, scoutBlock, scoutProtege, takeExit, unlockExits } from '../src/game/special/model-exit'
import { modelStore, type MdProtege, type ModelState } from '../src/game/special/model-state'
import type { GameState, Json, MenuAction, MenuNode, ModalItem, NoticeModal } from '../src/game/types'
import { assertMenuPure, careerRoots, checkLedger, finiteJson, nextYear } from './career-kit'
import { makeTestGame } from './helpers'

afterEach(() => setCareerAudit(null))

const json = (v: unknown): Json => v as Json
const ctxOf = (g: GameState, s: ModelState = modelStore.mut(g)): CareerCtx<ModelState> => careerCtx(g, 'model', s, { ...ACTION_BUDGET })
const notices = (g: GameState): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice')

let serial = 0
/** A notice-kind modal: runScript keeps no replay token for it, so a script's own guards are what is tested. */
const fake = (): ModalItem => ({ kind: 'notice', id: `x${++serial}`, title: '', text: '' })

/** The state a refused action leaves: it says why in a notice, so the queue and the id counter are set aside. */
const quiet = (g: GameState): string => {
  const c = structuredClone(g)
  delete c.flags['core.resolvedScriptModals']
  c.queue = []
  c.nextId = 0
  return JSON.stringify([c, g.rng])
}

const whole = (g: GameState): string => {
  const c = structuredClone(g)
  delete c.flags['core.resolvedScriptModals']
  return JSON.stringify([c, g.rng])
}

const photographers = ['Mara Lund', 'Teo Valdis', 'Ines Okoro']

/** A 1995 life of 30, cash 500,000, looks 80, a finished high school and a signed Silhouette Models contract. */
function signed(o: { seed?: number; age?: number; kind?: 'guarantee' | 'commission' } = {}): { g: GameState; s: ModelState } {
  const age = o.age ?? 30
  const g = makeTestGame(o.seed ?? 5, { age, money: 500_000 })
  g.year = 1995
  g.log = [{ age, year: 1995, entries: [] }]
  g.character.stats.looks = 80
  g.character.education.degrees = [{ kind: 'highschool', name: 'High School Diploma', school: 'Lincoln High', age: 18 }]
  g.flags['special.model'] = json({ owner: ownerKey(g), headshot: 80, headshotAge: age, couture: [], gigs: 0, fashionWeeks: 0, rejectedBy: [] })
  const s = modelStore.mut(g)
  s.book = 40
  s.rep = 60
  signWith(ctxOf(g, s), 'Silhouette Models', o.kind ?? 'guarantee')
  g.queue = []
  return { g, s }
}

/** A signed life that passes every threshold: 3 photographers, book 60, rep 60, 12 bookings, fame 40. */
function ready(o: { seed?: number; age?: number } = {}): { g: GameState; s: ModelState } {
  const f = signed(o)
  f.s.photographers = [...photographers]
  f.s.book = 60
  f.s.rep = 60
  f.s.life.booked = 12
  f.g.character.hidden.fame = 40
  return f
}

const protege = (o: Partial<MdProtege> = {}): MdProtege => ({ id: 'p1', name: 'Ana Reyes', born: 1977, look: 60, book: 40, signed: 1993, ...o })

const earns = (events: readonly AuditEvent[]): { label: string; amount: number }[] => events.flatMap((e) => (e.t === 'earn' ? [{ label: e.label, amount: e.amount }] : []))

describe('model exits: the gates', () => {
  it('gates each exit and refuses direct runs below the gates, with no state change', () => {
    type Case = [string, 'photographer' | 'label' | 'agent', (f: { g: GameState; s: ModelState }) => void, RegExp]
    const cases: Case[] = [
      ['photographer: collaborators', 'photographer', (f) => void (f.s.photographers = ['Mara Lund', 'Teo Valdis']), /three photographers/i],
      ['photographer: book', 'photographer', (f) => void (f.s.book = 49), /book of 50/i],
      ['photographer: age', 'photographer', (f) => void (f.g.character.age = 21), /22/],
      ['photographer: requirements', 'photographer', (f) => void (f.g.character.education.degrees = []), /requires/i],
      ['photographer: another job', 'photographer', (f) => void (f.g.character.job!.defId = 'chef'), /job/i],
      ['label: fame', 'label', (f) => void (f.g.character.hidden.fame = 29), /fame/i],
      ['label: book', 'label', (f) => void (f.s.book = 49), /book of 50/i],
      ['label: bookings', 'label', (f) => void (f.s.life.booked = 9), /10 bookings/i],
      ['label: founding', 'label', (f) => void (f.g.character.money = 0), /./],
      ['agent: reputation', 'agent', (f) => void (f.s.rep = 54), /reputation/i],
      ['agent: age', 'agent', (f) => void (f.g.character.age = 27), /28/],
      ['agent: bookings', 'agent', (f) => void (f.s.life.booked = 9), /10 bookings/i],
      ['agent: cash', 'agent', (f) => void (f.g.character.money = 100), /desk/i],
    ]
    for (const [name, exit, spoil, why] of cases) {
      const f = ready()
      expect(exitBlock(f.g, f.s, exit), `${name} passes before it is spoiled`).toBeNull()
      spoil(f)
      const reason = exitBlock(f.g, f.s, exit)
      expect(reason, name).toMatch(why)
      const before = quiet(f.g)
      const job = f.g.character.job
      takeExit(ctxOf(f.g, f.s), exit)
      expect(quiet(f.g), name).toBe(before)
      expect(f.g.character.job, name).toBe(job)
      expect(f.s.exit, name).toBe('')
      expect(notices(f.g).length, `${name} says why`).toBe(1)
    }
  })

  it('refuses in prison and when the character is gone, and never trusts the menu', () => {
    const f = ready()
    f.g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    for (const exit of ['photographer', 'label', 'agent'] as const) expect(exitBlock(f.g, f.s, exit)).toMatch(/behind bars/)
    expect(scoutBlock(f.g, f.s)).toMatch(/behind bars|desk/i)
    const before = quiet(f.g)
    takeExit(ctxOf(f.g, f.s), 'agent')
    expect(quiet(f.g)).toBe(before)
  })

  it('reads the thresholds apart from the cash and the job rules (exitReady)', () => {
    const f = ready()
    f.g.character.money = 0
    for (const exit of ['photographer', 'label', 'agent'] as const) expect(exitReady(f.g, f.s, exit), exit).toBe(true)
    f.s.book = 49
    expect(exitReady(f.g, f.s, 'photographer')).toBe(false)
    expect(exitReady(f.g, f.s, 'label')).toBe(false)
    expect(exitReady(f.g, f.s, 'agent')).toBe(true) // the desk wants reputation and bookings, not a book
    f.s.rep = 54
    expect(exitReady(f.g, f.s, 'agent')).toBe(false)
  })
})

describe('model exits: photographer and label', () => {
  it('lands a photographer Job through hireForJob, and mirrors foundingProblem for the label row', () => {
    const f = ready()
    const { g, s } = f
    const def = getJobDef('photographer')!
    expect(jobRequirementProblem(g, def)).toBeNull()
    const old = g.character.job!
    takeExit(ctxOf(g, s), 'photographer')
    const job = g.character.job!
    expect(job).toMatchObject({ defId: 'photographer', title: 'Photographer', category: 'fulltime', level: 1 })
    expect(job.company.length).toBeGreaterThan(0)
    expect(job.salary).toBeGreaterThan(0)
    expect(job.data.appointmentId).not.toBe(old.data.appointmentId)
    expect(g.people.some((p) => p.contextId === job.company && p.relation === 'boss')).toBe(true) // staffed by hireForJob
    expect(g.character.careerHistory.at(-1)).toMatchObject({ company: 'Silhouette Models', reason: 'quit' })
    expect(s.exit).toBe('photographer')
    expect(s.agencies.every((a) => a.to !== 0)).toBe(true)
    expect(notices(g).filter((n) => n.title === 'Behind the Camera')).toHaveLength(1)
    // the pay is the rung's pay, scaled the way a listing scales it, and the same life twice gives the same company
    const again = ready()
    takeExit(ctxOf(again.g, again.s), 'photographer')
    expect(again.g.character.job).toMatchObject({ company: job.company, salary: job.salary })
    // once you work as one, the row says so
    expect(exitBlock(g, s, 'photographer')).toMatch(/already/i)

    // the label row is exactly foundingProblem once the thresholds pass
    const l = ready({ seed: 7 })
    expect(exitBlock(l.g, l.s, 'label')).toBeNull()
    l.g.character.money = 0
    expect(foundingProblem(l.g, 'fashion')).toBeTruthy()
    expect(exitBlock(l.g, l.s, 'label')).toBe(foundingProblem(l.g, 'fashion'))
    const row = exitRow(l.g, 'model.exit.label')
    expect(row.disabledReason?.(l.g)).toBe(foundingProblem(l.g, 'fashion'))
    l.g.character.money = 500_000
    expect(row.disabledReason?.(l.g)).toBeNull()
    const queued = l.g.queue.length
    row.run(l.g)
    expect(l.g.queue.length, 'the founding flow opens').toBeGreaterThan(queued)
    expect(l.g.queue.some((m) => m.kind === 'notice' && m.title === 'Label')).toBe(false)
    expect(modelStore.view(l.g).exit).toBe('label')
    expect(l.g.character.job?.defId).toBe('model') // the label does not end the modeling job
  })

  it('hints the brand a label starts at with the Modeling talent only', () => {
    const f = ready()
    const row = exitRow(f.g, 'model.exit.label')
    expect(row.hint?.(f.g) ?? null).toBeNull()
    f.g.character.talent = 'Modeling'
    f.g.character.hidden.fame = 40
    expect(labelHeadStart(f.g)).toBe(25)
    expect(row.hint?.(f.g)).toContain(`A label starts at brand ${labelHeadStart(f.g)} of 60.`)
    expect(row.hint?.(f.g)).not.toMatch(/will/)
  })
})

describe('model exits: the agent desk', () => {
  it('opens the desk once for 6,000 x the price level, and scouts at most two proteges, once a year, 8 years each', () => {
    const { g, s } = ready()
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    expect(scoutBlock(g, s)).toMatch(/desk/i)
    const cash = g.character.money
    takeExit(ctxOf(g, s), 'agent')
    expect(g.character.money).toBe(cash - deskPrice(g))
    expect(deskPrice(g)).toBe(Math.round(6_000 * 1)) // the US price level
    expect(s.exit).toBe('agent')
    expect(s.announced).toContain('desk')
    // once
    const after = quiet(g)
    expect(exitBlock(g, s, 'agent')).toMatch(/already/i)
    takeExit(ctxOf(g, s), 'agent')
    expect(quiet(g)).toBe(after)

    // scouting
    expect(scoutBlock(g, s)).toBeNull()
    const before = g.character.money
    scoutProtege(ctxOf(g, s))
    expect(g.character.money).toBe(before - SCOUT_COST)
    expect(s.proteges).toHaveLength(1)
    expect(s.proteges[0]).toMatchObject({ signed: g.year })
    expect(s.proteges[0].name.length).toBeGreaterThan(0)
    expect(yearActionsUsed(g, 'model.scout')).toBe(1)
    expect(scoutBlock(g, s)).toMatch(/already/i) // once a year
    const same = quiet(g)
    scoutProtege(ctxOf(g, s))
    expect(quiet(g)).toBe(same)
    nextYear(g, () => {})
    scoutProtege(ctxOf(g, s))
    expect(s.proteges).toHaveLength(PROTEGE_MAX)
    expect(new Set(s.proteges.map((p) => p.id)).size).toBe(2)
    nextYear(g, () => {})
    expect(scoutBlock(g, s)).toMatch(/full|two/i)
    const full = quiet(g)
    scoutProtege(ctxOf(g, s))
    expect(quiet(g)).toBe(full)
    expect(s.proteges).toHaveLength(2)
    expect(checkLedger(events)).toEqual([])
    // the same life scouts the same newcomer
    const twin = ready()
    takeExit(ctxOf(twin.g, twin.s), 'agent')
    scoutProtege(ctxOf(twin.g, twin.s))
    expect(twin.s.proteges[0]).toEqual(s.proteges[0])
  })

  it('pays 10% of 40,000 x RANK_MULT[tier + 1] x (0.5 + standing/100), at most 25,000 each, with the protege named', () => {
    // book 10, look 40: tier 0 (x1.5), standing 25: 4,000 x 1.5 x 0.75
    expect(protegePay(protege({ look: 40, book: 10 }))).toBe(4_500)
    // book 40, look 60: tier 1 (x2.5), standing 50: 4,000 x 2.5 x 1.0
    expect(protegePay(protege({ look: 60, book: 40 }))).toBe(10_000)
    // a rising star pays the cap
    expect(protegePay(protege({ look: 100, book: 100 }))).toBe(25_000)
    expect(protegePay(protege({ look: 90, book: 80 }))).toBeLessThanOrEqual(25_000)
    for (let look = 0; look <= 100; look += 10) for (let book = 0; book <= 100; book += 10) expect(protegePay(protege({ look, book }))).toBeLessThanOrEqual(25_000)

    const { g, s } = ready()
    s.proteges = [protege({ id: 'a', name: 'Ana Reyes', look: 100, book: 100, signed: g.year - 1 }), protege({ id: 'b', name: 'Bo Lindqvist', look: 40, book: 10, signed: g.year - 1 })]
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const cash = g.character.money
    protegeIncome(ctxOf(g, s))
    expect(earns(events)).toEqual([
      { label: expect.stringContaining('Ana Reyes'), amount: 25_000 },
      { label: expect.stringContaining('Bo Lindqvist'), amount: 4_500 },
    ])
    expect(g.character.money).toBe(cash + 29_500)
    // this year's signing earns nothing until the next tick
    s.proteges = [protege({ id: 'c', signed: g.year })]
    const quietYear = g.character.money
    protegeIncome(ctxOf(g, s))
    expect(g.character.money).toBe(quietYear)
  })

  it('grows a protege each year from a seed, and lets a star leave in year 3 at 25% with one finder fee', () => {
    const f = ready()
    const { g, s } = f
    s.proteges = [protege({ id: 'p9', look: 70, book: 20, signed: g.year - 1 })]
    protegeIncome(ctxOf(g, s))
    const grown = s.proteges[0]
    expect(grown.book).toBeGreaterThan(20)
    expect(grown.book).toBeLessThanOrEqual(100)
    // the same record and year grow the same way
    const h = ready()
    h.s.proteges = [protege({ id: 'p9', look: 70, book: 20, signed: h.g.year - 1 })]
    protegeIncome(ctxOf(h.g, h.s))
    expect(h.s.proteges[0]).toEqual(grown)

    // a protege past book 60 in year 3 leaves at 25%: both outcomes happen, and the leaver pays one finder's fee
    let left = 0
    let stayed = 0
    for (let seed = 1; seed <= 120; seed++) {
      const x = ready({ seed: 100 + seed })
      x.g.rng = seed
      x.s.proteges = [protege({ id: 'star', look: 90, book: 95, signed: x.g.year - 2 })]
      const events: AuditEvent[] = []
      setCareerAudit((e) => events.push(e))
      protegeIncome(ctxOf(x.g, x.s))
      setCareerAudit(null)
      const fee = earns(events).filter((e) => /finder/i.test(e.label))
      if (x.s.proteges.length === 0) {
        left++
        expect(fee).toHaveLength(1)
        expect(fee[0].label).toContain('Ana Reyes')
        expect(fee[0].amount).toBe(protegePay(protege({ look: 90, book: 95 })) * PROTEGE_FEE)
        expect(earns(events)).toHaveLength(2) // the year's override and the fee
      } else {
        stayed++
        expect(fee).toHaveLength(0)
      }
    }
    expect(left).toBeGreaterThan(15)
    expect(left).toBeLessThan(55)
    expect(stayed).toBeGreaterThan(60)
    // before year 3 a star stays whatever the roll says
    for (let seed = 1; seed <= 30; seed++) {
      const x = ready({ seed: 300 + seed })
      x.g.rng = seed
      x.s.proteges = [protege({ id: 'young', look: 90, book: 95, signed: x.g.year - 1 })]
      protegeIncome(ctxOf(x.g, x.s))
      expect(x.s.proteges).toHaveLength(1)
    }
    // eight years each: paid, then gone
    const y = ready()
    y.s.proteges = [protege({ id: 'old', look: 30, book: 20, signed: y.g.year - PROTEGE_YEARS })]
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    protegeIncome(ctxOf(y.g, y.s))
    expect(earns(events)).toHaveLength(1)
    expect(y.s.proteges).toEqual([])
  })

  it('pays through the yearly sim once per (year, age), also after retiring [RF3]', () => {
    const { g, s } = ready()
    takeExit(ctxOf(g, s), 'agent')
    s.proteges = [protege({ id: 'a', look: 40, book: 10, signed: g.year })]
    retireSummary(ctxOf(g, s))
    expect(g.character.job).toBeNull()
    g.queue = []
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    yearlySpecial(g)
    expect(earns(events).filter((e) => e.label.includes('Ana Reyes'))).toHaveLength(1)
    const once = whole(g)
    yearlySpecial(g)
    expect(whole(g)).toBe(once)
    setCareerAudit(null)
  })
})

describe('model exits: unlocks and retirement', () => {
  it('logs each unlock once in announced, with one notice each, and shows the exits menu from then on', () => {
    const { g, s } = ready()
    const menu = (): MenuNode | undefined => modelJobNodes(g).find((n) => n.id === 'model.exits')
    s.photographers = []
    s.book = 10
    s.life.booked = 0
    s.rep = 10
    g.character.hidden.fame = 0
    expect(menu()).toBeDefined()
    expect(menu()!.visible?.(g)).toBe(false)
    s.photographers = [...photographers]
    s.book = 60
    expect(menu()!.visible?.(g)).toBe(true) // a threshold passes: the photographer exit is ready
    unlockExits(ctxOf(g, s))
    expect(s.announced).toEqual(['photo'])
    expect(notices(g).filter((n) => n.title === 'A Way Out')).toHaveLength(1)
    const once = whole(g)
    unlockExits(ctxOf(g, s))
    expect(whole(g)).toBe(once) // nothing again
    // the other two unlock on their own, one notice each, in order
    s.life.booked = 12
    s.rep = 60
    g.character.hidden.fame = 40
    g.queue = []
    unlockExits(ctxOf(g, s))
    expect(s.announced).toEqual(['photo', 'label', 'agent'])
    expect(notices(g).filter((n) => n.title === 'A Way Out').length).toBeLessThanOrEqual(2) // the notice budget
    for (let i = 0; i < 3; i++) unlockExits(ctxOf(g, s))
    expect(s.announced).toEqual(['photo', 'label', 'agent'])
    // dropping below a threshold later does not take the menu away
    s.book = 0
    s.life.booked = 0
    expect(menu()!.visible?.(g)).toBe(true)
    // and the yearly sim runs the unlock once
    const t = ready({ seed: 9 })
    t.g.queue = []
    nextYear(t.g, yearlySpecial)
    expect(modelStore.view(t.g).announced).toContain('photo')
    expect(notices(t.g).filter((n) => n.title === 'A Way Out').length).toBeGreaterThanOrEqual(1)
  })

  it('retires with one notice and a remember line and leaves nothing as an Asset', () => {
    const { g, s } = ready()
    s.life = { gross: 1_900_000, net: 1_200_000, agency: 400_000, mother: 0, recoup: 0, booked: 240, faces: 12, shows: 36, peak: 4, peakYear: 2003 }
    const assets = JSON.stringify(g.assets)
    const memories = g.character.memories.length
    const logs = g.log.flatMap((l) => l.entries).length
    retireSummary(ctxOf(g, s))
    expect(g.character.job).toBeNull()
    expect(g.character.careerHistory.at(-1)).toMatchObject({ company: 'Silhouette Models', reason: 'retired' })
    const mine = notices(g).filter((n) => n.title === 'Retired')
    expect(mine).toHaveLength(1)
    expect(notices(g)).toHaveLength(1)
    expect(mine[0].text).toMatch(/240 bookings/)
    expect(mine[0].text).toMatch(/12 face/)
    expect(mine[0].text).toMatch(/36 shows/)
    expect(mine[0].text).toMatch(/rank 4 in 2003/i)
    expect(mine[0].text).toMatch(/\$1\.9M/)
    expect(mine[0].text).toMatch(/\$1\.2M/)
    expect(mine[0].text.length).toBeLessThanOrEqual(120)
    expect(g.character.memories.length).toBe(memories + 1)
    expect(g.log.flatMap((l) => l.entries).length).toBe(logs + 1)
    expect(JSON.stringify(g.assets)).toBe(assets)
    expect(g.assets).toEqual([])
    expect(isRetired(g, modelStore.view(g))).toBe(true)
    // no job: nothing to retire from
    const after = quiet(g)
    retireSummary(ctxOf(g, s))
    expect(quiet(g)).toBe(after)
  })

  it('leaves the legacy retirement behind: the Retire row retires with the summary, and a retired model can open a desk at any age', () => {
    const { g } = ready()
    const row = jobRow(g, 'model.quit')
    expect(row.label).toBe('Retire')
    row.run(g)
    expect(g.character.job).toBeNull()
    expect(notices(g).some((n) => n.title === 'Retired')).toBe(true)
    expect(g.character.careerHistory.at(-1)?.reason).toBe('retired')
    const s = modelStore.mut(g)
    g.character.age = 25 // under 28, retired
    expect(exitBlock(g, s, 'agent')).toBeNull()
    expect(modelCareerMenu.children(g).some((n) => n.id === 'model.exits')).toBe(true)
    // a new signing ends the retirement
    s.book = 40
    signWith(ctxOf(g, s), 'Silhouette Models', 'guarantee')
    expect(isRetired(g, modelStore.view(g))).toBe(false)
    expect(exitBlock(g, modelStore.view(g), 'agent')).toMatch(/28/)
  })

  it('retires a legacy life with no record, writing only the sim record', () => {
    const g = makeTestGame(8, { age: 30, money: 100_000 })
    g.year = 1995
    g.log = [{ age: 30, year: 1995, entries: [] }]
    hire(g, { defId: 'model', title: 'Model', company: 'Silhouette Models', salary: 32_000, data: { tier: 1, gigsThisYear: 0, sabotaged: 0 } })
    g.flags['special.model'] = json({ owner: ownerKey(g), headshot: 50, headshotAge: 28, couture: [], gigs: 3, fashionWeeks: 0, rejectedBy: [] })
    const legacy = JSON.stringify(g.flags['special.model'])
    jobRow(g, 'model.quit').run(g)
    expect(g.character.job).toBeNull()
    expect(JSON.stringify(g.flags['special.model'])).toBe(legacy)
    expect(modelStore.has(g)).toBe(true)
    expect(notices(g).filter((n) => n.title === 'Retired')).toHaveLength(1)
  })
})

describe('model exits: heirs, replays and menus', () => {
  it('gives an heir nothing: the record is empty and no protege income pays [RF2]', () => {
    const { g, s } = ready()
    takeExit(ctxOf(g, s), 'agent')
    s.proteges = [protege({ id: 'a', look: 90, book: 90, signed: g.year - 1 })]
    s.life.gross = 500_000
    retireSummary(ctxOf(g, s))
    const heir = createPerson(g, { relation: 'child', age: 25, firstName: 'Heir', livesWithPlayer: true })
    heir.relationship = 90
    g.character.willBeneficiaries = [heir.id]
    g.character.alive = false
    const n = continueAsChild(g, heir.id)
    expect(n).not.toBe(g)
    expect(modelStore.has(n)).toBe(false)
    expect(modelStore.peek(n)).toBeNull()
    const v = modelStore.view(n)
    expect([v.proteges, v.announced, v.exit, v.life.gross]).toEqual([[], [], '', 0])
    n.queue = []
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    nextYear(n, yearlySpecial)
    nextYear(n, yearlySpecial)
    setCareerAudit(null)
    expect(earns(events)).toEqual([])
    expect(modelStore.peek(n)).toBeNull()
    // the heir's exits menu is closed, and a row run by hand is refused before it writes a record
    const menu = modelCareerMenu.children(n).find((x) => x.id === 'model.exits')
    expect(menu === undefined || menu.visible?.(n) === false).toBe(true)
    for (const id of ['model.exit.photo', 'model.exit.label', 'model.exit.agent']) {
      const row = exitRow(n, id)
      expect(row.disabledReason?.(n), id).toBeTruthy()
      row.run(n)
    }
    expect(modelStore.has(n)).toBe(false)
    expect(modelStore.view(n).exit).toBe('')
    expect(modelStore.view(n).proteges).toEqual([])
  })

  it('replays an exit row or a choice with no effect [RF3]', () => {
    // a row: the desk opens once, the exit and the retirement each change nothing the second time
    const { g, s } = ready()
    const desk = exitRow(g, 'model.exit.agent')
    const cash = g.character.money
    desk.run(g)
    expect(modelStore.view(g).announced).toContain('desk')
    expect(g.character.money).toBe(cash - deskPrice(g))
    g.queue = []
    const settled = quiet(g)
    desk.run(g)
    desk.run(g)
    expect(quiet(g)).toBe(settled)
    expect(g.character.money).toBe(cash - deskPrice(g))
    retireSummary(ctxOf(g, s))
    g.queue = []
    const retired = quiet(g)
    retireSummary(ctxOf(g, s))
    retireModel(g)
    expect(quiet(g)).toBe(retired)

    // a choice: a crisis answered once, then replayed, rejected for another owner and another year
    const def = MODEL_DEFS.find((d) => d.id === 'testShoot')!
    const f = ready({ seed: 12 })
    f.s.book = 30
    const d = def.make(f.g, f.s, seeded('t|testShoot'))
    const data = { d, owner: ownerKey(f.g), year: f.g.year }
    runScript(f.g, 'career.model.testShoot', 'cash', json(data), fake())
    const answered = whole(f.g)
    runScript(f.g, 'career.model.testShoot', 'cash', json(data), fake())
    runScript(f.g, 'career.model.testShoot', 'safe', json(data), fake())
    expect(whole(f.g)).toBe(answered)
    const other = ready({ seed: 13 })
    other.s.book = 30
    const before = whole(other.g)
    runScript(other.g, 'career.model.testShoot', 'cash', json({ ...data, owner: 'someone-else' }), fake())
    runScript(other.g, 'career.model.testShoot', 'cash', json({ ...data, year: other.g.year - 1 }), fake())
    expect(whole(other.g)).toBe(before)
  })

  it('renders the exits menu on a frozen state [RF5]', () => {
    const f = ready()
    assertMenuPure(f.g, careerRoots('model'))
    takeExit(ctxOf(f.g, f.s), 'agent')
    f.s.proteges = [protege({ signed: f.g.year })]
    assertMenuPure(f.g, careerRoots('model'))
    retireSummary(ctxOf(f.g, f.s))
    assertMenuPure(f.g, careerRoots('model'))
    // a menu with nothing unlocked, and one with no record at all
    const bare = signed({ seed: 21 })
    assertMenuPure(bare.g, careerRoots('model'))
    const none = makeTestGame(3, { age: 30 })
    assertMenuPure(none, careerRoots('model'))
    // every row reads a record and never writes one
    const before = JSON.stringify(f.g)
    const menu = modelExitRows(f.g)
    for (const n of menu) if (n.type === 'menu') n.children(f.g)
    expect(JSON.stringify(f.g)).toBe(before)
  })

  it('keeps junk records harmless in the exit code [RF1]', () => {
    const junks: unknown[] = [
      { owner: 'x', v: 1, proteges: 'bad', announced: 7, exit: {}, life: 'bad', photographers: [null, 5, {}] },
      { v: 1, proteges: Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, name: 'N'.repeat(10_000), look: 'x', book: NaN, signed: {} })), announced: Array.from({ length: 500 }, () => 'q'.repeat(10_000)) },
      { v: 1, photographers: Array.from({ length: 500 }, (_, i) => `photographer ${i}`), life: { booked: Infinity, gross: -5, peak: 'x' } },
    ]
    for (const junk of junks) {
      const g = makeTestGame(4, { age: 30, money: 100_000 })
      g.year = 1995
      g.log = [{ age: 30, year: 1995, entries: [] }]
      hire(g, { defId: 'model', title: 'Model', company: 'Silhouette Models', salary: 32_000, data: { tier: 1, gigsThisYear: 0, sabotaged: 0 } })
      g.flags['special.model.sim'] = json({ ...(junk as object), owner: ownerKey(g) })
      const s = modelStore.view(g)
      expect(s.proteges.length).toBeLessThanOrEqual(2)
      expect(s.announced.length).toBeLessThanOrEqual(8)
      for (const exit of ['photographer', 'label', 'agent'] as const) expect(() => exitBlock(g, s, exit)).not.toThrow()
      expect(() => scoutBlock(g, s)).not.toThrow()
      assertMenuPure(g, careerRoots('model'))
      expect(() => {
        nextYear(g, yearlySpecial)
        nextYear(g, yearlySpecial)
      }).not.toThrow()
      const t = modelStore.mut(g)
      protegeIncome(ctxOf(g, t))
      unlockExits(ctxOf(g, t))
      for (const p of t.proteges) expect(Number.isFinite(protegePay(p))).toBe(true)
      expect(finiteJson(g)).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------

function jobRow(g: GameState, id: string): MenuAction {
  const find = (nodes: MenuNode[], depth: number): MenuAction | null => {
    for (const n of nodes) {
      if (n.type === 'action' && n.id === id) return n
      if (n.type === 'menu' && depth < 5) {
        const hit = find(n.children(g), depth + 1)
        if (hit) return hit
      }
    }
    return null
  }
  const row = find([...modelJobNodes(g), ...modelCareerMenu.children(g)], 0)
  if (!row) throw new Error(`no row ${id}`)
  return row
}

function exitRow(g: GameState, id: string): MenuAction {
  const menu = modelExitRows(g).find((n) => n.id === 'model.exits')
  if (!menu || menu.type !== 'menu') throw new Error('no exits menu')
  const row = menu.children(g).find((n): n is MenuAction => n.type === 'action' && n.id === id)
  if (!row) throw new Error(`no row ${id}`)
  return row
}
