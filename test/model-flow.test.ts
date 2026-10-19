import { afterEach, describe, expect, it } from 'vitest'
import { allBrands, brandAvailable } from '../src/game/data/brands'
import { runScript } from '../src/game/scripts'
import { fameOf, hire, ownerKey } from '../src/game/special/common'
import { activeField } from '../src/game/special/kit/rivals'
import { ACTION_BUDGET, careerCtx, setCareerAudit, type CareerCtx } from '../src/game/special/kit/year'
import { modelCareerMenu, modelJobNodes } from '../src/game/special/model'
import { RENEWAL_SCRIPT, agencyBlock, ensureContract, releaseFee, signWith, switchAgency } from '../src/game/special/model-agency'
import { boardOf, castBlock, castOffer, focusChange, modelRows, offerSabotage, portfolioShoot, recoveryPlan, restSeason, sabotageTargets, SABOTAGE_SCRIPT } from '../src/game/special/model-board'
import { lookValue, MODEL_SPEC, scoreOf, strainRisk } from '../src/game/special/model-core'
import { modelStore, readContract, type MdOffer, type ModelState } from '../src/game/special/model-state'
import type { ChoiceModal, GameState, Json, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { assertCareersClean, assertMenuPure, careerRoots, nextYear, playCareer } from './career-kit'
import { makeTestGame } from './helpers'

afterEach(() => setCareerAudit(null))

const json = (v: unknown): Json => v as Json

const offer = (o: Partial<MdOffer> = {}): MdOffer => ({
  id: 'x1',
  kind: 'catalogue',
  season: 'year',
  circuit: '',
  brand: '',
  house: 'The client',
  fee: 20_000,
  days: 2,
  minLook: 0,
  minTitle: 0,
  abroad: false,
  window: 0,
  rivals: [],
  status: 'open',
  terms: null,
  ...o,
})

let serial = 0
/** A notice-kind modal: runScript keeps no replay token for it, so a script's own guards are what is tested. */
const fake = (): ModalItem => ({ kind: 'notice', id: `t${++serial}`, title: '', text: '' })

const ctxOf = (g: GameState, s: ModelState = modelStore.mut(g)): CareerCtx<ModelState> => careerCtx(g, 'model', s, { ...ACTION_BUDGET })

/** A 1995 life, looks 80, headshot 80, cash 100,000, with no agency yet. */
function openLife(o: { age?: number; seed?: number; looks?: number } = {}): GameState {
  const age = o.age ?? 22
  const g = makeTestGame(o.seed ?? 5, { age, money: 100_000 })
  g.year = 1995
  g.log = [{ age, year: 1995, entries: [] }]
  g.character.stats.looks = o.looks ?? 80
  g.flags['special.model'] = json({ owner: ownerKey(g), headshot: 80, headshotAge: age, couture: [], gigs: 0, fashionWeeks: 0, rejectedBy: [] })
  return g
}

/** An open life signed to Silhouette Models on a guarantee. */
function signed(o: { age?: number; seed?: number; kind?: 'guarantee' | 'commission' } = {}): { g: GameState; s: ModelState } {
  const g = openLife(o)
  const s = modelStore.mut(g)
  s.book = 40
  s.rep = 60
  signWith(ctxOf(g, s), 'Silhouette Models', o.kind ?? 'guarantee')
  return { g, s }
}

const choiceOf = (g: GameState, scriptId: string): ChoiceModal | undefined => g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === scriptId)
const state = (g: GameState): string => JSON.stringify([g.flags, g.character.money, g.rng, g.yearActions])

const jobRow = (g: GameState, id: string): MenuAction => {
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
  const row = find([...modelJobNodes(g), ...modelRows(g)], 0)
  if (!row) throw new Error(`no row ${id}`)
  return row
}

