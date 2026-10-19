import { afterEach, describe, expect, it } from 'vitest'
import { bindMoneyContext, getPerson, yearActionsUsed } from '../src/game/core'
import { createPerson } from '../src/game/people'
import { actorCareerMenu, actorJob } from '../src/game/special/actor'
import { TYPE_IDS } from '../src/game/special/actor-data'
import { createTrust, likenessOf } from '../src/game/special/actor-legacy'
import { actorMenus, actorStanding } from '../src/game/special/actor-menu'
import { actorStore, adoptLegacy, type ActorState, type Proj } from '../src/game/special/actor-state'
import { hire, leave, money, ownerKey } from '../src/game/special/common'
import { ACTION_BUDGET, careerCtx, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import type { GameState, Json, MenuAction, MenuNode, NoticeModal } from '../src/game/types'
import { assertCareersClean, assertMenuPure, careerRoots, checkLedger, collectActions, finiteJson, nextYear, playCareer, voiceProblems } from './career-kit'
import { makeTestGame } from './helpers'

const ctxOf = (g: GameState, s: ActorState = actorStore.mut(g)): CareerCtx<ActorState> => careerCtx(g, 'actor', s, { ...ACTION_BUDGET })

/** The state without the queue, the log and the id counter: what a refusal must leave alone. */
const quiet = (g: GameState): string => JSON.stringify({ ...g, queue: [], nextId: 0, log: [] })

const notices = (g: GameState): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice')

const proj = (o: Partial<Proj> = {}): Proj => ({
  id: 'p1',
  title: 'The Last Echo',
  kind: 'film',
  genre: 'Drama',
  type: 'drama',
  role: 'Lead',
  studio: 'Silverline Studios',
  studioId: '',
  industry: 'hollywood',
  budget: 'studio',
  terms: { fee: 1_000_000, points: 0, exclusive: false },
  stage: 'shoot',
  developed: 0,
  buzz: 20,
  campaign: 0,
  season: 1,
  director: 65,
  costars: [],
  window: 'normal',
  quality: 70,
  since: 1995,
  lastYear: 1995,
  ...o,
})

const rep = (o: Partial<{ quality: number; cut: number }> = {}) => ({ personId: '', name: 'Mia Chen', firm: 'Northlight Management', quality: 40, cut: 0.1, loyalty: 60, since: 1994, ...o })

function creditRow(id: string, year: number, o: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: id, kind: 'film', role: 'Lead', genre: 'Drama', type: 'drama', industry: 'hollywood', studio: '', year, age: 25, pay: 1000, quality: 70, popularity: 60, gross: 1, backend: 0, seasons: 1, verdict: 'released', residual: 0, trust: false, ...o }
}

/** A 1995 life with an actor job, an adopted record and a trained actor: no project, no credits, no team. */
function newActor(seed = 5, o: { age?: number; year?: number; country?: string } = {}): { g: GameState; s: ActorState } {
  const g = makeTestGame(seed, { age: o.age ?? 30, countryId: o.country ?? 'us' })
  g.year = o.year ?? 1995
  g.flags['skill.acting'] = 60
  g.character.money = 1_000_000
  hire(g, { defId: 'actor', title: 'Actor', company: 'Silverline Studios', salary: 0, data: { project: null } })
  const s = actorStore.mut(g)
  adoptLegacy(g, s)
  return { g, s }
}

