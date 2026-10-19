import { afterEach, describe, expect, it } from 'vitest'
import { yearActionsUsed } from '../src/game/core'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { astronautCareerMenu, astronautJobNodes, yearlyAstronaut } from '../src/game/special/astronaut'
import { ADMIN_SCRIPT } from '../src/game/special/astronaut-exits'
import {
  adminBlock,
  adminFallout,
  hallOfFame,
  legacyPoints,
  lectureFee,
  memoirAdvance,
  memoirTail,
  noteFirsts,
  ownBlock,
  ownRisk,
  ownedSpaceCompany,
  takeAdmin,
} from '../src/game/special/astronaut-exits'
import { runBid } from '../src/game/special/astronaut-flight'
import { astronautSim } from '../src/game/special/astronaut-sim'
import { astroPoliticsEdge, astronautStore, type AstroState } from '../src/game/special/astronaut-state'
import { fameOf, hire, ownerKey } from '../src/game/special/common'
import { ACTION_BUDGET, careerCtx, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import type { Asset, ChoiceModal, GameState, Json, MenuAction, MenuNode, ModalItem, NoticeModal } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { assertMenuPure, careerRoots, checkLedger, finiteJson, nextYear, voiceProblems } from './career-kit'
import { makeTestGame } from './helpers'

interface Fx { g: GameState; s: AstroState }

const ctxOf = (g: GameState, s: AstroState = astronautStore.mut(g)): CareerCtx<AstroState> => careerCtx(g, 'astronaut', s, { ...ACTION_BUDGET })

let serial = 0
const fake = (): ModalItem => ({ kind: 'notice', id: `x${++serial}`, title: '', text: '' })
const notices = (g: GameState): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
const flat = (g: GameState): string => {
  const c = structuredClone(g)
  delete c.flags['core.resolvedScriptModals']
  return JSON.stringify(c)
}
/** The state a refused row leaves: it says why in a notice, so the queue and the id counter are set aside. */
const quiet = (g: GameState): string => {
  const c = structuredClone(g)
  delete c.flags['core.resolvedScriptModals']
  c.queue = []
  c.nextId = 0
  return JSON.stringify(c)
}

/** A well-formed business asset with `details` as given. */
const spaceAsset = (details: Record<string, Json>): Asset =>
  ({ id: 'a1', kind: 'business', name: 'Starlane Launch', emoji: 'x', purchasePrice: 1, value: 1, condition: 100, purchasedAge: 30, upkeep: 0, details }) as unknown as Asset

function take(g: GameState, scriptId: string): ChoiceModal {
  const at = g.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === scriptId)
  if (at < 0) throw new Error(`no ${scriptId} modal queued`)
  return g.queue.splice(at, 1)[0] as ChoiceModal
}

afterEach(() => setCareerAudit(null))

/** A 2026 life with an astronaut job, a migrated record and cash. */
function newAstro(seed = 5, o: { year?: number; country?: string; level?: number; age?: number; salary?: number; title?: string } = {}): Fx {
  const age = o.age ?? 36
  const g = makeTestGame(seed, { age, countryId: o.country ?? 'us' })
  g.year = o.year ?? 2026
  g.log = [{ age, year: g.year, entries: [] }]
  g.character.money = 500_000
  hire(g, { defId: 'astronaut', title: o.title ?? 'Mission Specialist', company: 'Orbital Exploration Agency', salary: o.salary ?? 100_000, level: o.level ?? 2, performance: 70, data: { agency: 'oea', lastMissionAge: -1 } })
  return { g, s: astronautStore.mut(g) }
}

/** A mid-career astronaut who meets every admin gate. */
function adminReady(seed = 5): Fx {
  const f = newAstro(seed, { level: 3, age: 45, title: 'Flight Engineer' })
  f.s.tally.flights = 2
  f.s.standing = 65
  return f
}

const find = (nodes: MenuNode[], g: GameState, id: string): MenuNode | undefined => {
  for (const n of nodes) {
    if ('id' in n && n.id === id) return n
    if (n.type === 'menu') {
      const hit = find(n.children(g), g, id)
      if (hit) return hit
    }
  }
  return undefined
}
const action = (g: GameState, id: string): MenuAction => {
  const n = find(astronautJobNodes(g), g, id)
  if (!n || n.type !== 'action') throw new Error(`no ${id} action`)
  return n
}