describe('model casting: the legacy tick reads the board', () => {
  /** Two casts a year on the first castable open offers, then the year turns; the career ends when the job does. */
  function playSeasons(seed: number, years: number, castsPerYear: number): GameState {
    const { g } = signed({ seed })
    for (let y = 0; y < years && g.character.job?.defId === 'model'; y++) {
      for (let n = 0; n < castsPerYear; n++) {
        const s = modelStore.mut(g)
        const next = boardOf(g, s).find((o) => o.status === 'open' && !castBlock(g, s, o))
        if (!next) break
        castOffer(ctxOf(g, s), next.id)
      }
      g.queue = []
      nextYear(g)
      g.queue = []
    }
    return g
  }

  it('counts a booked casting as a gig and lifts performance, so a model who books each year climbs the ladder [RF4]', () => {
    const levels: number[] = []
    const performances: number[] = []
    const fames: number[] = []
    for (let seed = 1; seed <= 12; seed++) {
      const g = playSeasons(seed, 10, 2)
      const job = g.character.job
      levels.push(job?.defId === 'model' ? job.level : 0)
      performances.push(job?.defId === 'model' ? job.performance : 0)
      fames.push(fameOf(g))
    }
    expect(levels.filter((l) => l >= 1).length, `levels ${levels.join(',')}`).toBeGreaterThanOrEqual(10)
    expect(performances.reduce((a, b) => a + b, 0) / performances.length, `performance ${performances.join(',')}`).toBeGreaterThan(65)
    // the fame target follows the rank: past the level-0 target of 8, toward the label exit's 30
    expect(fames.filter((f) => f >= 30).length, `fame ${fames.join(',')}`).toBeGreaterThanOrEqual(8)
  })

  it('leaves a model who books nothing to the no-gigs drift', () => {
    const g = playSeasons(5, 3, 0)
    expect(g.character.job?.performance ?? 0).toBeLessThan(50)
  })

  it('books one gig on the job per won casting and none for a lost one', () => {
    const seen = new Set<string>()
    for (let rng = 1; rng <= 80 && seen.size < 2; rng++) {
      const { g, s } = signed({ seed: 5 })
      s.board = { year: g.year, items: [offer({ id: 'w1', fee: 5_000 })] }
      const job = g.character.job!
      const perf0 = job.performance
      const fame0 = fameOf(g)
      g.rng = rng
      castOffer(ctxOf(g, s), 'w1')
      const status = s.board.items[0].status
      seen.add(status)
      const gigs = (job.data as { gigsThisYear: number }).gigsThisYear
      if (status === 'booked') {
        expect(gigs).toBe(1)
        expect(job.performance).toBe(perf0 + 6)
        expect(fameOf(g)).toBeGreaterThanOrEqual(fame0)
      } else {
        expect(status).toBe('lost')
        expect(gigs).toBe(0)
        expect(job.performance).toBe(perf0)
        expect(fameOf(g)).toBe(fame0)
      }
    }
    expect([...seen].sort()).toEqual(['booked', 'lost'])
  })

  it('gives an unsigned model no ladder: a won open-call casting changes no job', () => {
    const g = openLife()
    const s = modelStore.mut(g)
    s.board = { year: g.year, items: [offer({ id: 'u1', fee: 800 })] }
    const status = (): string => s.board.items[0].status
    for (let rng = 1; rng <= 40; rng++) {
      g.rng = rng
      s.board.items[0].status = 'open'
      castOffer(ctxOf(g, s), 'u1')
      if (status() === 'booked') break
    }
    expect(status()).toBe('booked')
    expect(g.character.job).toBeNull()
  })
})