/** Everything on screen at once: a film shooting, a series shooting, a film in post, a manager, a press agent, a scandal, a typecast and a trust. */
function rich(): { g: GameState; s: ActorState } {
  const { g, s } = newActor(5, { age: 60 })
  const star = createPerson(g, { relation: 'coworker', age: 30, firstName: 'Co', lastName: 'Star', occupation: 'Actor' })
  s.credits = actorStore.read({ v: 1, credits: [creditRow('c1', 1990, { residual: 40_000, quality: 90 }), creditRow('c2', 1992, { residual: 20_000 })] }, g).credits
  s.pipeline = [
    proj({ id: 'p1', costars: [star.id] }),
    proj({ id: 'p2', title: 'Harbor Lights', kind: 'tv', budget: 'network', genre: 'Sitcom', type: 'comedy', terms: { fee: 80_000, points: 0, exclusive: false } }),
    proj({ id: 'p3', title: 'Night Shift', stage: 'post', lastYear: 1994 }),
  ]
  s.team.manager = rep()
  s.team.agent = rep({ cut: 0.08 })
  s.team.press = { firm: 'Ink & Co', quality: 70, since: 1994 }
  s.scandal = 40
  s.type.action = 60
  s.type.drama = 30
  s.rows = [{ y: 1994, income: 500_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
  return { g, s }
}

function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 6) return undefined
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

/** The ids on screen: hidden nodes skipped, groups opened. */
function visibleIds(g: GameState, nodes: MenuNode[], out: string[] = [], depth = 0): string[] {
  for (const n of nodes) {
    if (n.visible && !n.visible(g)) continue
    out.push(n.id)
    if (n.type === 'menu' && depth < 6) visibleIds(g, n.children(g), out, depth + 1)
  }
  return out
}

const sub = (g: GameState, n: MenuNode): string => (n.type === 'info' || n.type === 'heading' ? '' : typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''))

/** A legacy life: a profile in the old flag and a project on the job, never touched by the sim. */
function legacyLife(): GameState {
  const g = makeTestGame(3, { age: 30 })
  g.year = 1995
  g.character.money = 500_000
  g.flags['special.actor'] = {
    owner: ownerKey(g),
    reputation: 62,
    credits: [{ title: 'Film 0', kind: 'film', role: 'Supporting', genre: 'Horror', age: 24, pay: 90_000, quality: 60, popularity: 50, seasons: 1, verdict: 'a modest success', residual: 1_000 }],
    awards: [],
    nominations: 0,
    agent: { name: 'Mia Chen', firm: 'Starlight Talent', quality: 70, cut: 0.12 },
    dryYears: 1,
  } as unknown as Json
  hire(g, {
    defId: 'actor',
    title: 'Lead Actor',
    company: 'Silverline Studios',
    salary: 400_000,
    data: { project: { title: 'The Last Echo', kind: 'film', genre: 'Drama', role: 'Lead', studio: 'Silverline Studios', pay: 400_000, budget: 'studio', developed: 20, buzz: 4, season: 1, costars: [] } },
  })
  return g
}

afterEach(() => setCareerAudit(null))