describe('astronaut exits: administrator', () => {
  it('refuses admin below its gates by direct run, then pays 150,000 and 210,000', () => {
    const row = (g: GameState): MenuAction => action(g, 'astro.admin')
    const closed = (mutate: (f: Fx) => void, why: RegExp): void => {
      const f = adminReady()
      mutate(f)
      expect(row(f.g).disabledReason?.(f.g)).toMatch(why)
      expect(adminBlock(f.g, f.s)).toMatch(why)
      const before = quiet(f.g)
      const queue = f.g.queue.length
      row(f.g).run(f.g) // a direct run: refused, with the reason, and nothing else moves
      expect(f.g.queue.length).toBe(queue + 1)
      expect(f.g.queue.at(-1)).toMatchObject({ kind: 'notice' })
      expect(quiet(f.g)).toBe(before)
      takeAdmin(ctxOf(f.g, f.s)) // and by the function itself
      expect(f.g.queue.length).toBe(queue + 2)
      expect(quiet(f.g)).toBe(before)
    }
    closed((f) => (f.g.character.job!.level = 2), /Flight Engineer/)
    closed((f) => (f.g.character.age = 41), /42/)
    closed((f) => (f.s.tally.flights = 1), /two flights/)
    closed((f) => (f.s.standing = 64), /65/)

    // a medical ground opens it without the standing
    const med = adminReady()
    med.s.standing = 40
    med.s.cool.ground = 2025
    expect(adminBlock(med.g, med.s)).toBeNull()

    // the gates met: levels 6 and 7 of the same job
    const { g, s } = adminReady()
    expect(adminBlock(g, s)).toBeNull()
    expect(row(g).disabledReason?.(g)).toBeNull()
    row(g).run(g)
    const job = g.character.job!
    expect([job.level, job.title, job.salary]).toEqual([6, 'Deputy Administrator', 150_000])
    expect(job.data.admin).toEqual({ years: 0, stance: '' })
    expect(astronautStore.view(g).mark.groundedYear).toBe(g.year) // administrators fly nothing
    expect(row(g).disabledReason?.(g)).toMatch(/three years/)

    // the legacy hook pays the salary once; three admin years later the top post opens
    g.queue = []
    const m0 = g.character.money
    nextYear(g, yearlySpecial)
    expect(g.character.money - m0).toBe(150_000)
    expect((g.character.job!.data.admin as { years: number }).years).toBe(1)
    g.queue = []
    nextYear(g, yearlySpecial)
    g.queue = []
    expect(row(g).disabledReason?.(g)).toMatch(/three years/)
    nextYear(g, yearlySpecial)
    g.queue = []
    expect((g.character.job!.data.admin as { years: number }).years).toBe(3)
    expect(row(g).disabledReason?.(g)).toBeNull()
    row(g).run(g)
    expect([g.character.job!.level, g.character.job!.title, g.character.job!.salary]).toEqual([7, 'Administrator', 210_000])
    g.queue = []
    const m1 = g.character.money
    nextYear(g, yearlySpecial)
    expect(g.character.money - m1).toBe(210_000)
    expect(row(g).disabledReason?.(g)).toMatch(/already/)
  })

  it('serves to 68 and takes no flights', () => {
    const { g } = adminReady()
    action(g, 'astro.admin').run(g)
    g.character.job!.level = 7
    g.character.age = 58
    for (let i = 0; i < 9 && g.character.job; i++) {
      nextYear(g, yearlySpecial)
      g.queue = []
      if (g.character.age < 68) expect(g.character.job, `age ${g.character.age}`).not.toBeNull()
    }
    expect(g.character.age).toBeGreaterThanOrEqual(67)

    // no Flight Board: the row is gone, and a direct bid is refused by the grounded year
    const f = adminReady()
    action(f.g, 'astro.admin').run(f.g)
    f.g.queue = []
    expect(find(astronautJobNodes(f.g), f.g, 'astro.mission')).toBeUndefined()
    expect(find(astronautJobNodes(f.g), f.g, 'astro.admin')).toBeDefined()
    expect(runBid(ctxOf(f.g), 'o0')).toBe('lost')
    expect(yearActionsUsed(f.g, 'astro.mission')).toBe(0)
    nextYear(f.g, yearlySpecial)
    expect(astronautStore.view(f.g).mark.groundedYear).toBe(f.g.year) // still no flights next year
  })

  it('keeps a Deputy or Administrator in post to 68 whatever the performance drifts to, over many seeds', () => {
    const lost: string[] = []
    for (let seed = 1; seed <= 24; seed++) {
      const { g } = adminReady(seed)
      g.character.age = 46
      action(g, 'astro.admin').run(g)
      g.queue = []
      for (let i = 0; i < 25 && g.character.job; i++) {
        nextYear(g, yearlySpecial)
        g.queue = []
        if (g.character.age < 68 && !g.character.job) lost.push(`seed ${seed} age ${g.character.age}`)
      }
      // the retire-at-68 exit is the one that ends it
      expect(g.character.job, `seed ${seed}`).toBeNull()
      expect(g.character.age, `seed ${seed}`).toBeGreaterThanOrEqual(68)
    }
    expect(lost).toEqual([])
  })

  it('asks for one push, safety or hold choice a year and records the stance', () => {
    const start = (): Fx & { m: ChoiceModal } => {
      const f = adminReady()
      action(f.g, 'astro.admin').run(f.g)
      f.g.queue = []
      nextYear(f.g, yearlySpecial)
      return { ...f, m: take(f.g, ADMIN_SCRIPT) }
    }
    const a = start()
    expect(a.m.choices.map((c) => c.id)).toEqual(['push', 'safety', 'hold'])
    expect(a.m.text).toMatch(/What will you do\?$/)
    expect(a.m.choices.every((c) => c.label.split(/\s+/).length <= 5)).toBe(true)
    expect(a.g.queue.filter((m) => m.kind === 'choice' && m.scriptId?.startsWith('career.'))).toHaveLength(0)

    for (const [choice, lobby, safety] of [['push', 8, -4], ['safety', -3, 8], ['hold', 0, 0]] as const) {
      const f = start()
      const before = astronautStore.view(f.g)
      runScript(f.g, ADMIN_SCRIPT, choice, f.m.data, f.m)
      const after = astronautStore.view(f.g)
      expect([after.lobby - before.lobby, after.safety - before.safety], choice).toEqual([lobby, safety])
      expect((f.g.character.job!.data.admin as { stance: string }).stance).toBe(choice)
      const once = flat(f.g)
      runScript(f.g, ADMIN_SCRIPT, choice, f.m.data, f.m)
      runScript(f.g, ADMIN_SCRIPT, 'push', f.m.data, { ...f.m, id: 'again' })
      expect(flat(f.g)).toBe(once)
    }
    // a foreign or stale answer, or an unknown stance, moves nothing
    const f = start()
    const pre = flat(f.g)
    runScript(f.g, ADMIN_SCRIPT, 'fold', f.m.data, fake())
    runScript(f.g, ADMIN_SCRIPT, 'push', { ...(f.m.data as Record<string, Json>), owner: 'v2:9:x' }, fake())
    f.g.year += 1
    runScript(f.g, ADMIN_SCRIPT, 'push', f.m.data, fake())
    f.g.year -= 1
    expect(flat(f.g)).toBe(pre)
    // an administrator who left the post cannot answer it
    f.g.character.job = null
    const gone = flat(f.g)
    runScript(f.g, ADMIN_SCRIPT, 'push', f.m.data, fake())
    expect(flat(f.g)).toBe(gone)
  })

  it('dismisses a pushing administrator about 55% of the time when a schedule loss opens an inquiry', () => {
    const run = (stance: string, level: number, seed: number): { dismissed: boolean; blame: number } => {
      const { g, s } = adminReady(seed)
      g.character.job!.level = level
      g.character.job!.data.admin = { years: 1, stance }
      g.rng = seed
      const dismissed = adminFallout(ctxOf(g, s))
      return { dismissed, blame: astronautStore.view(g).tally.blame }
    }
    let hit = 0
    const n = 400
    for (let seed = 1; seed <= n; seed++) {
      const r = run('push', 6, seed)
      if (r.dismissed) {
        hit++
        expect(r.blame).toBe(1)
      } else expect(r.blame).toBe(0)
    }
    expect(Math.abs(hit / n - 0.55)).toBeLessThan(0.07)
    for (const [stance, level] of [['safety', 6], ['hold', 7], ['', 6], ['push', 5], ['push', 2]] as const) for (let seed = 1; seed <= 20; seed++) expect(run(stance, level, seed).dismissed, `${stance}/${level}`).toBe(false)
    // a dismissed administrator is fired from the post
    const d = adminReady()
    d.g.character.job!.level = 6
    d.g.character.job!.data.admin = { years: 1, stance: 'push' }
    for (let seed = 1; seed <= 40 && d.g.character.job; seed++) {
      d.g.rng = seed
      adminFallout(ctxOf(d.g, d.s))
    }
    expect(d.g.character.job).toBeNull()
    expect(d.g.character.careerHistory.at(-1)?.reason).toBe('fired')
  })
})