describe('model casting', () => {
  it('refuses castOffer with no state change for prison, age < 16, strain >= 95, unsigned couture, an exclusivity conflict and season overflow', () => {
    const watches = allBrands().filter((b) => b.category === 'watch' && brandAvailable(b, 'us', 1995))
    expect(watches.length).toBeGreaterThan(1)
    const cases: [string, (g: GameState, s: ModelState) => MdOffer[]][] = [
      ['prison', (g) => {
        g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
        return [offer()]
      }],
      ['age < 16', (g) => {
        g.character.age = 15
        return [offer()]
      }],
      ['strain 95', (_g, s) => {
        s.strain = 95
        return [offer()]
      }],
      ['unsigned couture', (g) => {
        g.character.job = null
        return [offer({ kind: 'couture', season: 'couture', circuit: 'paris-couture', abroad: true, days: 3 })]
      }],
      ['exclusivity window', (g, s) => {
        s.windows = [{ brand: watches[0].id, category: 'watch', until: g.year + 1 }]
        return [offer({ brand: watches[1].id })]
      }],
      ['season overflow', () => [offer({ id: 'b1', status: 'booked', days: 20 }), offer({ days: 5 })]],
    ]
    for (const [name, build] of cases) {
      const g = openLife({ age: 24 })
      hire(g, { defId: 'model', title: 'Model', company: 'Test Agency', salary: 10_000, data: { tier: 0, gigsThisYear: 0, sabotaged: 0 } })
      const s = modelStore.mut(g)
      s.board = { year: g.year, items: build(g, s) }
      const before = state(g)
      castOffer(ctxOf(g, s), 'x1')
      expect(state(g), name).toBe(before)
      expect(s.board.items.find((o) => o.id === 'x1')?.status, name).toBe('open')
    }
  })

  it('takes a casting once: a second cast of the same offer changes nothing', () => {
    const { g, s } = signed()
    s.board = { year: g.year, items: [offer({ id: 'once' })] }
    g.rng = 3
    castOffer(ctxOf(g, s), 'once')
    expect(s.board.items[0].status).not.toBe('open')
    const after = state(g)
    castOffer(ctxOf(g, s), 'once')
    expect(state(g)).toBe(after)
  })

  it('lets an unsigned model cast open-call work and pays it at the next tick', () => {
    const g = openLife()
    const board = modelCareerMenu.children(g).find((n) => n.type === 'menu' && n.id === 'model.board')
    if (!board || board.type !== 'menu') throw new Error('no board for an unsigned model')
    const rows = board.children(g).filter((n): n is MenuAction => n.type === 'action')
    expect(rows.length).toBeGreaterThan(0)
    for (const o of boardOf(g, modelStore.view(g))) expect(['catalogue', 'commercial', 'digital', 'editorial']).toContain(o.kind)
    let paid = false
    for (let seed = 1; seed < 80 && !paid; seed++) {
      const h = structuredClone(g)
      h.rng = seed
      rows[0].run(h)
      const cast = modelStore.view(h).board.items.find((o) => o.status === 'booked')
      if (!cast) continue
      expect(cast.terms).toBeNull()
      const cash = h.character.money
      nextYear(h)
      const row = modelStore.view(h).ledger[0]
      expect(row).toMatchObject({ agency: 0, mother: 0, recoup: 0, gross: cast.fee, net: cast.fee })
      expect(h.character.money - cash).toBe(cast.fee)
      paid = true
    }
    expect(paid).toBe(true)
  })

  it('books or loses a casting on the castPlan odds, notes the rivals and snapshots the terms at cast', () => {
    const { g, s } = signed()
    const field = activeField(g, MODEL_SPEC, s.memory)
    const niche = field.filter((x) => x.rival.edge === 'commercial')
    const rivals = (niche.length > 0 ? niche : field).slice(0, 2).map((x) => x.rival.id)
    expect(rivals.length).toBeGreaterThan(0)
    s.board = { year: g.year, items: [offer({ id: 'w1', rivals }), offer({ id: 'l1', rivals })] }
    const k = readContract(g.character.job, g)!
    const seen = new Set<string>()
    for (let seed = 1; seed < 80 && seen.size < 2; seed++) {
      const h = structuredClone(g)
      h.rng = seed
      const hs = modelStore.mut(h)
      castOffer(ctxOf(h, hs), 'w1')
      const o = hs.board.items.find((x) => x.id === 'w1')!
      seen.add(o.status)
      if (o.status === 'booked') {
        expect(o.terms).toEqual({ agency: 'Silhouette Models', commission: k.commission, mother: 0 })
        for (const id of rivals) expect(hs.memory.find((m) => m.id === id)).toMatchObject({ met: 1, won: 1, grudge: 1 })
      } else {
        expect(o.status).toBe('lost')
        expect(hs.memory.some((m) => m.lost === 1 && m.met === 1)).toBe(true)
      }
    }
    expect([...seen].sort()).toEqual(['booked', 'lost'])
  })

  it('holds a rival grudge at 3 and charges the abroad trip', () => {
    const { g, s } = signed()
    const id = activeField(g, MODEL_SPEC, s.memory)[0].rival.id
    s.memory = [{ id, name: 'Rival', met: 5, won: 3, lost: 0, grudge: 3, last: g.year }]
    s.board = { year: g.year, items: [offer({ id: 'r1', kind: 'runway', season: 'aw', circuit: 'milan', abroad: true, days: 2, rivals: [id], minTitle: 0 })] }
    const cash = g.character.money
    const strain = s.strain
    for (let seed = 1; seed < 80; seed++) {
      const h = structuredClone(g)
      h.rng = seed
      const hs = modelStore.mut(h)
      castOffer(ctxOf(h, hs), 'r1')
      expect(h.character.money).toBe(cash - 1_800)
      expect(hs.strain).toBe(strain + 6)
      const o = hs.board.items[0]
      if (o.status === 'booked') {
        expect(hs.memory.find((m) => m.id === id)!.grudge).toBe(3)
        return
      }
    }
    throw new Error('never booked in 80 seeds')
  })

  it('shows only the castings you can take and marks the best odds with the Modeling talent only', () => {
    const { g } = signed()
    const board = (): MenuNode[] => {
      const n = modelRows(g).find((x) => x.type === 'menu' && x.id === 'model.board')
      if (!n || n.type !== 'menu') throw new Error('no board')
      return n.children(g)
    }
    const casts = (): MenuAction[] => board().filter((n): n is MenuAction => n.type === 'action')
    expect(casts().length).toBeGreaterThan(0)
    expect(casts().filter((a) => a.hint?.(g))).toEqual([])
    g.character.talent = 'Modeling'
    const hints = casts().filter((a) => a.hint?.(g))
    expect(hints).toHaveLength(1)
    expect(hints[0].hint!(g)).toMatch(/Odds about \d+%: your fit \d+ against /)
    assertMenuPure(g, careerRoots('model'))
  })

  it('runs a cast row through the menu: the gate is rechecked inside run, and a refusal changes nothing', () => {
    const { g } = signed()
    const first = boardOf(g, modelStore.view(g))[0]
    const row = jobRow(g, `model.cast.${first.id}`)
    expect(row.disabledReason?.(g)).toBeNull()
    modelStore.mut(g).strain = 99
    expect(row.disabledReason?.(g)).toMatch(/worn down/i)
    const before = state(g)
    row.run(g)
    expect(state(g)).toBe(before)
  })

  it('caps the slots at 3 + floor(title/2) and takes two after a rest season', () => {
    const { g, s } = signed()
    const c = ctxOf(g, s)
    s.board = { year: g.year, items: Array.from({ length: 4 }, (_, i) => offer({ id: `c${i}`, days: 1 })) }
    for (let i = 0; i < 3; i++) {
      g.rng = 1 + i
      castOffer(c, `c${i}`)
    }
    expect(s.board.items.filter((o) => o.status !== 'open')).toHaveLength(3)
    expect(castBlock(g, s, s.board.items[3])).toMatch(/castings/i)
    // a rest season costs two
    const r = signed({ seed: 6 })
    restSeason(ctxOf(r.g, r.s))
    r.s.board = { year: r.g.year, items: Array.from({ length: 2 }, (_, i) => offer({ id: `c${i}`, days: 1 })) }
    castOffer(ctxOf(r.g, r.s), 'c0')
    expect(castBlock(r.g, r.s, r.s.board.items[1])).toMatch(/castings/i)
  })
})