describe('actor menus: purity and ids', () => {
  it('renders every actor menu on a frozen state without rng or writes [RF5]', () => {
    const { g } = newActor(5, { age: 60 })
    assertMenuPure(g, careerRoots('actor'))
    const full = rich()
    full.g.character.hidden.fame = 40
    assertMenuPure(full.g, careerRoots('actor'))
    createTrust(ctxOf(full.g, full.s))
    assertMenuPure(full.g, careerRoots('actor'))
    // between roles, and with no job at all
    leave(full.g, 'quit')
    assertMenuPure(full.g, careerRoots('actor'))
    assertMenuPure(full.g, (gg) => [actorCareerMenu, actorStanding, ...actorMenus(gg)])
    // a legacy life, before the first sim tick (its job has no project: the legacy project reader rewrites the job's
    // data on every read, which a frozen state refuses, and that reader is not part of this work)
    const old = legacyLife()
    old.character.job!.data.project = null
    const json = JSON.stringify(old.flags['special.actor'])
    assertMenuPure(old, careerRoots('actor'))
    expect(JSON.stringify(old.flags['special.actor'])).toBe(json)
    expect(actorStore.peek(old)).toBeNull()
  })

  it('keeps the legacy ids, for a migrated and for a legacy life', () => {
    for (const g of [newActor().g, rich().g, legacyLife()]) {
      for (const id of ['actor.audition', 'actor.practice', 'actor.agent.hire', 'actor.agent.fire', 'actor.stunt', 'actor.quit']) {
        const n = findNode(g, careerRoots('actor')(g), id)
        expect(n?.type, id).toBe('action')
      }
    }
  })

  it('shows no id twice, whatever the life', () => {
    const lives: GameState[] = [newActor().g, rich().g, legacyLife()]
    const gone = rich().g
    leave(gone, 'quit')
    lives.push(gone)
    for (const g of lives) {
      const ids = visibleIds(g, careerRoots('actor')(g))
      expect(new Set(ids).size, ids.filter((x, i) => ids.indexOf(x) !== i).join(',')).toBe(ids.length)
    }
  })

  it('hides the legacy project rows once the sim owns the life and keeps them before', () => {
    const old = legacyLife()
    const before = visibleIds(old, careerRoots('actor')(old))
    for (const id of ['actor.develop', 'actor.stunt', 'actor.quit', 'actor.practice']) expect(before, id).toContain(id)
    expect(before.some((x) => x.startsWith('actor.project.'))).toBe(false)
    expect(before).not.toContain('actor.pipeline')

    const { g } = rich()
    const ids = visibleIds(g, careerRoots('actor')(g))
    expect(ids).not.toContain('actor.develop')
    expect(ids).not.toContain('actor.costars')
    expect(ids).toEqual(expect.arrayContaining(['actor.audition', 'actor.practice', 'actor.stunt', 'actor.quit', 'actor.retire', 'actor.team', 'actor.pipeline', 'actor.industry', 'actor.likeness', 'actor.standing']))
    expect(ids).toEqual(expect.arrayContaining(['actor.project.p1', 'actor.project.p1.develop', 'actor.project.p2', 'actor.project.p3']))
    expect(ids).toContain('actor.scandal')
    expect(ids).toContain('actor.press')
  })

  it('shows scandal rows only with a scandal and the project rows by stage', () => {
    const { g, s } = rich()
    s.scandal = 0
    expect(visibleIds(g, careerRoots('actor')(g))).not.toContain('actor.scandal')
    s.scandal = 25
    expect(visibleIds(g, careerRoots('actor')(g))).toEqual(expect.arrayContaining(['actor.scandal', 'actor.apologize', 'actor.crisisPr', 'actor.layLow']))
    // post: the release window rows, no develop
    const post = findNode(g, careerRoots('actor')(g), 'actor.project.p3.window.awards')
    expect(post?.type).toBe('action')
    if (post?.type !== 'action') return
    expect(post.disabledReason?.(g)).toBeNull()
    const develop = row(g, 'actor.project.p3.develop')
    expect(develop.disabledReason?.(g)).toBeTruthy()
    expect(row(g, 'actor.project.p1.window.awards').disabledReason?.(g)).toBeTruthy()
  })
})

