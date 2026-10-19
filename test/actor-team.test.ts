import { afterEach, describe, expect, it } from 'vitest'
import { getPerson, removePerson, yearActionsUsed } from '../src/game/core'
import { nameFitsYear } from '../src/game/history/events-people'
import { rand } from '../src/game/rng'
import { runScript } from '../src/game/scripts'
import { actorCareerMenu, actorJobNodes, genListings } from '../src/game/special/actor'
import { actorStore, adoptLegacy, type ActorState, type Rep } from '../src/game/special/actor-state'
import { actorSim } from '../src/game/special/actor-sim'
import { REP_SCRIPT, agencyHeat, bestRep, candidates, canSign, cutOf, fireRep, hireRep, poachRisk, pull, stepTeam, teamRows, type RepRole } from '../src/game/special/actor-team'
import { industryOf, rankOf, starPower } from '../src/game/special/actor-world'
import { hire, ownerKey } from '../src/game/special/common'
import { ACTION_BUDGET, careerCtx, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import type { ChoiceModal, GameState, Json, MenuAction, MenuNode, ModalItem, NoticeModal } from '../src/game/types'
import { assertCareersClean, assertMenuPure, BAD_TEXT, careerRoots, nextYear, playCareer, voiceProblems } from './career-kit'
import { makeTestGame } from './helpers'

const listFlag = (role: RepRole): string => `special.list.actor.rep.${role}`

const ctxOf = (g: GameState, s: ActorState = actorStore.mut(g)): CareerCtx<ActorState> => careerCtx(g, 'actor', s, { ...ACTION_BUDGET })

/** A notice-kind modal: runScript keeps no replay token for it, so a script's own guards are what is tested. */
let serial = 0
const fake = (): ModalItem => ({ kind: 'notice', id: `t${++serial}`, title: '', text: '' })

const rep = (o: Partial<Rep> = {}): Rep => ({ personId: '', name: 'Mia Chen', firm: 'Starlight Talent', quality: 40, cut: 0.1, loyalty: 60, since: 1995, ...o })

/** A 1995 life with an actor job, an adopted record and a trained actor (no project, no credits, no team). */
function newActor(seed = 5, o: { year?: number; country?: string; skill?: number } = {}): { g: GameState; s: ActorState } {
  const g = makeTestGame(seed, { age: 30, countryId: o.country ?? 'us' })
  g.year = o.year ?? 1995
  g.flags['skill.acting'] = o.skill ?? 60
  g.character.money = 100_000
  hire(g, { defId: 'actor', title: 'Actor', company: 'Silverline Studios', salary: 0, data: { project: null } })
  const s = actorStore.mut(g)
  adoptLegacy(g, s)
  return { g, s }
}

/** Gives the cached candidates of a role their fields (creating the list first). */
function plant(g: GameState, role: RepRole, patch: Record<string, unknown>[]): void {
  candidates(g, role)
  const items = (g.flags[listFlag(role)] as unknown as { items: Record<string, unknown>[] }).items
  patch.forEach((p, i) => Object.assign(items[i], p))
}

const notices = (g: GameState): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
const repModals = (g: GameState): ChoiceModal[] => g.queue.filter((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === REP_SCRIPT)

/** The state without the queue and the id counter: what a refusal must leave alone. */
const quiet = (g: GameState): string => JSON.stringify({ ...g, queue: [], nextId: 0, log: [] })

/** The state without the engine's token that a real modal was answered (cancel and junk choices still spend the modal). */
function calm(g: GameState): string {
  const c = structuredClone(g)
  delete c.flags['core.resolvedScriptModals']
  return JSON.stringify(c)
}

function creditRow(id: string, year: number, popularity: number): Record<string, unknown> {
  return { id, title: id, kind: 'film', role: 'Lead', genre: 'Drama', type: 'drama', industry: 'hollywood', studio: '', year, age: 25, pay: 1000, quality: 70, popularity, gross: 1, backend: 0, seasons: 1, verdict: 'released', residual: 0, trust: false }
}

function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 5) return undefined
  for (const n of nodes) {
    if ('id' in n && n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

function row(g: GameState, id: string): MenuAction {
  const n = findNode(g, careerRoots('actor')(g), id)
  if (!n || n.type !== 'action') throw new Error(`action ${id} not found`)
  return n
}

afterEach(() => setCareerAudit(null))

describe('actor team: pull, cuts and the pitch', () => {
  it('signs only when pull plus the roll reaches 0.8 quality', () => {
    const { g, s } = newActor(5)
    const r = candidates(g, 'agent')[0]
    for (const roll of [0, 10, 20, 30]) expect(canSign(g, s, r, roll)).toBe(pull(g, s) + roll >= 0.8 * r.quality)
    expect(canSign(g, s, { ...r, quality: 20 }, 0)).toBe(pull(g, s) >= 16)

    // pull = 0.6 star + 0.2 rep + 3 x min(6, credits)
    s.rep = 80
    expect(pull(g, s)).toBeCloseTo(0.6 * starPower(g, s) + 16, 10)
    s.credits = actorStore.read({ v: 1, credits: [creditRow('c1', 1990, 50), creditRow('c2', 1991, 50)] }, g).credits
    expect(pull(g, s)).toBeCloseTo(0.6 * starPower(g, s) + 16 + 6, 10)
    s.credits = actorStore.read({ v: 1, credits: Array.from({ length: 10 }, (_, i) => creditRow(`c${i}`, 1990 + (i % 4), 50)) }, g).credits
    expect(pull(g, s)).toBeCloseTo(0.6 * starPower(g, s) + 16 + 18, 10)
  })

  it('refuses a pitch below pull by direct run and signs one within it', () => {
    const { g, s } = newActor(5)
    g.flags['special.list.actor.roles'] = { age: g.character.age, owner: ownerKey(g), items: [] } as unknown as Json
    plant(g, 'agent', [{ quality: 95 }, { quality: 20 }])
    expect(pull(g, s) + 30).toBeLessThan(0.8 * 95)
    const people = g.people.length
    const money = g.character.money
    hireRep(ctxOf(g, s), 'agent', 0)
    expect(actorStore.view(g).team.agent).toBeNull()
    expect(g.people.length).toBe(people)
    expect(g.character.money).toBe(money)
    expect(g.flags['special.list.actor.roles']).toBeDefined()

    hireRep(ctxOf(g, s), 'agent', 1)
    const a = actorStore.view(g).team.agent
    expect(a?.loyalty).toBe(55)
    expect(a?.quality).toBe(20)
    const person = getPerson(g, a?.personId)
    expect(person?.alive).toBe(true)
    expect(person?.relation).toBe('coworker')
    expect(person?.occupation).toBe('Talent Agent')
    expect(`${person?.firstName} ${person?.lastName}`).toBe(a?.name)
    expect(g.flags['special.list.actor.roles']).toBeUndefined() // the listings are rebuilt with an agent
    expect(g.character.money).toBe(money) // hiring has no fee

    // a second hire for the filled slot, an index outside the list and a minor change nothing
    candidates(g, 'manager')
    const once = quiet(g)
    hireRep(ctxOf(g, s), 'agent', 0)
    hireRep(ctxOf(g, s), 'manager', 7)
    hireRep(ctxOf(g, s), 'manager', -1)
    expect(quiet(g)).toBe(once)
    const kid = makeTestGame(5, { age: 14 })
    kid.year = 1995
    const kidCtx = ctxOf(kid)
    const before = quiet(kid)
    hireRep(kidCtx, 'agent', 0)
    expect(quiet(kid)).toBe(before)
  })

  it('keeps the combined cut at or under 30%', () => {
    const { s } = newActor(5)
    s.team.agent = rep({ cut: 0.14 })
    s.team.manager = rep({ cut: 0.17 })
    expect(cutOf(s)).toBe(0.3)
    s.team.manager = rep({ cut: 0.11 })
    expect(cutOf(s)).toBeCloseTo(0.25, 10)
    s.team.agent = null
    s.team.manager = null
    expect(cutOf(s)).toBe(0)
  })

  it('offers three stable candidates: cuts by role, era-fitting names, no g.rng', () => {
    for (const [seed, year, country] of [[1, 1995, 'us'], [2, 1962, 'us'], [3, 2018, 'in'], [4, 1975, 'fr'], [5, 2030, 'jp']] as const) {
      const { g } = newActor(seed, { year, country })
      const rng = g.rng
      const json = JSON.stringify(g.flags)
      for (const role of ['agent', 'manager'] as const) {
        const list = candidates(g, role)
        expect(list).toHaveLength(3)
        expect(new Set(list.map((x) => x.name)).size).toBe(3)
        for (const x of list) {
          expect(x.quality).toBeGreaterThanOrEqual(25)
          expect(x.quality).toBeLessThanOrEqual(90)
          const [lo, hi] = role === 'agent' ? [0.08, 0.14] : [0.11, 0.17]
          expect(x.cut).toBeGreaterThanOrEqual(lo - 1e-9)
          expect(x.cut).toBeLessThanOrEqual(hi + 1e-9)
          expect(x.loyalty).toBe(55)
          expect(x.personId).toBe('')
        }
        expect(candidates(g, role)).toEqual(list) // cached for the year
      }
      expect(g.rng).toBe(rng)
      expect(JSON.stringify(g.flags)).not.toBe(json) // only the cache was written
    }
    // the same life, year and seed offer the same people; heirs share them; a quality-ordered cut
    const a = newActor(8).g
    const b = newActor(8).g
    expect(candidates(a, 'agent')).toEqual(candidates(b, 'agent'))
    const heir = newActor(8).g
    heir.lifeId = `${a.lifeId}-g2`
    expect(candidates(heir, 'agent').map((x) => x.name)).toEqual(candidates(a, 'agent').map((x) => x.name))
    // names fit the year they were born
    const old = newActor(9, { year: 1960 }).g
    const list = candidates(old, 'manager') as (Rep & { first: string; age: number })[]
    for (const x of list) expect(nameFitsYear(x.first, 1960 - x.age)).toBe(true)
  })

  it('asks 2 more points of cut once you are on the A-list', () => {
    const nobody = newActor(6)
    const star = newActor(6)
    star.g.character.hidden.fame = 100
    star.g.flags['skill.acting'] = 100
    star.s.rep = 100
    star.s.credits = actorStore.read({ v: 1, credits: [creditRow('c1', 1994, 100), creditRow('c2', 1993, 100), creditRow('c3', 1992, 100)] }, star.g).credits
    expect(rankOf(star.g, star.s).rank).toBeLessThanOrEqual(3)
    expect(rankOf(nobody.g, nobody.s).rank).toBeGreaterThan(3)
    for (const role of ['agent', 'manager'] as const) {
      const base = candidates(nobody.g, role)
      const top = candidates(star.g, role)
      top.forEach((x, i) => {
        expect(x.name).toBe(base[i].name)
        expect(x.cut).toBeCloseTo(base[i].cut + 0.02, 10)
      })
    }
  })

  it('marks the best value among the representatives you could sign (Acting hint only)', () => {
    const { g, s } = newActor(5)
    plant(g, 'agent', [
      { quality: 90, cut: 0.14 },
      { quality: 60, cut: 0.09 },
      { quality: 30, cut: 0.08 },
    ])
    const list = candidates(g, 'agent')
    const reach = pull(g, s) + 30
    expect(reach).toBeLessThan(0.8 * 90) // the 90 is out of reach for a newcomer
    const eligible = list.map((x, i) => ({ x, i })).filter(({ x }) => reach >= 0.8 * x.quality)
    const want = eligible.sort((a, b) => b.x.quality - 120 * b.x.cut - (a.x.quality - 120 * a.x.cut))[0].i
    expect(bestRep(g, s, list)).toBe(want)
    expect(bestRep(g, s, [{ ...list[0], quality: 95 }])).toBe(-1)

    row(g, 'actor.agent.hire').run(g)
    const plain = repModals(g)[0]
    expect(plain.choices.some((c) => c.hint)).toBe(false)
    g.queue = []
    g.yearActions = {}
    g.character.talents = ['Acting']
    row(g, 'actor.agent.hire').run(g)
    const gifted = repModals(g)[0]
    expect(gifted.choices.filter((c) => c.hint).map((c) => c.id)).toEqual([String(want)])
    expect(gifted.choices.find((c) => c.hint)?.hint).toMatch(/quality \d+/)
    expect(gifted.choices.find((c) => c.hint)?.hint).not.toMatch(/loyal|will/i)
  })
})

describe('actor team: the yearly step', () => {
  it('moves loyalty by +3 net pay, +2 hit, -5 dry and drifts quality 2 toward star', () => {
    const cases: { name: string; setup: (s: ActorState, g: GameState) => void; delta: number }[] = [
      { name: 'none', setup: () => {}, delta: 0 },
      { name: 'net pay', setup: (s) => void (s.rows = [{ y: 1994, income: 5_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]), delta: 3 },
      {
        name: 'pay and a hit',
        setup: (s, g) => {
          s.rows = [{ y: 1994, income: 5_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
          s.credits = actorStore.read({ v: 1, credits: [creditRow('c1', 1994, 70)] }, g).credits
        },
        delta: 5,
      },
      { name: 'a flop is not a hit', setup: (s, g) => void (s.credits = actorStore.read({ v: 1, credits: [creditRow('c1', 1994, 64)] }, g).credits), delta: 0 },
      { name: 'old pay is not net pay', setup: (s) => void (s.rows = [{ y: 1992, income: 5_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]), delta: 0 },
      { name: 'dry', setup: (s) => void (s.dry = 1), delta: -5 },
      { name: 'dry with residuals', setup: (s) => { s.dry = 1; s.rows = [{ y: 1994, income: 900, spent: 0, rank: 0, of: 0, standing: 20, note: '' }] }, delta: -2 },
    ]
    for (const t of cases) {
      const { g, s } = newActor(5)
      s.team.agent = rep({ quality: 40, loyalty: 60 })
      s.team.manager = rep({ name: 'Joe Park', quality: 40, loyalty: 70 })
      t.setup(s, g)
      stepTeam(ctxOf(g, s))
      expect(s.team.agent?.loyalty, t.name).toBe(60 + t.delta)
      expect(s.team.manager?.loyalty, t.name).toBe(70 + t.delta)
    }
    // quality drifts 2 toward the star score, either way, and stays in 20-95
    const low = newActor(5)
    low.s.team.agent = rep({ quality: 40 })
    const star = starPower(low.g, low.s)
    expect(star).toBeLessThan(38)
    stepTeam(ctxOf(low.g, low.s))
    expect(low.s.team.agent?.quality).toBe(38)
    const high = newActor(5)
    high.g.character.hidden.fame = 100
    high.s.rep = 100
    high.s.team.agent = rep({ quality: 40 })
    expect(starPower(high.g, high.s)).toBeGreaterThan(44)
    stepTeam(ctxOf(high.g, high.s))
    expect(high.s.team.agent?.quality).toBe(42)
    const near = newActor(5)
    near.s.team.agent = rep({ quality: starPower(near.g, near.s) + 1 })
    const at = near.s.team.agent!.quality
    stepTeam(ctxOf(near.g, near.s))
    expect(near.s.team.agent?.quality).toBe(at - 1)
  })

  it('keeps poach risk within 0.03 to 0.35', () => {
    const { s } = newActor(5)
    for (let quality = 20; quality <= 95; quality += 5) {
      for (let loyalty = 0; loyalty <= 100; loyalty += 10) {
        for (const heat of [0, 0.25, 0.5, 0.75, 1]) {
          const p = poachRisk(s, rep({ quality, loyalty }), heat)
          expect(p).toBeGreaterThanOrEqual(0.03)
          expect(p).toBeLessThanOrEqual(0.35)
        }
      }
    }
    expect(poachRisk(s, rep({ quality: 55, loyalty: 55 }), 0)).toBeCloseTo(0.03, 10)
    expect(poachRisk(s, rep({ quality: 80, loyalty: 55 }), 0)).toBeCloseTo(0.03 + 25 / 250, 10)
    expect(poachRisk(s, rep({ quality: 55, loyalty: 30 }), 1)).toBeCloseTo(0.03 + 25 / 250 + 0.05, 10)
    expect(poachRisk(s, rep({ quality: 95, loyalty: 0 }), 1)).toBe(0.35)
  })

  it('reads a seeded agency heat of 0 to 1 that heirs share', () => {
    const { g } = newActor(5)
    const seen = new Set<number>()
    for (let year = 1950; year < 2000; year++) {
      const h = agencyHeat(g, 'hollywood', year)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(1)
      expect(agencyHeat(g, 'hollywood', year)).toBe(h)
      seen.add(h)
    }
    expect(seen.size).toBeGreaterThan(40)
    const heir = structuredClone(g)
    heir.lifeId = `${g.lifeId}-g3`
    expect(agencyHeat(heir, 'bollywood', 1990)).toBe(agencyHeat(g, 'bollywood', 1990))
    expect(agencyHeat(g, 'bollywood', 1990)).not.toBe(agencyHeat(g, 'hollywood', 1990))
  })

  it('draws one poach roll per rep, at the risk it reports [RF3]', () => {
    const { g, s } = newActor(5)
    s.team.agent = rep({ quality: 90, loyalty: 60 })
    s.team.manager = rep({ name: 'Joe Park', quality: 70, loyalty: 60 })
    const heat = agencyHeat(g, industryOf(g), g.year)
    // two reps: exactly two draws from g.rng
    const two = structuredClone(g)
    rand(two)
    rand(two)
    stepTeam(ctxOf(g, s))
    expect(g.rng).toBe(two.rng)
    // one rep: one draw
    const solo = newActor(5)
    solo.s.team.agent = rep({ quality: 90, loyalty: 60 })
    const one = structuredClone(solo.g)
    rand(one)
    stepTeam(ctxOf(solo.g, solo.s))
    expect(solo.g.rng).toBe(one.rng)
    // no reps: none
    const none = newActor(5)
    const rng = none.g.rng
    stepTeam(ctxOf(none.g, none.s))
    expect(none.g.rng).toBe(rng)

    // each seed: the roll hits exactly when the first draw is under the risk of the rep as it stands after the drift
    const base = newActor(5).g
    let hits = 0
    for (let seed = 1; seed <= 400; seed++) {
      const x = structuredClone(base)
      x.rng = seed
      const u = rand(structuredClone(x))
      const sx = actorStore.mut(x)
      sx.team.agent = rep({ quality: 90, loyalty: 60 })
      stepTeam(ctxOf(x, sx))
      const risk = poachRisk(sx, sx.team.agent!, heat)
      const hit = sx.cool['poach.agent'] === x.year
      expect(hit, `seed ${seed}`).toBe(u < risk)
      if (hit) {
        hits++
        expect(sx.team.agent, 'loyalty 60 stays and waits for the choice').not.toBeNull()
      }
    }
    expect(hits).toBeGreaterThan(0)
    expect(hits).toBeLessThan(400)
  })

  it('lets a disloyal rep leave at once when the rival agency calls, with a notice', () => {
    let left = 0
    let stayed = 0
    const base = newActor(5).g
    for (let seed = 1; seed <= 200; seed++) {
      const g = structuredClone(base)
      const s = actorStore.mut(g)
      s.team.agent = rep({ quality: 90, loyalty: 35 })
      s.team.manager = rep({ name: 'Joe Park', quality: 70, loyalty: 80 })
      g.rng = seed
      stepTeam(ctxOf(g, s))
      const hit = s.cool['poach.agent'] === g.year
      if (hit) {
        left++
        expect(s.team.agent).toBeNull()
        expect(notices(g).some((n) => n.text.includes('Mia Chen'))).toBe(true)
      } else {
        stayed++
        expect(s.team.agent?.name).toBe('Mia Chen')
      }
      if (s.cool['poach.manager'] === g.year) expect(s.team.manager).not.toBeNull() // 80 waits for the choice
    }
    expect(left).toBeGreaterThan(0)
    expect(stayed).toBeGreaterThan(0)
  })

  it('lets the agent go at loyalty under 30 after two dry years, and sets the legacy flag', () => {
    const drop = (dry: number, loyalty: number) => {
      const { g, s } = newActor(5)
      s.dry = dry
      s.team.agent = rep({ loyalty })
      s.team.manager = rep({ name: 'Joe Park', loyalty })
      stepTeam(ctxOf(g, s))
      return { g, s }
    }
    const gone = drop(2, 34) // dry year: -5 takes 34 to 29
    expect(gone.s.team.agent).toBeNull()
    expect(gone.s.team.manager).not.toBeNull() // only the agent drops you
    expect(gone.g.flags['special.actor.dropped']).toBe(true)
    expect(notices(gone.g).some((n) => n.text.includes('Mia Chen'))).toBe(true)
    expect(drop(1, 34).s.team.agent).not.toBeNull()
    expect(drop(2, 40).s.team.agent).not.toBeNull()
    expect(drop(0, 34).g.flags['special.actor.dropped']).toBeUndefined()
  })

  it('frees the slot when the Person dies or is gone, with a notice', () => {
    const { g, s } = newActor(7)
    plant(g, 'agent', [{ quality: 20 }])
    plant(g, 'manager', [{ quality: 20 }])
    hireRep(ctxOf(g, s), 'agent', 0)
    hireRep(ctxOf(g, s), 'manager', 0)
    expect(s.team.agent).not.toBeNull()
    expect(s.team.manager).not.toBeNull()
    const agent = s.team.agent!
    const manager = s.team.manager!
    getPerson(g, agent.personId)!.alive = false
    removePerson(g, manager.personId)
    g.queue = []
    stepTeam(ctxOf(g, s))
    expect(s.team.agent).toBeNull()
    expect(s.team.manager).toBeNull()
    expect(notices(g).some((n) => n.text.includes(agent.name))).toBe(true)
    // a rep carried over from the legacy profile has no Person to lose
    const legacy = newActor(7)
    legacy.s.team.agent = rep({ personId: '' })
    stepTeam(ctxOf(legacy.g, legacy.s))
    expect(legacy.s.team.agent).not.toBeNull()
  })

  it('runs through the sim after residuals, once per (year, age) [RF3]', () => {
    const { g, s } = newActor(5)
    s.team.agent = rep({ quality: 40, loyalty: 60 })
    s.dry = 1
    nextYear(g, actorSim.yearly)
    expect(actorStore.view(g).team.agent?.loyalty).toBe(55)
    const once = JSON.stringify(g)
    const rng = g.rng
    actorSim.yearly(g)
    expect(JSON.stringify(g)).toBe(once)
    expect(g.rng).toBe(rng)
  })
})

describe('actor team: hiring and firing', () => {
  it('removes a fired rep unless the relationship is 60 or better', () => {
    const fire = (relationship: number) => {
      const { g, s } = newActor(7)
      plant(g, 'agent', [{ quality: 20 }])
      hireRep(ctxOf(g, s), 'agent', 0)
      const id = s.team.agent!.personId
      getPerson(g, id)!.relationship = relationship
      g.queue = []
      g.flags['special.list.actor.roles'] = { age: g.character.age, owner: ownerKey(g), items: [] } as unknown as Json
      fireRep(ctxOf(g, s), 'agent')
      expect(s.team.agent).toBeNull()
      expect(g.flags['special.list.actor.roles']).toBeUndefined()
      return getPerson(g, id)
    }
    expect(fire(59)).toBeUndefined()
    const friend = fire(60)
    expect(friend?.alive).toBe(true)
    expect(friend?.relation).toBe('friend')
    // a rep from the legacy profile has no Person, and an empty slot has nothing to fire
    const { g, s } = newActor(7)
    s.team.manager = rep({ personId: '' })
    fireRep(ctxOf(g, s), 'manager')
    expect(s.team.manager).toBeNull()
    const once = quiet(g)
    fireRep(ctxOf(g, s), 'manager')
    fireRep(ctxOf(g, s), 'agent')
    expect(quiet(g)).toBe(once)
  })

  it('takes a legacy life over when the team changes, so the legacy hook never also holds it', () => {
    const g = makeTestGame(6, { age: 30 })
    g.year = 1995
    g.flags['skill.acting'] = 60
    g.flags['special.actor'] = { owner: ownerKey(g), reputation: 62, credits: [], awards: [], nominations: 0, agent: null, dryYears: 0 } as unknown as Json
    hire(g, { defId: 'actor', title: 'Actor', company: 'Silverline Studios', salary: 0, data: { project: null } })
    const s = actorStore.mut(g)
    expect(s.migrated).toBe(false)
    plant(g, 'agent', [{ quality: 20 }])
    const legacy = JSON.stringify(g.flags['special.actor'])
    hireRep(ctxOf(g, s), 'agent', 0)
    expect(s.migrated).toBe(true)
    expect(s.team.agent).not.toBeNull()
    expect(JSON.stringify(g.flags['special.actor'])).toBe(legacy)
  })

  it('puts the team rows in the career menu and the job menu, with the legacy ids', () => {
    const { g } = newActor(5)
    const ids = ['actor.team', 'actor.agent.hire', 'actor.agent.fire', 'actor.manager.hire', 'actor.manager.fire']
    for (const roots of [teamRows(g), actorJobNodes(g), [actorCareerMenu, ...actorJobNodes(g)]]) for (const id of ids) expect(findNode(g, roots, id), id).toBeDefined()
    const bare = makeTestGame(5, { age: 30 })
    for (const id of ids) expect(findNode(bare, actorCareerMenu.children(bare), id), id).toBeDefined()
    // no agent: hire shows, fire hides
    const hireA = row(g, 'actor.agent.hire')
    const fireA = row(g, 'actor.agent.fire')
    expect(hireA.visible?.(g) ?? true).toBe(true)
    expect(fireA.visible?.(g)).toBe(false)
    const s = actorStore.mut(g)
    s.team.agent = rep()
    expect(hireA.visible?.(g)).toBe(false)
    expect(fireA.visible?.(g)).toBe(true)
    // the team menu states cut and quality, never loyalty
    const team = findNode(g, teamRows(g), 'actor.team')
    if (!team || team.type !== 'menu') throw new Error('no team menu')
    const text = team
      .children(g)
      .map((n) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : ''))
      .join(' | ')
    expect(text).toContain('Mia Chen')
    expect(text).toMatch(/quality 40/i)
    expect(text).toMatch(/10%/)
    expect(text).not.toMatch(/loyal/i)
  })

  it('runs the hire row as a pitch: one modal, replays and strangers change nothing [RF3]', () => {
    const { g } = newActor(5)
    plant(g, 'agent', [{ quality: 20 }, { quality: 95 }])
    row(g, 'actor.agent.hire').run(g)
    expect(yearActionsUsed(g, 'actor.search.agent')).toBe(1)
    const modals = repModals(g)
    expect(modals).toHaveLength(1)
    const m = modals[0]
    expect(m.choices.map((c) => c.id)).toEqual(['0', '1', '2', 'cancel'])
    for (const c of m.choices) expect(c.label.split(' ').length).toBeLessThanOrEqual(5)
    expect(m.text.endsWith('What will you do?')).toBe(true)
    expect(m.text.length).toBeLessThanOrEqual(140)

    runScript(g, REP_SCRIPT, '0', m.data, m)
    expect(actorStore.view(g).team.agent?.quality).toBe(20)
    const once = JSON.stringify(g)
    // the same modal again, a fresh copy of it, another owner and another year all change nothing
    runScript(g, REP_SCRIPT, '0', m.data, m)
    runScript(g, REP_SCRIPT, '1', m.data, fake())
    runScript(g, REP_SCRIPT, '0', { ...(m.data as object), owner: 'someone-else' } as Json, fake())
    expect(JSON.stringify(g)).toBe(once)
    const stale = structuredClone(g)
    stale.year += 1
    stale.character.age += 1
    actorStore.mut(stale).team.agent = null
    const before = JSON.stringify(stale)
    runScript(stale, REP_SCRIPT, '0', m.data, fake())
    expect(JSON.stringify(stale)).toBe(before)
    // a pitch that does not reach: nobody signs, and the modal is spent
    const { g: g2, s: s2 } = newActor(5)
    plant(g2, 'agent', [{ quality: 95 }])
    row(g2, 'actor.agent.hire').run(g2)
    const m2 = repModals(g2)[0]
    runScript(g2, REP_SCRIPT, '0', m2.data, m2)
    expect(actorStore.view(g2).team.agent).toBeNull()
    expect(notices(g2).length).toBeGreaterThan(0)
    expect(s2.done.length).toBe(1)
    // cancel and junk choices do nothing
    const { g: g3 } = newActor(5)
    row(g3, 'actor.manager.hire').run(g3)
    const m3 = repModals(g3)[0]
    const idle = calm(g3)
    runScript(g3, REP_SCRIPT, 'cancel', m3.data, m3)
    runScript(g3, REP_SCRIPT, '9', m3.data, m3)
    runScript(g3, REP_SCRIPT, 'x', undefined, m3)
    expect(calm(g3)).toBe(idle)
  })

  it('allows two searches a year per role and shows why not after that', () => {
    const { g } = newActor(5)
    const hireM = row(g, 'actor.manager.hire')
    expect(hireM.disabledReason?.(g)).toBeNull()
    for (let i = 0; i < 2; i++) {
      g.queue = []
      hireM.run(g)
      expect(repModals(g)).toHaveLength(1)
    }
    g.queue = []
    expect(yearActionsUsed(g, 'actor.search.manager')).toBe(2)
    expect(hireM.disabledReason?.(g)).toMatch(/calls/)
    const before = quiet(g)
    hireM.run(g)
    expect(repModals(g)).toHaveLength(0)
    expect(quiet(g)).toBe(before)
    expect(row(g, 'actor.agent.hire').disabledReason?.(g)).toBeNull() // the agent search is its own
    g.yearActions = {}
    expect(hireM.disabledReason?.(g)).toBeNull()
    // a minor can't look for one; a held slot says so and run re-checks both
    const kid = makeTestGame(5, { age: 14 })
    const kidHire = findNode(kid, actorCareerMenu.children(kid), 'actor.agent.hire') as MenuAction
    expect(kidHire.disabledReason?.(kid)).toMatch(/16/)
    const idle = quiet(kid)
    kidHire.run(kid)
    expect(quiet(kid)).toBe(idle)
    expect(repModals(kid)).toHaveLength(0)
  })

  it('holds back a pitch while two career choices wait, without spending the search', () => {
    const { g } = newActor(5)
    const hireA = row(g, 'actor.agent.hire')
    hireA.run(g)
    row(g, 'actor.manager.hire').run(g)
    expect(repModals(g)).toHaveLength(2)
    g.yearActions = {}
    hireA.run(g) // two are waiting
    expect(repModals(g)).toHaveLength(2)
    expect(yearActionsUsed(g, 'actor.search.agent')).toBe(0)
  })

  it('refuses a firing and a hire by direct run when the gate fails', () => {
    const { g, s } = newActor(5)
    const fireM = row(g, 'actor.manager.fire')
    expect(fireM.disabledReason?.(g)).toMatch(/manager/i)
    const idle = quiet(g)
    fireM.run(g)
    expect(quiet(g)).toBe(idle)
    s.team.agent = rep()
    const hireA = row(g, 'actor.agent.hire')
    expect(hireA.disabledReason?.(g)).toMatch(/agent/i)
    const held = quiet(g)
    hireA.run(g)
    expect(quiet(g)).toBe(held)
    expect(repModals(g)).toHaveLength(0)
    expect(yearActionsUsed(g, 'actor.search.agent')).toBe(0)
  })

  it('survives a junk candidate cache by building a fresh one', () => {
    const { g } = newActor(5)
    g.flags[listFlag('agent')] = { age: g.character.age, owner: ownerKey(g), items: [1, null, { name: 5 }, 'x'] } as unknown as Json
    const list = candidates(g, 'agent')
    expect(list).toHaveLength(3)
    for (const x of list) expect(Number.isFinite(x.quality) && Number.isFinite(x.cut)).toBe(true)
    g.flags[listFlag('manager')] = 'bad' as unknown as Json
    expect(candidates(g, 'manager')).toHaveLength(3)
  })
})

describe('actor team: listings and auditions', () => {
  it('adds one listing when the manager is at quality 60 or better', () => {
    const count = (manager: number | null): number => {
      const { g, s } = newActor(9)
      if (manager !== null) s.team.manager = rep({ quality: manager })
      return genListings(g).length
    }
    const base = count(null)
    expect(count(60)).toBe(base + 1)
    expect(count(95)).toBe(base + 1)
    expect(count(59)).toBe(base)
    expect(count(20)).toBe(base)
  })

  it('adds one audition a year at the same bar', () => {
    const auditions = (manager: number | null): number => {
      const { g, s } = newActor(9)
      if (manager !== null) s.team.manager = rep({ quality: manager })
      let n = 0
      for (let i = 0; i < 8; i++) {
        g.queue = []
        runScript(g, 'special.actor.pick', '0', undefined, fake())
        if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'special.actor.audition')) n++
      }
      return n
    }
    expect(auditions(null)).toBe(3)
    expect(auditions(59)).toBe(3)
    expect(auditions(60)).toBe(4)
  })
})

describe('actor team: menus', () => {
  it('renders every team row on a frozen state without rng or writes [RF5]', () => {
    const { g, s } = newActor(5)
    assertMenuPure(g, careerRoots('actor'))
    s.team.agent = rep({ quality: 72, cut: 0.12 })
    s.team.manager = rep({ name: 'Joe Park', quality: 64, cut: 0.15 })
    assertMenuPure(g, careerRoots('actor'))
    const bare = makeTestGame(5, { age: 30 })
    assertMenuPure(bare, () => [actorCareerMenu])
    const gifted = newActor(5).g
    gifted.character.talents = ['Acting']
    assertMenuPure(gifted, careerRoots('actor'))
  })
})

describe('actor team: voice', () => {
  it('keeps every line, label and hint inside the voice caps', () => {
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const labels: string[] = []
    const hints: string[] = []
    for (let seed = 1; seed <= 12; seed++) {
      for (const role of ['agent', 'manager'] as const) {
        const { g } = newActor(seed, { country: seed % 3 === 0 ? 'in' : seed % 3 === 1 ? 'us' : 'fr' })
        g.character.talents = ['Acting']
        row(g, `actor.${role}.hire`).run(g)
        const m = repModals(g)[0]
        labels.push(...m.choices.map((c) => c.label))
        hints.push(...m.choices.flatMap((c) => (c.hint ? [c.hint] : [])))
        for (const choice of ['0', '1', '2']) {
          const x = structuredClone(g)
          x.queue = []
          const sx = actorStore.mut(x)
          sx.done = []
          runScript(x, REP_SCRIPT, choice, m.data, fake())
          const signed = actorStore.view(x).team[role]
          if (!signed) continue
          const ctx = ctxOf(x, actorStore.mut(x))
          // the year after: it dies, it drops you, a rival agency calls, you fire it
          const dead = structuredClone(x)
          getPerson(dead, signed.personId)!.alive = false
          stepTeam(ctxOf(dead))
          const dropped = structuredClone(x)
          const sd = actorStore.mut(dropped)
          sd.dry = 3
          sd.team[role]!.loyalty = 20
          stepTeam(ctxOf(dropped, sd))
          for (let k = 1; k <= 60; k++) {
            const poached = structuredClone(x)
            poached.rng = k
            const sp = actorStore.mut(poached)
            sp.team[role]!.loyalty = 30
            stepTeam(ctxOf(poached, sp))
          }
          fireRep(ctx, role)
        }
      }
    }
    const texts = events.filter((e): e is Extract<AuditEvent, { t: 'text' }> => e.t === 'text')
    expect(texts.length).toBeGreaterThan(40)
    const problems = texts.flatMap((e) => voiceProblems(e.text, e.role).map((p) => `${p}: ${e.text}`))
    expect(problems).toEqual([])
    for (const e of texts) {
      expect(e.text, e.text).not.toMatch(BAD_TEXT)
      if (e.role === 'scene') {
        expect(e.text.length).toBeLessThanOrEqual(140)
        expect(e.text.endsWith('What will you do?')).toBe(true)
      }
      if (e.role === 'log') expect(e.text.length).toBeLessThanOrEqual(90)
      if (e.role === 'outcome') expect(e.text.length).toBeLessThanOrEqual(120)
    }
    expect(labels.length).toBeGreaterThan(40)
    for (const l of labels) expect(l.split(' ').length, l).toBeLessThanOrEqual(5)
    expect(hints.length).toBeGreaterThan(0)
    for (const h of hints) expect(h.length).toBeLessThanOrEqual(120)
  })
})

describe('actor team: in a played career', () => {
  it('keeps short steady and reckless playthroughs clean with the team rows in play [RF5]', () => {
    const rows = [playCareer('actor', 'steady', 6, 11), playCareer('actor', 'reckless', 6, 12)]
    assertCareersClean(rows)
    for (const r of rows) expect(r.years).toBeGreaterThan(0)
  }, 180_000)
})