describe('model levers', () => {
  it('blocks freelance under an exclusive contract inside run()', () => {
    const { g } = signed()
    const row = jobRow(g, 'model.freelance')
    row.run(g)
    expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'special.model.freelance')).toBe(false)
    expect(g.queue.some((m) => m.kind === 'notice')).toBe(true)
    // commission only is not exclusive
    const free = signed({ kind: 'commission', seed: 8 })
    jobRow(free.g, 'model.freelance').run(free.g)
    expect(free.g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'special.model.freelance')).toBe(true)
    // a legacy life the sim has not adopted keeps its freelance row
    const legacy = openLife()
    hire(legacy, { defId: 'model', title: 'Model', company: 'Silhouette Models', salary: 32_000, data: { tier: 1, gigsThisYear: 0, sabotaged: 0 } })
    jobRow(legacy, 'model.freelance').run(legacy)
    expect(legacy.queue.some((m) => m.kind === 'choice' && m.scriptId === 'special.model.freelance')).toBe(true)
  })

  it('pays a legacy freelance gig through the ledger and adds a book point once the sim has a record', () => {
    const { g } = signed({ kind: 'commission', seed: 8 })
    const before = modelStore.view(g)
    let done = false
    for (let seed = 1; seed < 60 && !done; seed++) {
      const h = structuredClone(g)
      h.rng = seed
      jobRow(h, 'model.freelance').run(h)
      const m = choiceOf(h, 'special.model.freelance')
      if (!m) continue
      const cash = h.character.money
      runScript(h, 'special.model.freelance', '0', m.data, fake())
      const after = modelStore.view(h)
      if (after.ledger.length === before.ledger.length) continue
      done = true
      const row = after.ledger.at(-1)!
      expect(row).toMatchObject({ agency: 0, mother: 0, recoup: 0, gross: row.net })
      expect(h.character.money - cash).toBe(row.net)
      expect(after.book).toBeGreaterThan(before.book)
    }
    expect(done).toBe(true)
  })

  it('changes direction once a year, free the first time, then book -3 and buzz x0.8', () => {
    const { g, s } = signed()
    s.book = 40
    s.buzz = 50
    expect(s.focus).toBe('runway')
    focusChange(ctxOf(g, s), 'editorial')
    expect(s).toMatchObject({ focus: 'editorial', focusYear: g.year, book: 40, buzz: 50 })
    const once = JSON.stringify(s)
    focusChange(ctxOf(g, s), 'commercial')
    expect(JSON.stringify(s)).toBe(once) // already changed this year
    nextYear(g, () => {})
    focusChange(ctxOf(g, s), 'commercial')
    expect(s).toMatchObject({ focus: 'commercial', book: 37, buzz: 40 })
  })

  it('rests a season, runs a recovery plan and shoots a portfolio, each once a year', () => {
    const { g, s } = signed()
    s.buzz = 50
    const cash = g.character.money
    restSeason(ctxOf(g, s))
    expect(s.restYear).toBe(g.year)
    expect(s.buzz).toBe(44)
    restSeason(ctxOf(g, s))
    expect(s.buzz).toBe(44)
    recoveryPlan(ctxOf(g, s))
    expect(s.planYear).toBe(g.year)
    expect(g.character.money).toBeLessThan(cash)
    const paid = g.character.money
    recoveryPlan(ctxOf(g, s))
    expect(g.character.money).toBe(paid)
    const book = s.book
    portfolioShoot(ctxOf(g, s), 1)
    expect(s.book).toBeGreaterThan(book)
    expect(s.photographers).toHaveLength(1)
    const after = JSON.stringify(s)
    portfolioShoot(ctxOf(g, s), 2)
    expect(JSON.stringify(s)).toBe(after)
  })

  it('refunds nothing it did not take: a shoot you cannot afford changes nothing', () => {
    const { g, s } = signed()
    g.character.money = 100
    const before = state(g)
    portfolioShoot(ctxOf(g, s), 2)
    expect(state(g)).toBe(before)
  })

  it('eases strain next year after a rest and shows the injury risk only above strain 40', () => {
    const { g, s } = signed()
    s.strain = 60
    const rest = jobRow(g, 'model.rest.season')
    expect(rest.disabledReason?.(g)).toBeNull()
    const menu = modelRows(g).find((n) => n.type === 'menu' && n.id === 'model.rest')
    expect(menu && menu.type === 'menu' ? menu.hint?.(g) : null).toBeNull() // no talent
    g.character.talent = 'Modeling'
    const text = menu && menu.type === 'menu' ? menu.hint?.(g) : null
    expect(text).toContain(`about ${Math.round(strainRisk(60) * 20) * 5}%`)
    s.strain = 20
    expect(menu && menu.type === 'menu' ? menu.hint?.(g) : null).toBeNull()
  })

  it('targets one of the three nearest rivals above you and drops them from this year shortlists', () => {
    const { g, s } = signed()
    s.book = 0
    s.rep = 0
    g.character.stats.looks = 20
    const me = scoreOf(lookValue(g, s), s.book, s.buzz, s.rep)
    const above = activeField(g, MODEL_SPEC, s.memory)
      .filter((x) => x.score > me)
      .sort((a, b) => a.score - b.score || (a.rival.id < b.rival.id ? -1 : 1))
      .slice(0, 3)
    const targets = sabotageTargets(g, s)
    expect(targets.length).toBeGreaterThan(0)
    expect(targets.map((t) => t.id)).toEqual(above.map((x) => x.rival.id))
    s.board = { year: g.year, items: [offer({ rivals: [targets[0].id] })] }
    const flags = JSON.stringify(g.flags)
    const rng = g.rng
    expect(offerSabotage(g)).toBe(true)
    expect(JSON.stringify(g.flags)).toBe(flags)
    expect(g.rng).toBe(rng)
    const modal = choiceOf(g, SABOTAGE_SCRIPT)!
    expect(modal.choices.map((c) => c.id)).toEqual([...targets.map((t) => t.id), 'cancel'])
    let hid = false
    for (let seed = 1; seed < 80 && !hid; seed++) {
      const h = structuredClone(g)
      h.rng = seed
      const m = choiceOf(h, SABOTAGE_SCRIPT)!
      runScript(h, SABOTAGE_SCRIPT, targets[0].id, m.data, fake())
      const hs = modelStore.view(h)
      expect(h.character.hidden.karma).toBe(g.character.hidden.karma - 8)
      if (h.character.job && !hs.board.items[0].rivals.includes(targets[0].id)) hid = true
    }
    expect(hid).toBe(true)
  })
})