describe('actor menus: rows run the pipeline', () => {
  it('shows the price each row charges, and charges exactly that', () => {
    const cases: [string, number][] = [
      ['actor.project.p1.press', 40_000],
      ['actor.project.p1.campaign', 25_000],
      ['actor.crisisPr', 50_000],
      ['actor.range.action', 40_000],
      ['actor.trust.create', 25_000],
    ]
    for (const [id, price] of cases) {
      const { g } = rich()
      const n = row(g, id)
      expect(n.disabledReason?.(g), id).toBeNull()
      expect(sub(g, n), id).toContain(money(price))
      const cash = g.character.money
      n.run(g)
      expect(cash - g.character.money, id).toBe(price)
    }
    // the press agent: first year was paid at hire; hiring one is the retainer
    const { g, s } = rich()
    s.team.press = null
    const hirePress = row(g, 'actor.press.hire')
    expect(sub(g, hirePress)).toContain(money(25_000))
    const cash = g.character.money
    hirePress.run(g)
    expect(cash - g.character.money).toBe(25_000)
    expect(actorStore.view(g).team.press).not.toBeNull()
    row(g, 'actor.press.fire').run(g)
    expect(actorStore.view(g).team.press).toBeNull()
  })

  it('develops, hangs out, tours, campaigns and walks away through the project rows', () => {
    const { g, s } = rich()
    row(g, 'actor.project.p1.develop').run(g)
    expect(actorStore.view(g).pipeline[0].developed).toBeGreaterThanOrEqual(8)
    expect(row(g, 'actor.project.p1.develop').disabledReason?.(g)).toBeTruthy() // once a year
    row(g, 'actor.project.p1.costars').run(g)
    expect(yearActionsUsed(g, 'actor.costars.p1')).toBe(1)
    const buzz = actorStore.view(g).pipeline[0].buzz
    row(g, 'actor.project.p1.press').run(g)
    expect(actorStore.view(g).pipeline[0].buzz).toBe(buzz + 6)
    row(g, 'actor.project.p3.window.dodge').run(g)
    expect(actorStore.view(g).pipeline.find((p) => p.id === 'p3')?.window).toBe('dodge')
    row(g, 'actor.project.p3.campaign').run(g)
    expect(actorStore.view(g).pipeline.find((p) => p.id === 'p3')?.campaign).toBe(10)
    const rep0 = s.rep
    const walk = row(g, 'actor.project.p2.walk')
    expect(typeof walk.confirm?.(g)).toBe('string')
    walk.run(g)
    expect(actorStore.view(g).pipeline.map((p) => p.id)).toEqual(['p1', 'p3'])
    expect(actorStore.view(g).rep).toBe(rep0 - 15)
  })

  it('marks the dodge window only when a clash is set for the release year and only with Acting', () => {
    const { g } = rich()
    const dodge = row(g, 'actor.project.p3.window.dodge')
    g.character.talents = []
    expect(dodge.hint?.(g) ?? null).toBeNull()
    g.character.talents = ['Acting']
    const hints = TYPE_IDS.map((t) => {
      const s = actorStore.mut(g)
      s.pipeline = s.pipeline.map((p) => (p.id === 'p3' ? { ...p, type: t } : p))
      return row(g, 'actor.project.p3.window.dodge').hint?.(g) ?? null
    })
    expect(hints.some((h) => typeof h === 'string')).toBe(true)
    expect(hints.some((h) => h === null)).toBe(true)
    for (const h of hints) if (h) expect(h.length).toBeLessThanOrEqual(120)
  })

  it('works against type with a manager, one type at a time, once a year', () => {
    const { g, s } = rich()
    const n = row(g, 'actor.range.action')
    n.run(g)
    expect(actorStore.view(g).type.action).toBe(45)
    expect(row(g, 'actor.range.drama').disabledReason?.(g)).toBeTruthy() // once a year, whichever the type
    s.team.manager = null
    g.yearActions = {}
    expect(row(g, 'actor.range.action').disabledReason?.(g)).toBeTruthy()
  })

  it('runs the scandal levers: free apology, crisis PR, lying low', () => {
    const { g } = rich()
    row(g, 'actor.apologize').run(g)
    expect(actorStore.view(g).scandal).toBe(15)
    row(g, 'actor.layLow').run(g)
    expect(actorStore.view(g).layLow).toBe(g.year)
    expect(actorStore.view(g).scandal).toBe(0)
    expect(visibleIds(g, careerRoots('actor')(g))).not.toContain('actor.scandal')
  })

  it('creates the trust from the likeness menu and shows it as an asset with rows', () => {
    const { g } = rich()
    row(g, 'actor.trust.create').run(g)
    const a = g.assets.find((x) => likenessOf(x))
    expect(a).toBeTruthy()
    expect(actorStore.view(g).credits.every((c) => c.trust)).toBe(true)
    const ids = visibleIds(g, careerRoots('actor')(g))
    expect(ids).toContain(`actor.likeness.${a!.id}`)
    expect(row(g, 'actor.trust.create').disabledReason?.(g)).toBeTruthy() // one a life
    expect(findNode(g, careerRoots('actor')(g), `likeness.sell.${a!.id}`)?.type).toBe('action')
  })

  it('throws a publicity stunt at the first shoot, once a year', () => {
    const { g } = rich()
    const stunt = row(g, 'actor.stunt')
    expect(stunt.disabledReason?.(g)).toBeNull()
    stunt.run(g)
    const buzz = actorStore.view(g).pipeline[0].buzz
    expect([15, ...Array.from({ length: 8 }, (_, i) => 28 + i)]).toContain(buzz) // 20 - 5, or 20 + 8 to 15
    expect(yearActionsUsed(g, 'actor.stunt')).toBe(1)
    expect(stunt.disabledReason?.(g)).toBeTruthy()
    const once = quiet(g)
    stunt.run(g)
    expect(quiet(g)).toBe(once)
    // nothing to promote with no shoot
    const { g: idle } = newActor()
    expect(visibleIds(idle, careerRoots('actor')(idle))).not.toContain('actor.stunt')
    const bare = quiet(idle)
    row(idle, 'actor.stunt').run(idle)
    expect(quiet(idle)).toBe(bare)
  })
})