describe('astronaut exits: a schedule loss under an administrator', () => {
  it('can end a pushing administrator through the yearly sim, and spares one who did not push', () => {
    const tick = (stance: string, seed: number): { schedule: boolean; fired: boolean; blame: number } => {
      const { g, s } = adminReady(seed)
      g.character.job!.level = 6
      g.character.job!.data.admin = { years: 1, stance }
      s.safety = 15
      g.rng = seed
      nextYear(g, astronautSim.yearly)
      const t = astronautStore.view(g)
      return { schedule: t.inquiries.some((i) => i.year === g.year && i.cause === 'schedule'), fired: g.character.job === null, blame: t.tally.blame }
    }
    let schedule = 0
    let fired = 0
    for (let seed = 1; seed <= 1200; seed++) {
      const r = tick('push', seed)
      if (r.schedule) schedule++
      if (r.fired) {
        fired++
        expect(r.schedule).toBe(true) // only a schedule cause costs the post
        expect(r.blame).toBe(1)
      }
      expect(tick('hold', seed).fired, `hold ${seed}`).toBe(false)
    }
    expect(schedule).toBeGreaterThan(0)
    expect(fired).toBeGreaterThan(0)
    expect(fired).toBeLessThanOrEqual(schedule)
  })
})

describe('astronaut exits: speaker and author', () => {
  const wealth = (g: GameState): number => Math.min(1.2, Math.max(0.3, getCountry(g.character.countryId).wealth))

  it('prices a lecture by the formula and caps them at 3 a year', () => {
    const { g, s } = newAstro(5)
    s.tally.flights = 1
    g.character.hidden.fame = 0
    expect(lectureFee(g, s)).toBe(Math.round(800 * wealth(g)))
    g.character.hidden.fame = 50
    expect(lectureFee(g, s)).toBe(Math.round(8600 * wealth(g)))
    g.character.hidden.fame = 100
    expect(lectureFee(g, s)).toBe(Math.round(16_600 * wealth(g)))
    const poor = newAstro(5, { country: 'ng' })
    poor.g.character.hidden.fame = 50
    expect(lectureFee(poor.g, poor.s)).toBe(Math.round(8600 * Math.min(1.2, Math.max(0.3, getCountry('ng').wealth))))
    expect(lectureFee(poor.g, poor.s)).toBeLessThan(lectureFee(g, s))

    g.character.hidden.fame = 50
    s.mood = 50
    s.family = 10
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const cash = g.character.money
    const row = action(g, 'astro.lecture')
    expect(row.disabledReason?.(g)).toBeNull()
    for (let i = 0; i < 3; i++) row.run(g)
    setCareerAudit(null)
    // each lecture earns +1 fame, so each fee is priced at the fame the day it was given
    const fees = [50, 51, 52].map((fame) => Math.round((600 + fame * 160) * wealth(g)))
    expect(g.character.money - cash).toBe(fees[0] + fees[1] + fees[2])
    expect(events.filter((e) => e.t === 'earn' && e.label === 'Lecture fee').map((e) => (e.t === 'earn' ? e.amount : 0))).toEqual(fees)
    const t = astronautStore.view(g)
    expect([t.family, t.mood]).toEqual([16, 53])
    expect(fameOf(g)).toBe(53)
    expect(row.disabledReason?.(g)).toMatch(/three/)
    const flags = JSON.stringify(g.flags)
    const money = g.character.money
    row.run(g) // a fourth, by direct run: refused
    expect(g.character.money).toBe(money)
    expect(JSON.stringify(g.flags)).toBe(flags)
    expect(notices(g).at(-1)?.text).toMatch(/three lectures/)
    expect(yearActionsUsed(g, 'astro.lecture')).toBe(3)
    expect(checkLedger(events, g)).toEqual([])
    g.yearActions = {}
    expect(row.disabledReason?.(g)).toBeNull()
  })

  it('hides the public life until a flight is on the record, then offers a lecture and a memoir', () => {
    const { g, s } = newAstro(5)
    expect(find(astronautJobNodes(g), g, 'astro.public')).toBeDefined()
    s.tally.flights = 0
    const menu = find(astronautJobNodes(g), g, 'astro.public')
    expect(menu && menu.type === 'menu' && menu.visible?.(g)).toBe(false)
    s.tally.flights = 1
    expect(menu && menu.type === 'menu' && menu.visible?.(g)).toBe(true)
    const lecture = find(astronautJobNodes(g), g, 'astro.lecture') as MenuAction
    s.tally.flights = 0
    expect(lecture.disabledReason?.(g)).toBeTruthy()
  })

  it('pays a memoir advance A, then 1.78 A in all over three yearly hooks, with an 8-year cooldown, three books at most, and one payment per hook [RF3]', () => {
    const { g, s } = newAstro(5)
    s.tally.flights = 3
    g.character.hidden.fame = 40
    const A = memoirAdvance(g, s)
    expect(A).toBe(Math.round(Math.min(600_000, Math.max(20_000, 20_000 + 15_000 * 3 + 4_000 * 40)) * wealth(g)))
    expect(memoirAdvance(g, { ...s, tally: { ...s.tally, flights: 0 } })).toBe(Math.round(Math.max(20_000, 20_000 + 4_000 * 40) * wealth(g)))
    g.character.hidden.fame = 100
    s.tally.flights = 99
    expect(memoirAdvance(g, s)).toBe(Math.round(600_000 * wealth(g)))
    g.character.hidden.fame = 40
    s.tally.flights = 3

    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const row = action(g, 'astro.memoir')
    expect(row.disabledReason?.(g)).toBeNull()
    const cash = g.character.money
    row.run(g)
    expect(g.character.money - cash).toBe(A)
    expect(astronautStore.view(g).legacy.memoirs).toEqual([{ year: 2026, advance: A, last: 2026, paid: 0 }])
    expect(row.disabledReason?.(g)).toMatch(/2034/)
    const once = quiet(g)
    row.run(g)
    expect(quiet(g)).toBe(once)

    // the tail: .4 A, .24 A, .14 A, one a year; a replayed hook adds nothing
    const tail: number[] = []
    for (let y = 0; y < 5; y++) {
      const before = events.length
      g.character.job!.performance = 80
      nextYear(g, astronautSim.yearly)
      const paid = events.slice(before).filter((e) => e.t === 'earn' && e.label === 'Memoir royalties')
      tail.push(...paid.map((e) => (e.t === 'earn' ? e.amount : 0)))
      const json = JSON.stringify(g)
      astronautSim.yearly(g)
      expect(JSON.stringify(g)).toBe(json)
    }
    setCareerAudit(null)
    expect(tail).toEqual([Math.round(0.4 * A), Math.round(0.24 * A), Math.round(0.14 * A)])
    expect(astronautStore.view(g).legacy.memoirs[0]).toMatchObject({ paid: 3 })
    expect(checkLedger(events, g).filter((x) => !x.startsWith('note-'))).toEqual([])

    // eight years on a second book is allowed, and three are the most
    g.year = 2034
    g.yearActions = {}
    expect(row.disabledReason?.(g)).toBeNull()
    const t = astronautStore.mut(g)
    t.legacy.memoirs = [
      { year: 2010, advance: 1, last: 2010, paid: 3 },
      { year: 2018, advance: 1, last: 2018, paid: 3 },
      { year: 2026, advance: 1, last: 2026, paid: 3 },
    ]
    g.year = 2040
    expect(row.disabledReason?.(g)).toMatch(/three/)
    // a fixed-name check on the tail helper: nothing owed, nothing paid
    const c = ctxOf(g, t)
    const cashNow = g.character.money
    memoirTail(c)
    expect(g.character.money).toBe(cashNow)
  })

  it('keeps paying the tail after the job is gone, and never twice for one year', () => {
    const { g, s } = newAstro(5)
    s.legacy.memoirs = [{ year: 2026, advance: 100_000, last: 2026, paid: 0 }]
    g.character.job = null
    const cash = g.character.money
    nextYear(g, astronautSim.yearly)
    expect(g.character.money - cash).toBe(40_000)
    const once = flat(g)
    astronautSim.yearly(g)
    expect(flat(g)).toBe(once)
    nextYear(g, astronautSim.yearly)
    nextYear(g, astronautSim.yearly)
    nextYear(g, astronautSim.yearly)
    expect(g.character.money - cash).toBe(40_000 + 24_000 + 14_000)
    expect(astronautStore.view(g).legacy.memoirs[0].paid).toBe(3)
  })
})