describe('model contracts', () => {
  it('chains sign, renew and switch: release fee paid, appointmentId changes, mother override 5% for 8 years', () => {
    const { g, s } = signed()
    const job = g.character.job!
    const k = readContract(job, g)!
    expect(k).toMatchObject({ agency: 'Silhouette Models', tier: 1, guarantee: true, exclusive: true, commission: 22, since: 1995, until: 1998 })
    expect(k.appointmentId).toBe(job.data.appointmentId)
    expect(job).toMatchObject({ title: 'New Face', salary: 32_000, level: 0 })
    expect(s.floor).toBe(32_000)
    // under 23 with a book under 30 there is an advance of 3,000 x (tier + 1), booked as income
    const young = signed({ seed: 9 })
    expect(readContract(young.g.character.job, young.g)!.advance).toBe(0) // book 40
    const raw = openLife()
    const rs = modelStore.mut(raw)
    rs.book = 10
    const cash = raw.character.money
    signWith(ctxOf(raw, rs), 'Silhouette Models', 'guarantee')
    expect(readContract(raw.character.job, raw)).toMatchObject({ advance: 6_000, unrecouped: 6_000 })
    expect(raw.character.money).toBe(cash + 6_000)
  })

  it('renews, pushes and walks at the end of the term, once each', () => {
    const run = (choice: string, seed = 5): { g: GameState; s: ModelState } => {
      const { g } = signed({ seed })
      const job = g.character.job!
      job.data.contract = json({ ...readContract(job, g)!, until: g.year + 1, advance: 6_000, unrecouped: 6_000 })
      nextYear(g)
      const m = choiceOf(g, RENEWAL_SCRIPT)
      expect(m, 'the renewal is offered').toBeDefined()
      expect(m!.choices.map((c) => c.id)).toEqual(['renew', 'push', 'walk'])
      const cash = g.character.money
      runScript(g, RENEWAL_SCRIPT, choice, m!.data, fake())
      expect(g.character.money, 'no debt, nothing owed').toBeGreaterThanOrEqual(cash)
      return { g, s: modelStore.view(g) }
    }
    const renewed = run('renew')
    const k = readContract(renewed.g.character.job, renewed.g)!
    expect(k).toMatchObject({ until: renewed.g.year + 3, advance: 0, unrecouped: 0 })
    const walked = run('walk')
    expect(walked.g.character.job).toBeNull()
    expect(walked.g.character.careerHistory.at(-1)?.reason).toBe('quit')
    // a push either trims the commission by 3 or costs mood
    let trimmed = false
    let missed = false
    for (let seed = 1; seed < 60 && !(trimmed && missed); seed++) {
      const { g } = signed({ seed: 30 + seed })
      const job = g.character.job!
      const before = readContract(job, g)!
      job.data.contract = json({ ...before, until: g.year + 1 })
      nextYear(g)
      const m = choiceOf(g, RENEWAL_SCRIPT)!
      g.rng = seed
      const mood = modelStore.view(g).mood
      runScript(g, RENEWAL_SCRIPT, 'push', m.data, fake())
      const after = readContract(g.character.job, g)!
      if (after.commission === before.commission - 3) trimmed = true
      else if (modelStore.view(g).mood < mood) missed = true
    }
    expect(trimmed && missed).toBe(true)
  })

  it('hints the push odds with the talent only', () => {
    const { g } = signed()
    const job = g.character.job!
    job.data.contract = json({ ...readContract(job, g)!, until: g.year + 1 })
    nextYear(g)
    const plain = choiceOf(g, RENEWAL_SCRIPT)!
    expect(plain.choices.filter((c) => c.hint)).toEqual([])
    g.queue = []
    const t = signed({ seed: 11 })
    t.g.character.talent = 'Modeling'
    const tj = t.g.character.job!
    tj.data.contract = json({ ...readContract(tj, t.g)!, until: t.g.year + 1 })
    nextYear(t.g)
    const gifted = choiceOf(t.g, RENEWAL_SCRIPT)!
    expect(gifted.choices.find((c) => c.id === 'push')?.hint).toMatch(/About \d+% the agent gives ground\./)
  })

  it('drops you at the end of the term when the mood is under 35 or the look is under 28, with a Dropped notice and the career history', () => {
    const mood = signed({ seed: 12 })
    const job = mood.g.character.job!
    job.data.contract = json({ ...readContract(job, mood.g)!, until: mood.g.year + 1 })
    mood.s.mood = 0
    nextYear(mood.g)
    expect(mood.g.character.job).toBeNull()
    expect(mood.g.character.careerHistory.at(-1)).toMatchObject({ company: 'Silhouette Models', reason: 'fired' })
    expect(mood.g.queue.some((m) => m.kind === 'notice' && m.title === 'Dropped')).toBe(true)
    expect(choiceOf(mood.g, RENEWAL_SCRIPT)).toBeUndefined()
    // an old runway look
    const old = signed({ age: 40, seed: 13 })
    old.g.character.stats.looks = 60
    old.s.focus = 'runway'
    const oj = old.g.character.job!
    oj.data.contract = json({ ...readContract(oj, old.g)!, until: old.g.year + 1 })
    nextYear(old.g)
    expect(old.g.character.job).toBeNull()
    expect(old.g.queue.some((m) => m.kind === 'notice' && m.title === 'Dropped')).toBe(true)
  })

  it('switches agency: gates, a mid-term release fee, rep -10, a new appointment id and the mother override', () => {
    const { g, s } = signed({ age: 25 })
    const job = g.character.job!
    const oldId = job.data.appointmentId
    s.book = 40
    g.character.stats.looks = 80
    expect(agencyBlock(g, s, 'Prestige Model Management')).toBeNull()
    expect(agencyBlock(g, s, 'Icon Elite')).toMatch(/Looks 85/)
    const fee = releaseFee(g, s, readContract(job, g))
    expect(fee).toBe(2_000)
    const cash = g.character.money
    const rep = s.rep
    switchAgency(ctxOf(g, s), 'Prestige Model Management')
    const now = g.character.job!
    expect(now.company).toBe('Prestige Model Management')
    expect(now.data.appointmentId).not.toBe(oldId)
    expect(g.character.money).toBe(cash - fee)
    expect(s.rep).toBe(rep - 10)
    expect(s.mother).toMatchObject({ agency: 'Silhouette Models', overrideUntil: g.year + 8 })
    const k = readContract(now, g)!
    expect(k).toMatchObject({ agency: 'Prestige Model Management', tier: 2, guarantee: true })
    expect(s.agencies.map((a) => [a.name, a.to])).toEqual([['Silhouette Models', g.year], ['Prestige Model Management', 0]])
    // a casting after the switch pays the mother agency 5%
    s.board = { year: g.year, items: [offer({ id: 'm1', kind: 'catalogue' })] }
    for (let seed = 1; seed < 80 && s.board.items[0].status !== 'booked'; seed++) {
      g.rng = seed
      s.board.items[0].status = 'open'
      castOffer(ctxOf(g, s), 'm1')
    }
    expect(s.board.items[0]).toMatchObject({ status: 'booked', terms: { agency: 'Prestige Model Management', commission: k.commission, mother: 5 } })
    // free once the term has run
    const free = signed({ age: 25, seed: 14 })
    const fj = free.g.character.job!
    fj.data.contract = json({ ...readContract(fj, free.g)!, until: free.g.year })
    expect(releaseFee(free.g, free.s, readContract(fj, free.g))).toBe(0)
  })

  it('refuses a switch you cannot afford or a gate you do not pass, changing nothing', () => {
    const { g, s } = signed({ age: 25 })
    s.book = 40
    g.character.money = 500
    const before = state(g)
    switchAgency(ctxOf(g, s), 'Prestige Model Management')
    expect(state(g)).toBe(before)
    expect(g.character.job!.company).toBe('Silhouette Models')
    g.character.money = 50_000
    const again = state(g)
    switchAgency(ctxOf(g, s), 'Icon Elite')
    expect(state(g)).toBe(again)
  })

  it('grants the signing advance once a life, so switching agencies back and forth farms nothing', () => {
    const g = openLife({ age: 21 })
    const s = modelStore.mut(g)
    s.book = 14
    g.character.money = 13_000
    signWith(ctxOf(g, s), 'Hometown Faces', 'guarantee')
    expect(g.character.job!.company).toBe('Hometown Faces')
    const first = g.character.money
    expect(first).toBeGreaterThan(13_000) // the first signing carries the advance: under 23, book under 30
    let switches = 0
    for (let i = 0; i < 20; i++) {
      const to = i % 2 === 0 ? 'Silhouette Models' : 'Hometown Faces'
      switchAgency(ctxOf(g, s), to)
      if (g.character.job?.company === to) switches++
      // the advance of the new contract: none after the first signing
      expect(readContract(g.character.job, g)?.advance ?? 0, `switch ${i}`).toBe(0)
    }
    expect(switches).toBeGreaterThan(10) // the gates let the loop run, so the cash below is the answer
    expect(g.character.money).toBeLessThanOrEqual(first)
  })

  it('grants an advance on a first signing only, not on a re-signing after the job ends', () => {
    const g = openLife({ age: 21 })
    const s = modelStore.mut(g)
    s.book = 10
    signWith(ctxOf(g, s), 'Hometown Faces', 'commission')
    expect(readContract(g.character.job, g)!.advance).toBe(3_000)
    g.character.job = null
    s.agencies.forEach((a) => (a.to = g.year))
    const cash = g.character.money
    signWith(ctxOf(g, s), 'Hometown Faces', 'commission')
    expect(readContract(g.character.job, g)!.advance).toBe(0)
    expect(g.character.money).toBe(cash)
  })

  it('recoups an advance from later nets, then writes it off with no debt', () => {
    const g = openLife()
    const s = modelStore.mut(g)
    s.book = 10
    signWith(ctxOf(g, s), 'Hometown Faces', 'commission')
    const job = g.character.job!
    expect(job.salary).toBe(0)
    expect(readContract(job, g)).toMatchObject({ guarantee: false, exclusive: false, advance: 3_000, unrecouped: 3_000 })
    expect(s.floor).toBe(0)
    const terms = { agency: 'Hometown Faces', commission: 18, mother: 0 }
    s.board = { year: g.year, items: [offer({ id: 'a', fee: 10_000, status: 'booked', terms })] }
    const cash = g.character.money
    nextYear(g)
    // 10,000 - 1,800 commission = 8,200; 3,000 recouped; 5,200 paid (the legacy hook pays no retainer)
    expect(g.character.money - cash).toBe(5_200)
    expect(readContract(g.character.job, g)!.unrecouped).toBe(0)
    modelStore.mut(g).board = { year: g.year, items: [offer({ id: 'b', fee: 10_000, status: 'booked', terms })] }
    const cash2 = g.character.money
    nextYear(g)
    expect(g.character.money - cash2).toBe(8_200)
  })

  it('replays a resolved choice with no effect [RF3]', () => {
    const { g } = signed()
    const job = g.character.job!
    job.data.contract = json({ ...readContract(job, g)!, until: g.year + 1 })
    nextYear(g)
    const m = choiceOf(g, RENEWAL_SCRIPT)!
    runScript(g, RENEWAL_SCRIPT, 'renew', m.data, fake())
    const once = JSON.stringify(g)
    const rng = g.rng
    runScript(g, RENEWAL_SCRIPT, 'renew', m.data, fake())
    runScript(g, RENEWAL_SCRIPT, 'walk', m.data, fake())
    expect(JSON.stringify(g)).toBe(once)
    expect(g.rng).toBe(rng)
    expect(g.character.job).not.toBeNull()
    // another year or another owner changes nothing either
    const { g: h } = signed({ seed: 17 })
    const hj = h.character.job!
    hj.data.contract = json({ ...readContract(hj, h)!, until: h.year + 1 })
    nextYear(h)
    const hm = choiceOf(h, RENEWAL_SCRIPT)!
    const stale = JSON.stringify(h)
    runScript(h, RENEWAL_SCRIPT, 'walk', json({ ...(hm.data as object), owner: 'someone-else' }), fake())
    runScript(h, RENEWAL_SCRIPT, 'walk', json({ ...(hm.data as object), year: h.year - 1 }), fake())
    expect(JSON.stringify(h)).toBe(stale)
  })

  it('writes the legacy contract once and leaves a stored one alone', () => {
    const g = openLife()
    hire(g, { defId: 'model', title: 'Model', company: 'Prestige Model Management', salary: 60_000, data: { tier: 2, gigsThisYear: 0, sabotaged: 0 } })
    const job = g.character.job!
    expect(job.data.contract).toBeUndefined()
    const k = ensureContract(g, job)!
    expect(k).toMatchObject({ tier: 2, guarantee: true, exclusive: true, commission: 23 })
    expect(job.data.contract).toBeDefined()
    const stored = JSON.stringify(job.data.contract)
    ensureContract(g, job)
    expect(JSON.stringify(job.data.contract)).toBe(stored)
  })

  it('renders every row on a frozen state [RF5]', () => {
    const { g, s } = signed()
    assertMenuPure(g, careerRoots('model'))
    s.board = { year: g.year, items: [offer({ id: 'z1' }), offer({ id: 'z2', status: 'booked', terms: { agency: 'Silhouette Models', commission: 20, mother: 0 } })] }
    s.strain = 80
    s.windows = [{ brand: 'Brand', category: 'watch', until: g.year + 1 }]
    assertMenuPure(g, careerRoots('model'))
    const open = openLife()
    assertMenuPure(open, careerRoots('model'))
  })
})

describe('model playthrough', () => {
  for (const strategy of ['steady', 'reckless'] as const) {
    it(
      `keeps a 10-year ${strategy} playthrough clean`,
      () => {
        const r = playCareer('model', strategy, 10, 21)
        assertCareersClean([r])
        expect(r.years).toBeGreaterThan(0)
      },
      180_000,
    )
  }
})