describe('actor menus: gates inside run', () => {
  it('refuses gated rows by direct run when the gate fails', () => {
    // press hire without cash
    const a = rich()
    a.s.team.press = null
    a.g.character.money = 100
    const hold = quiet(a.g)
    row(a.g, 'actor.press.hire').run(a.g)
    expect(quiet(a.g)).toBe(hold)

    // range work without a manager
    const b = rich()
    b.s.team.manager = null
    const noManager = quiet(b.g)
    row(b.g, 'actor.range.action').run(b.g)
    expect(quiet(b.g)).toBe(noManager)

    // a release date outside post
    const c = rich()
    const shooting = quiet(c.g)
    row(c.g, 'actor.project.p1.window.awards').run(c.g)
    expect(quiet(c.g)).toBe(shooting)

    // develop on a film in post, and a campaign for a project that is gone
    row(c.g, 'actor.project.p3.develop').run(c.g)
    expect(quiet(c.g)).toBe(shooting)

    // retire at 40
    const d = newActor(5, { age: 40 })
    d.s.credits = actorStore.read({ v: 1, credits: [creditRow('c1', 1990)] }, d.g).credits
    const young = quiet(d.g)
    row(d.g, 'actor.retire').run(d.g)
    expect(quiet(d.g)).toBe(young)
    expect(actorJob(d.g)).not.toBeNull()

    // crisis PR with no scandal, apology twice
    const e = rich()
    e.s.scandal = 0
    const calm = quiet(e.g)
    row(e.g, 'actor.crisisPr').run(e.g)
    row(e.g, 'actor.apologize').run(e.g)
    expect(quiet(e.g)).toBe(calm)

    // a trust with no credits
    const f = newActor(5, { age: 60 })
    const none = quiet(f.g)
    row(f.g, 'actor.trust.create').run(f.g)
    expect(quiet(f.g)).toBe(none)
    expect(f.g.assets).toHaveLength(0)
  })

  it('says why on a refusal', () => {
    const { g } = newActor(5, { age: 40 })
    row(g, 'actor.retire').run(g)
    expect(notices(g).length).toBeGreaterThan(0)
  })
})

describe('actor menus: retire and quit', () => {
  it('retires at 55 or after ten credits, with no shoot, and says goodbye', () => {
    const { g, s } = newActor(5, { age: 56 })
    s.credits = actorStore.read({ v: 1, credits: [creditRow('c1', 1990)] }, g).credits
    s.pipeline = [proj({ id: 'p9', stage: 'post', lastYear: 1994 })] // a film in post is not a shoot
    const retire = row(g, 'actor.retire')
    expect(retire.disabledReason?.(g)).toBeNull()
    retire.run(g)
    expect(actorJob(g)).toBeNull()
    expect(g.character.careerHistory[g.character.careerHistory.length - 1].reason).toBe('retired')
    expect(actorStore.view(g).done).toContain('retired')
    expect(notices(g).some((m) => m.title.length > 0)).toBe(true)
    // the film in post still opens, and the trust is free now
    expect(actorStore.view(g).pipeline.map((p) => p.id)).toEqual(['p9'])
    const cash = g.character.money
    row(g, 'actor.trust.create').run(g)
    expect(g.character.money).toBe(cash)
    expect(g.assets.some((x) => likenessOf(x))).toBe(true)

    // ten credits at 40
    const t = newActor(5, { age: 40 })
    t.s.credits = actorStore.read({ v: 1, credits: Array.from({ length: 10 }, (_, i) => creditRow(`c${i}`, 1980 + i)) }, t.g).credits
    expect(row(t.g, 'actor.retire').disabledReason?.(t.g)).toBeNull()
    // but not in the middle of a shoot
    t.s.pipeline = [proj()]
    expect(row(t.g, 'actor.retire').disabledReason?.(t.g)).toBeTruthy()
    const mid = quiet(t.g)
    row(t.g, 'actor.retire').run(t.g)
    expect(quiet(t.g)).toBe(mid)
  })

  it('quits mid-shoot: every shoot dropped, reputation -15 each to -30, fame -3, co-stars gone', () => {
    const { g, s } = rich()
    g.character.hidden.fame = 40
    const star = s.pipeline[0].costars[0]
    expect(getPerson(g, star)).toBeTruthy()
    s.rep = 80
    const quit = row(g, 'actor.quit')
    expect(typeof quit.confirm?.(g)).toBe('string')
    quit.run(g)
    expect(actorJob(g)).toBeNull()
    expect(g.character.careerHistory[g.character.careerHistory.length - 1].reason).toBe('quit')
    const now = actorStore.view(g)
    expect(now.rep).toBe(50) // two live shoots: -30 in all
    expect(g.character.hidden.fame).toBe(37)
    expect(now.pipeline.map((p) => p.id)).toEqual(['p3']) // the film in post stays
    expect(getPerson(g, star)).toBeUndefined()

    // one shoot costs 15, and a quit with no shoot costs nothing
    const one = newActor(5, { age: 40 })
    one.s.pipeline = [proj()]
    one.s.rep = 60
    row(one.g, 'actor.quit').run(one.g)
    expect(actorStore.view(one.g).rep).toBe(45)
    const none = newActor(5, { age: 40 })
    none.s.rep = 60
    none.g.character.hidden.fame = 30
    row(none.g, 'actor.quit').run(none.g)
    expect(actorStore.view(none.g).rep).toBe(60)
    expect(none.g.character.hidden.fame).toBe(30)
  })

  it('keeps the legacy quit for a life the sim has not taken over', () => {
    const g = legacyLife()
    const quit = row(g, 'actor.quit')
    quit.run(g)
    expect(actorJob(g)).toBeNull()
    expect(actorStore.peek(g)).toBeNull() // the legacy flag is all that was touched
  })
})