describe('astronaut exits: commercial flights', () => {
  const company = (o: Record<string, Json> = {}, tech: Record<string, Json> = {}): Asset => spaceAsset({ industry: 'spaceTech', tech: { done: ['rocket', 'crew'], safety: 70, wins: 4, booms: 1, ...tech }, ...o })

  it('reads a company raw and guarded, leaves the asset deep-equal, and hides astro.own on a shape mismatch', () => {
    const { g, s } = newAstro(5)
    s.tally.flights = 1
    g.assets = [company()]
    const before = structuredClone(g.assets)
    expect(ownedSpaceCompany(g)).toEqual({ safety: 70, booms: 1, wins: 4 })
    expect(g.assets).toEqual(before)
    const own = find(astronautJobNodes(g), g, 'astro.own') as MenuAction
    expect(own.visible?.(g)).toBe(true)

    const bad: unknown[] = [
      null,
      7,
      'x',
      [],
      {},
      { details: null },
      { details: [] },
      { details: { industry: 'spaceTech' } },
      { details: { industry: 'spaceTech', tech: 'x' } },
      { details: { industry: 'spaceTech', tech: { done: 'crew' } } },
      { details: { industry: 'spaceTech', tech: { done: ['rocket'] } } },
      { details: { industry: 'spaceTech', tech: { done: [7, null] } } },
      { details: { industry: 'biotech', tech: { done: ['crew'] } } },
    ]
    for (const a of bad) {
      g.assets = [a as Asset]
      expect(ownedSpaceCompany(g), JSON.stringify(a)).toBeNull()
      expect(own.visible?.(g)).toBe(false)
      expect(() => assertMenuPure(g, careerRoots('astronaut'))).not.toThrow()
    }
    g.assets = 'x' as unknown as Asset[]
    expect(ownedSpaceCompany(g)).toBeNull()
    // junk numbers read as plain ones
    g.assets = [company({}, { safety: 'bad', wins: -4, booms: Number.NaN })]
    expect(ownedSpaceCompany(g)).toEqual({ safety: 40, booms: 0, wins: 0 })
    // a junk asset before a good one does not hide it
    g.assets = [null as unknown as Asset, company()]
    expect(ownedSpaceCompany(g)).toEqual({ safety: 70, booms: 1, wins: 4 })
  })

  it('prices the risk as .010 x clamp((1 + booms)/(1 + wins), .6, 2.4) x (1.5 - safety/100)', () => {
    expect(ownRisk({ safety: 70, booms: 1, wins: 4 })).toBeCloseTo(0.01 * 0.6 * 0.8, 10) // 2/5 = 0.4 clamps up to 0.6
    expect(ownRisk({ safety: 40, booms: 3, wins: 3 })).toBeCloseTo(0.01 * 1 * 1.1, 10)
    expect(ownRisk({ safety: 0, booms: 99, wins: 0 })).toBeCloseTo(0.01 * 2.4 * 1.5, 10)
    expect(ownRisk({ safety: 100, booms: 0, wins: 99 })).toBeCloseTo(0.01 * 0.6 * 0.5, 10)
    for (const co of [{ safety: Number.NaN, booms: 1, wins: 1 }, { safety: 1e9, booms: -5, wins: 1e9 }]) expect(Number.isFinite(ownRisk(co))).toBe(true)
  })

  it('opens from 2020 with privateSpace, a company with a crew capsule and one flight, and flies once a year for fame and no pay', () => {
    const { g, s } = newAstro(5)
    g.assets = [company()]
    s.tally.flights = 0
    expect(ownBlock(g, s)).toMatch(/flight/)
    s.tally.flights = 1
    expect(ownBlock(g, s)).toBeNull()
    g.assets = []
    expect(ownBlock(g, s)).toMatch(/company/)
    g.assets = [company()]
    const early = newAstro(5, { year: 2015 })
    early.g.assets = [company()]
    early.s.tally.flights = 1
    expect(ownBlock(early.g, early.s)).toMatch(/2020/)
    const dosed = newAstro(5)
    dosed.g.assets = [company()]
    dosed.s.tally.flights = 1
    dosed.s.dose = 100
    expect(ownBlock(dosed.g, dosed.s)).toMatch(/radiation/)

    const row = action(g, 'astro.own')
    expect(row.disabledReason?.(g)).toBeNull()
    expect(typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle).toMatch(/about \d(\.\d)?%/)
    let flown: Fx | null = null
    for (let seed = 1; seed <= 20 && !flown; seed++) {
      const f = newAstro(seed)
      f.g.assets = [company()]
      f.s.tally.flights = 1
      f.g.rng = seed
      const events: AuditEvent[] = []
      setCareerAudit((e) => events.push(e))
      const cash = f.g.character.money
      const fame = fameOf(f.g)
      const before = astronautStore.view(f.g)
      action(f.g, 'astro.own').run(f.g)
      setCareerAudit(null)
      if (!f.g.character.alive) continue
      const t = astronautStore.view(f.g)
      if (t.tally.own !== 1) continue
      expect(events.filter((e) => e.t === 'earn')).toHaveLength(0) // no pay
      expect(f.g.character.money).toBe(cash)
      expect(fameOf(f.g)).toBe(fame + 3)
      expect([t.tally.flights, t.tally.own, t.tally.days]).toEqual([before.tally.flights + 1, 1, before.tally.days + 5])
      expect(t.flights.at(-1)).toMatchObject({ type: 'own', days: 5, result: 'clean' })
      expect(t.dose).toBeGreaterThan(before.dose)
      expect(action(f.g, 'astro.own').disabledReason?.(f.g)).toMatch(/already/)
      const once = quiet(f.g)
      action(f.g, 'astro.own').run(f.g)
      expect(quiet(f.g)).toBe(once)
      flown = f
    }
    expect(flown).not.toBeNull()
    expect(finiteJson(flown!.g)).toEqual([])
  })

  it('can lose the crew on a bad company record: a death or a hurt astronaut, never a crash', () => {
    let dead = 0
    let hurt = 0
    for (let seed = 1; seed <= 400; seed++) {
      const f = newAstro(seed)
      f.g.assets = [company({}, { safety: 0, booms: 99, wins: 0 })]
      f.s.tally.flights = 1
      f.g.rng = seed
      const health = f.g.character.stats.health
      action(f.g, 'astro.own').run(f.g)
      if (!f.g.character.alive) dead++
      else if (f.g.character.stats.health < health) hurt++
      expect(finiteJson(f.g), `seed ${seed}`).toEqual([])
    }
    expect(dead).toBeGreaterThan(0)
    expect(hurt).toBeGreaterThan(0)
  })
})