describe('actor menus: the whole career', () => {
  it('keeps a 12-year steady and reckless playthrough clean [RF1 RF3 RF5]', () => {
    const runs = [11, 12].flatMap((seed) => (['steady', 'reckless'] as const).map((strategy) => playCareer('actor', strategy, 12, seed)))
    assertCareersClean(runs)
    expect(runs.every((r) => r.checks.purity > 0)).toBe(true)
  }, 600_000)

  it('plays a gifted actor in Lagos, an old-money Hollywood life and a late-era Seoul life without a problem', () => {
    const runs = [playCareer('actor', 'steady', 8, 21, 'ng', 2012), playCareer('actor', 'reckless', 8, 22, 'us', 1962), playCareer('actor', 'greedy', 8, 23, 'kr', 2020)]
    assertCareersClean(runs)
  }, 600_000)

  it('exposes the standing card as report rows', () => {
    const { g } = rich()
    const card = actorStanding.children(g)
    expect(card.some((n) => n.type === 'info')).toBe(true)
    expect(typeof actorStanding.subtitle === 'function' ? actorStanding.subtitle(g) : actorStanding.subtitle).toContain('Reputation')
    expect(actorMenus(g).map((n) => n.id)).toEqual(expect.arrayContaining(['actor.team', 'actor.pipeline', 'actor.industry', 'actor.likeness', 'actor.retire']))
  })

  it('lists the industry rows: rank, hot type, next year clash, the era rule, and a hint for the gifted', () => {
    const { g } = rich()
    const industry = findNode(g, careerRoots('actor')(g), 'actor.industry')
    expect(industry?.type).toBe('menu')
    if (industry?.type !== 'menu') return
    const texts = (): string[] => industry.children(g).map((n) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : ''))
    const all = texts().join(' ')
    expect(all).toMatch(/rank \d+ of \d+/i)
    expect(all).toMatch(/Hot this year: /)
    expect(all).toMatch(/Next year's calendar/)
    for (const t of texts()) expect(t).not.toMatch(/NaN|undefined|\[object/)
    g.character.talents = ['Acting']
    expect(typeof industry.hint?.(g)).toBe('string')
    g.character.talents = []
    expect(industry.hint?.(g) ?? null).toBeNull()
    // a studio-system year says so, and a free-agent year says that
    g.year = 1940
    expect(texts().join(' ')).toMatch(/studio system/i)
    g.year = 1995
    expect(texts().join(' ')).toMatch(/negotiate your own terms/i)
  })

  it('runs every enabled row on a clone, books every cash move and keeps its text in voice [RF1]', () => {
    const lives: GameState[] = []
    const a = rich()
    lives.push(a.g)
    const b = rich()
    createTrust(ctxOf(b.g, b.s))
    lives.push(b.g)
    const c = newActor(5, { age: 60 })
    c.s.credits = actorStore.read({ v: 1, credits: Array.from({ length: 12 }, (_, i) => creditRow(`c${i}`, 1980 + i, { residual: 5_000 })) }, c.g).credits
    c.s.pipeline = [proj({ id: 'p9', stage: 'post', lastYear: 1994 })]
    lives.push(c.g)
    lives.push(legacyLife())
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    let ran = 0
    for (const g of lives) {
      bindMoneyContext(g)
      for (const act of collectActions(g, careerRoots('actor')(g), 6)) {
        const dry = structuredClone(g)
        const mark = events.length
        act.run(dry)
        ran++
        expect(finiteJson(dry), act.id).toEqual([])
        expect(checkLedger(events.slice(mark), dry).filter((l) => !l.startsWith('note-')), act.id).toEqual([])
      }
    }
    bindMoneyContext(null)
    expect(ran).toBeGreaterThan(25)
    const spoken = events.filter((e): e is Extract<AuditEvent, { t: 'text' }> => e.t === 'text')
    expect(spoken.length).toBeGreaterThan(20)
    for (const e of spoken) expect(voiceProblems(e.text, e.role), `${e.role}: ${e.text}`).toEqual([])
  })

  it('survives a hostile record: menus render, the year turns, every number stays finite [RF1]', () => {
    const { g } = newActor(5, { age: 60 })
    const big = (n: number): string => 'x'.repeat(n)
    g.flags['special.actor.sim'] = {
      v: 1,
      owner: ownerKey(g),
      migrated: true,
      standing: 1e300,
      rep: 1e300,
      scandal: 1e9,
      layLow: 1e300,
      type: { action: NaN, comedy: 1e300, drama: -4, genre: 'x', romance: Infinity },
      team: { agent: { name: big(10_000), firm: big(10_000), quality: 1e9, cut: 5, loyalty: NaN, personId: big(500), since: 1e300 }, manager: { cut: -3 }, press: { firm: big(10_000), quality: -4 } },
      credits: Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, title: big(10_000), pay: 1e300, quality: 1e9, popularity: NaN, residual: 1e300, trust: 'yes' })),
      pipeline: Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, title: big(10_000), kind: 'tv', type: 'nope', role: 'Lead', stage: i % 2 ? 'post' : 'shoot', industry: 'mars', budget: 'streaming', terms: { fee: 1e300, points: 99, exclusive: 'x' }, buzz: NaN, campaign: -1e9, costars: [big(10_000)], window: 'sideways', quality: Infinity, since: NaN, lastYear: 1e300 })),
      awards: Array.from({ length: 100 }, () => big(10_000)),
      rows: Array.from({ length: 500 }, () => ({ y: 1e300, income: NaN, spent: Infinity })),
      totals: { gross: 1e300, net: Infinity, cuts: NaN, spent: -9 },
    } as unknown as Json
    g.assets.push({ id: 'h1', kind: 'other', name: big(10_000), emoji: 'x', purchasePrice: 1, value: 1, condition: 100, purchasedAge: 30, upkeep: 0, details: { actorLikeness: { author: 'a', streams: 1e300, likeness: 1e300, industry: 'zzz', country: 'zzz' } as unknown as Json } })
    assertMenuPure(g, careerRoots('actor'))
    for (const act of collectActions(g, careerRoots('actor')(g), 6)) {
      const dry = structuredClone(g)
      expect(() => act.run(dry), act.id).not.toThrow()
      expect(Number.isFinite(dry.character.money), act.id).toBe(true)
    }
    // a row that writes the record normalizes it; the year turn always does
    expect(() => nextYear(g)).not.toThrow()
    expect(finiteJson(g)).toEqual([])
    assertMenuPure(g, careerRoots('actor'))
  })
})