describe('astronaut exits: legacy', () => {
  it('counts legacy points by the formula', () => {
    const { s } = newAstro(5)
    Object.assign(s.tally, { flights: 3, days: 400, lunar: 1, mars: 1, commands: 2, evas: 3, blame: 1, firsts: ['First flight', 'First command'] })
    expect(legacyPoints(s)).toBe(4 * 3 + Math.floor(400 / 30) + 15 + 25 + 3 * 2 + 2 * 3 + 6 * 2 - 10)
    expect(legacyPoints(s)).toBe(12 + 13 + 15 + 25 + 6 + 6 + 12 - 10)
    s.tally = { ...s.tally, flights: 0, days: 0, lunar: 0, mars: 0, commands: 0, evas: 0, firsts: [], blame: 3 }
    expect(legacyPoints(s)).toBe(-30)
  })

  it('notes the firsts a record has earned, once each, at most 8', () => {
    const { s } = newAstro(5)
    noteFirsts(s, 2026)
    expect(s.tally.firsts).toEqual([])
    Object.assign(s.tally, { flights: 2, commands: 1, evas: 1, lunar: 1, mars: 1 })
    s.flights = [{ year: 2025, type: 'station', role: 'commander', days: 365, regimen: 'standard', result: 'clean', crew: [], bone: 90, dose: 40 }]
    noteFirsts(s, 2026)
    const once = [...s.tally.firsts]
    expect(once.length).toBe(6)
    expect(new Set(once).size).toBe(6)
    noteFirsts(s, 2026)
    expect(s.tally.firsts).toEqual(once)
    for (const x of once) expect(voiceProblems(x, 'log'), x).toEqual([])
    s.tally.firsts = Array.from({ length: 12 }, (_, i) => `x${i}`)
    noteFirsts(s, 2026)
    expect(s.tally.firsts.length).toBeLessThanOrEqual(8)
  })

  it('fires the Hall of Fame notice once at 60 and over, and shows legacy points on the Corps page [RF5]', () => {
    const f = newAstro(5, { level: 3, age: 59 })
    f.s.tally.flights = 4
    f.g.queue = []
    f.g.year += 1
    f.g.character.age += 1
    f.g.yearActions = {}
    yearlyAstronaut(f.g) // the legacy hook retires at 60
    expect(f.g.character.job).toBeNull()
    const fame = fameOf(f.g)
    astronautSim.yearly(f.g)
    expect(notices(f.g).filter((m) => m.title === 'Hall of Fame')).toHaveLength(1)
    expect(fameOf(f.g)).toBe(fame + 4)
    expect(astronautStore.view(f.g).legacy.hall).toBe(true)
    expect(f.g.character.memories.filter((m) => /Hall of Fame/.test(m))).toHaveLength(1)
    expect(astroPoliticsEdge(f.g)).toBe(Math.min(6, 2 + 1) - 0) // flown, and the hall
    // never again
    const once = flat(f.g)
    astronautSim.yearly(f.g)
    expect(flat(f.g)).toBe(once)
    nextYear(f.g, astronautSim.yearly)
    nextYear(f.g, astronautSim.yearly)
    expect(notices(f.g).filter((m) => m.title === 'Hall of Fame')).toHaveLength(1)
    expect(fameOf(f.g)).toBeLessThanOrEqual(fame + 4)

    // retiring before 60 earns none, even when a later year passes 60
    const early = newAstro(5, { level: 3, age: 55 })
    early.g.character.age = 55
    action(early.g, 'astro.quit').run(early.g)
    early.g.queue = []
    for (let i = 0; i < 8; i++) nextYear(early.g, astronautSim.yearly)
    expect(early.g.character.age).toBeGreaterThanOrEqual(60)
    expect(astronautStore.view(early.g).legacy.hall).toBe(false)
    expect(notices(early.g).filter((m) => m.title === 'Hall of Fame')).toHaveLength(0)

    // a direct call with the job still held does nothing
    const held = newAstro(5, { age: 62 })
    hallOfFame(ctxOf(held.g, held.s))
    expect(astronautStore.view(held.g).legacy.hall).toBe(false)

    // the Corps page reads pure and shows the points
    const g = newAstro(5, { level: 3 })
    Object.assign(g.s.tally, { flights: 3, days: 400, lunar: 1, mars: 0, commands: 1, evas: 2, blame: 0, firsts: ['First flight'] })
    g.g.character.hidden.fame = 20
    const log = find(astronautJobNodes(g.g), g.g, 'astro.log')
    expect(log).toBeDefined()
    const corps = find(astronautJobNodes(g.g), g.g, 'astro.corps')
    expect(corps && corps.type === 'menu').toBe(true)
    const rows = corps && corps.type === 'menu' ? corps.children(g.g) : []
    const text = rows.map((r) => (r.type === 'info' ? (typeof r.text === 'function' ? r.text(g.g) : r.text) : '')).join('\n')
    expect(text).toContain(`Legacy points ${legacyPoints(astronautStore.view(g.g))}`)
    expect(text).toMatch(/Funding \d+/)
    expect(text).toMatch(/Bone \d+/)
    for (const r of rows) if (r.type === 'info') expect((typeof r.text === 'function' ? r.text(g.g) : r.text).length).toBeLessThanOrEqual(90)
    expect(() => assertMenuPure(g.g, careerRoots('astronaut'))).not.toThrow()
  })

  it('gives an heir an empty record, no tail and no hall [RF2]', () => {
    const { g, s } = newAstro(5)
    s.legacy.hall = true
    s.legacy.memoirs = [{ year: 2025, advance: 100_000, last: 2025, paid: 0 }]
    s.tally.flights = 5
    const heir = createPerson(g, { relation: 'child', age: 25, firstName: 'Heir', livesWithPlayer: true })
    heir.relationship = 90
    g.character.willBeneficiaries = [heir.id]
    g.character.alive = false
    const n = continueAsChild(g, heir.id)
    expect(n).not.toBe(g)
    expect(astronautStore.peek(n)).toBeNull()
    expect(astronautStore.has(n)).toBe(false)
    expect(astroPoliticsEdge(n)).toBe(0)
    n.queue = []
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    nextYear(n, yearlySpecial)
    nextYear(n, yearlySpecial)
    setCareerAudit(null)
    expect(events.filter((e) => e.t === 'earn')).toEqual([])
    expect(astronautStore.peek(n)).toBeNull()
    expect(notices(n).filter((m) => m.title === 'Hall of Fame')).toHaveLength(0)
    // the public rows are closed to an heir
    const menu = find(astronautCareerMenu.children(n), n, 'astro.public')
    expect(menu === undefined || (menu.type === 'menu' && menu.visible?.(n) === false)).toBe(true)
  })

  it('keeps astroPoliticsEdge numbers, and the politics poll line takes it', () => {
    const { g, s } = newAstro(5)
    Object.assign(s.tally, { flights: 3, lunar: 1, mars: 0, blame: 1 })
    s.flights = [{ year: 2025, type: 'station', role: 'specialist', days: 200, regimen: 'standard', result: 'clean', crew: [], bone: 90, dose: 20 }]
    s.legacy.hall = true
    expect(astroPoliticsEdge(g)).toBe(Math.min(6, 2 + 2 + 1 + 1) - 3)
    expect(astroPoliticsEdge(g)).toBe(3)
    s.tally.blame = 0
    expect(astroPoliticsEdge(g)).toBe(6)
    const bare = makeTestGame(4, { age: 40 })
    expect(astroPoliticsEdge(bare)).toBe(0)

    // the poll a candidate starts a race with moves by exactly the edge
    const poll = (withRecord: boolean): number => {
      const h = makeTestGame(9, { age: 40, stats: { happiness: 50, health: 60, smarts: 50, looks: 50 } })
      h.year = 2026
      if (withRecord) {
        hire(h, { defId: 'astronaut', title: 'Astronaut', company: 'NASA', salary: 90_000, level: 1, performance: 60, data: { agency: 'oea', lastMissionAge: -1 } })
        const t = astronautStore.mut(h)
        Object.assign(t.tally, { flights: 2, lunar: 0, mars: 0, blame: 0 })
        h.character.job = null
      }
      h.queue = []
      runScript(h, 'special.pol.budget', '0', { office: 'school', party: 'independent', issue: 'economy', incumbentRun: false }, fake())
      const trail = h.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'special.pol.trail')
      return (trail?.data as unknown as { poll: number }).poll
    }
    expect(poll(true) - poll(false)).toBe(2)
  })
})

describe('astronaut exits: hostile records and menus', () => {
  it('renders every exit row on a frozen state in each life stage [RF5]', () => {
    // an active astronaut with flights, lectures and a memoir behind them
    const a = newAstro(5, { level: 3, age: 45 })
    Object.assign(a.s.tally, { flights: 3, days: 300, lunar: 0, evas: 1, commands: 1, firsts: ['First flight'] })
    a.s.legacy.memoirs = [{ year: 2020, advance: 50_000, last: 2021, paid: 1 }]
    a.g.assets = [spaceAsset({ industry: 'spaceTech', tech: { done: ['crew'], safety: 60, wins: 2, booms: 0 } })]
    expect(() => assertMenuPure(a.g, careerRoots('astronaut'))).not.toThrow()
    // an administrator
    const b = adminReady()
    action(b.g, 'astro.admin').run(b.g)
    expect(() => assertMenuPure(b.g, careerRoots('astronaut'))).not.toThrow()
    // a retired astronaut: the public life lives on the career menu
    const c = newAstro(5, { level: 3, age: 61 })
    c.s.tally.flights = 3
    c.g.character.job = null
    expect(() => assertMenuPure(c.g, careerRoots('astronaut'))).not.toThrow()
    const menu = find(astronautCareerMenu.children(c.g), c.g, 'astro.public')
    expect(menu && menu.type === 'menu' && menu.visible?.(c.g) !== false).toBe(true)
    // a legacy astronaut with no record at all
    const bare = makeTestGame(6, { age: 36 })
    bare.year = 2026
    hire(bare, { defId: 'astronaut', title: 'Astronaut', company: 'NASA', salary: 90_000, level: 3, performance: 60, data: { agency: 'oea', lastMissionAge: -1 } })
    expect(() => assertMenuPure(bare, careerRoots('astronaut'))).not.toThrow()
    expect(astronautStore.has(bare)).toBe(false)
  })

  it('survives junk in the memoir list, the admin data and the assets, through the yearly hook and the menus [RF1]', () => {
    const big = 'x'.repeat(10_000)
    const junk: unknown[] = [
      { legacy: { hall: 'yes', memoirs: [1, null, { year: 'x' }, { year: 2000, advance: 1e300, last: 'x', paid: Number.NaN }] } },
      { legacy: { memoirs: Array.from({ length: 500 }, (_, i) => ({ year: 2000 + i, advance: 1e9, last: 2000, paid: 0 })) } },
      { legacy: 7, tally: { firsts: Array.from({ length: 500 }, () => big), blame: -5, concerns: 'x' } },
      { cool: { ground: 'x', medical: Number.NaN, early: -5, split: 1e12, intense: [] }, lobby: 1e9 },
    ]
    for (const [i, j] of junk.entries()) {
      const { g } = newAstro(30 + i, { level: 3 })
      g.flags['special.astronaut.sim'] = { ...(j as object), owner: ownerKey(g) } as unknown as Json
      g.character.job!.data.admin = i % 2 === 0 ? ('bad' as unknown as Json) : ({ years: 'x', stance: { a: 1 } } as unknown as Json)
      g.assets = [spaceAsset({ industry: 'spaceTech', tech: { done: [big, 'crew'], safety: big, wins: 'x', booms: [] } })]
      expect(() => yearlySpecial(g), `junk ${i}`).not.toThrow()
      expect(() => nextYear(g, yearlySpecial), `junk ${i} again`).not.toThrow()
      expect(() => assertMenuPure(g, careerRoots('astronaut')), `menus ${i}`).not.toThrow()
      expect(() => adminBlock(g, astronautStore.mut(g))).not.toThrow()
      expect(() => takeAdmin(ctxOf(g))).not.toThrow()
      for (const id of ['astro.lecture', 'astro.memoir', 'astro.own', 'astro.lobby', 'astro.concern', 'astro.research']) {
        const row = find(astronautJobNodes(g), g, id)
        if (row && row.type === 'action' && !row.disabledReason?.(g)) expect(() => row.run(g), id).not.toThrow()
      }
      const t = astronautStore.view(g)
      expect(t.legacy.memoirs.length).toBeLessThanOrEqual(3)
      expect(t.tally.firsts.length).toBeLessThanOrEqual(8)
      expect(finiteJson(g), `junk ${i}`).toEqual([])
      expect(JSON.stringify(g.flags['special.astronaut.sim'])).not.toMatch(/NaN|Infinity|e\+\d\d/)
    }
  })
})
