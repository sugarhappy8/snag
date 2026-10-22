import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { scriptChoice } from '../src/game/core'
import { yearlyEntries } from '../src/game/kernel/registry'
import { defineScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { hire, money } from '../src/game/special/common'
import { CAREER_SIMS, yearlyCareerSims, type CareerSim } from '../src/game/special/kit/careers'
import { gatedAction, reportLines, standingMenu } from '../src/game/special/kit/menu'
import { noteRival, standingOf } from '../src/game/special/kit/rivals'
import { careerCtx, offerChoice, setCareerAudit, type AuditEvent } from '../src/game/special/kit/year'
import type { GameState, MenuNode } from '../src/game/types'
import {
  assertCareersClean,
  assertMenuPure,
  BAD_TEXT,
  CAREER_SETUPS,
  checkLedger,
  collectActions,
  drainCareer,
  newCareerGame,
  nextYear,
  pickStance,
  playCareer,
  roundTrip,
  summarizeCareers,
  type CareerSetup,
  type CareerStats,
} from './career-kit'
import { newProbeGame, probePeers, probeSpec, probeStore, probeYear, type ProbeState } from './career-probe'
import { makeTestGame } from './helpers'

const PRISON = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 } as const

type GigOpts = Parameters<typeof gatedAction<ProbeState>>[0]

const gig = (over: Partial<GigOpts> = {}) =>
  gatedAction({
    id: 'probe.work',
    label: 'Take a gig',
    emoji: '\u{1F4BC}',
    career: 'probe',
    store: probeStore,
    gate: () => null,
    run: (c) => {
      c.earn('Gig', 1000)
    },
    ...over,
  })

const card = () => standingMenu({ id: 'probe.card', label: 'Report card', emoji: '\u{1F4CB}', store: probeStore, standingLabel: 'Reputation', incomeLabel: 'Fees', peers: probePeers })

const infoTexts = (g: GameState, nodes: MenuNode[]): string[] => nodes.filter((n) => n.type === 'info').map((n) => (typeof n.text === 'function' ? n.text(g) : n.text))

describe('gated actions', () => {
  let g: GameState
  beforeEach(() => {
    g = newProbeGame(5)
  })
  afterEach(() => setCareerAudit(null))

  it('enforces the gate inside run, not only in the menu', () => {
    const a = gig({ gate: () => 'Not yet.' })
    const cash = g.character.money
    expect(a.disabledReason?.(g)).toBe('Not yet.')
    a.run(g)
    expect(g.character.money).toBe(cash)
    expect(probeStore.has(g)).toBe(false) // nothing was created, nothing was used up
    expect(g.yearActions).toEqual({})
    expect(g.queue.some((m) => m.kind === 'notice' && m.text.includes('Not yet.'))).toBe(true)
  })

  it('refuses in prison and when dead, in the menu and in run', () => {
    const a = gig()
    g.character.prison = { ...PRISON }
    expect(a.disabledReason?.(g)).toMatch(/behind bars/)
    const cash = g.character.money
    a.run(g)
    expect(g.character.money).toBe(cash)
    g.character.prison = null
    g.character.alive = false
    expect(a.disabledReason?.(g)).toMatch(/no longer alive/)
    a.run(g)
    expect(g.character.money).toBe(cash)
  })

  it('applies once through useYearAction and emits a books audit', () => {
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const a = gig({ once: 'probe.work' })
    a.run(g)
    expect(g.character.money).toBe(101_000)
    expect(g.yearActions['probe.work']).toBe(1)
    a.run(g) // a stale row: refused, says so, moves nothing
    expect(g.character.money).toBe(101_000)
    expect(g.yearActions['probe.work']).toBe(1)
    expect(events.filter((e) => e.t === 'books')).toEqual([{ t: 'books', career: 'probe', where: 'probe.work', delta: 1000, booked: 1000, moves: 1 }])
    expect(checkLedger(events)).toEqual([])
    nextYear(g, () => {}) // a new year clears yearActions
    a.run(g)
    expect(g.character.money).toBe(102_000)
  })

  it('a refused gate does not use the once-a-year slot up', () => {
    let open = false
    const a = gig({ once: 'probe.work', gate: () => (open ? null : 'Not yet.') })
    a.run(g)
    expect(g.yearActions).toEqual({})
    open = true
    a.run(g)
    expect(g.character.money).toBe(101_000)
  })

  it('hands the body a fresh action budget, the input and the live record', () => {
    const seen: unknown[] = []
    const a = gig({
      input: { kind: 'number', label: 'How many?' },
      run: (c, input) => {
        seen.push(input, { ...c.budget }, Object.isFrozen(c.budget), c.career, c.s.stock)
        c.s.stock += 3
      },
    })
    a.run(g, '7')
    expect(seen).toEqual(['7', { choices: 3, notices: 6 }, false, 'probe', 0])
    expect(probeStore.view(g).stock).toBe(3)
    expect(probeStore.has(g)).toBe(true)
  })

  it('shows the subtitle, hint, confirm and input through view, without creating a record', () => {
    const a = gig({ subtitle: 'Costs a day', hint: (_g, s) => `Stock ${s.stock}`, confirm: () => 'Sure?', input: { kind: 'text', label: 'Client' } })
    expect(a.subtitle).toBe('Costs a day')
    expect(a.hint?.(g)).toBe('Stock 0')
    expect(a.confirm?.(g)).toBe('Sure?')
    expect(a.input?.label).toBe('Client')
    expect(probeStore.has(g)).toBe(false)
    const bare = gig()
    expect(bare.hint).toBeUndefined()
    expect(bare.confirm).toBeUndefined()
    expect(bare.input).toBeUndefined()
  })

  it('reads view only: render on a frozen state [RF5]', () => {
    probeYear(g)
    nextYear(g, () => {})
    probeYear(g)
    const a = gig({ subtitle: (_g) => 'Fees', hint: (_g, s) => `Stock ${s.stock}`, confirm: () => 'Sure?' })
    expect(() => assertMenuPure(g, () => [a, card()])).not.toThrow()
    const fresh = newProbeGame(6)
    expect(() => assertMenuPure(fresh, () => [a, card()])).not.toThrow()
    expect(probeStore.has(fresh)).toBe(false)
  })

  it('assertMenuPure catches a render that writes or draws', () => {
    const writes: MenuNode = { type: 'action', id: 'bad.write', label: 'Bad', emoji: 'x', disabledReason: (x) => { x.flags.touched = 1; return null }, run: () => {} }
    const mutates: MenuNode = { type: 'action', id: 'bad.mut', label: 'Bad', emoji: 'x', subtitle: (x) => { probeStore.mut(x); return '' }, run: () => {} }
    const draws: MenuNode = { type: 'action', id: 'bad.rng', label: 'Bad', emoji: 'x', hint: (x) => { x.rng = 1; return null }, run: () => {} }
    expect(() => assertMenuPure(g, () => [writes])).toThrow()
    expect(() => assertMenuPure(g, () => [mutates])).toThrow()
    expect(() => assertMenuPure(g, () => [draws])).toThrow()
  })
})

describe('report card', () => {
  let g: GameState
  beforeEach(() => {
    g = newProbeGame(5)
  })

  it('reportLines gives at most 3 lines of 90, no rank line for rank 0 of 0', () => {
    const row = { y: 2001, income: 158000, spent: 2000, rank: 14, of: 40, standing: 61, note: 'Kept a clean book.' }
    expect(reportLines(row, 'Bookings')).toEqual([`2001 Bookings ${money(158000)}, spent ${money(2000)}.`, 'Rank 14 of 40.', 'Kept a clean book.'])
    expect(reportLines({ ...row, rank: 0, of: 0 }, 'Bookings')).toEqual([`2001 Bookings ${money(158000)}, spent ${money(2000)}.`, 'Kept a clean book.'])
    expect(reportLines({ ...row, note: '' }, 'Bookings')).toHaveLength(2)
    for (const line of reportLines({ ...row, note: 'word '.repeat(60) }, 'Bookings')) expect(line.length).toBeLessThanOrEqual(90)
  })

  it('standingMenu shows the label, the last 5 years, top peers and rivals who remember you', () => {
    for (let i = 0; i < 7; i++) {
      probeYear(g)
      nextYear(g, () => {})
    }
    const s = probeStore.mut(g)
    s.memory = noteRival(s.memory, { id: 'probe.rival', name: 'Mia Okafor' }, g.year, { met: 2, won: 1, lost: 3, grudge: 12 })
    const m = card()
    const texts = infoTexts(g, m.children(g))
    const all = texts.join('\n')
    expect(all).toContain('Reputation')
    const rows = probeStore.view(g).rows
    expect(rows).toHaveLength(7)
    for (const row of rows.slice(-5)) for (const line of reportLines(row, 'Fees')) expect(texts).toContain(line)
    expect(all).not.toContain(reportLines(rows[1], 'Fees')[0]) // only the last 5 years
    const st = standingOf(g, probeSpec, s.standing, s.memory)
    expect(st.top.length).toBeGreaterThan(0)
    expect(all).toContain(st.top[0].name)
    expect(all).toContain('Mia Okafor')
    for (const t of texts) expect(t.length).toBeLessThanOrEqual(90)
    expect(BAD_TEXT.test(all)).toBe(false)
    const ids = m.children(g).map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(typeof m.subtitle === 'function' ? m.subtitle(g) : m.subtitle).toContain('Reputation')
  })

  it('survives a life with no record and a field that does not exist yet', () => {
    const before = JSON.stringify(g)
    expect(infoTexts(g, card().children(g)).join('\n')).toContain('Reputation')
    expect(JSON.stringify(g)).toBe(before)
    expect(probeStore.has(g)).toBe(false)
    probeYear(g)
    const none = standingMenu({ id: 'probe.none', label: 'Card', emoji: 'x', store: probeStore, standingLabel: 'Readiness', incomeLabel: 'Fees', peers: { spec: { ...probeSpec, field: () => 0 }, score: (_g, s) => s.standing } })
    const nodes = none.children(g)
    expect(infoTexts(g, nodes).join('\n')).toContain('Readiness')
    expect(nodes.map((n) => n.id)).not.toContain('probe.none.rank') // no field, no standing line and no peers list
    expect(nodes.map((n) => n.id)).not.toContain('probe.none.peers')
    expect(typeof none.subtitle === 'function' ? none.subtitle(g) : none.subtitle).not.toMatch(/rank/)
  })
})

describe('registry and wiring', () => {
  let g: GameState
  beforeEach(() => {
    g = makeTestGame(3, { age: 30 })
  })

  it('yearlyCareerSims runs in order and stops when the character dies', () => {
    const calls: string[] = []
    const sim = (id: string, f: (x: GameState) => void = () => {}): CareerSim => ({ id, key: `${id}.sim`, yearly: (x) => { calls.push(id); f(x) } })
    yearlyCareerSims(g, [sim('a', (x) => { x.character.alive = false }), sim('b')])
    expect(calls).toEqual(['a'])
    g.character.alive = true
    calls.length = 0
    yearlyCareerSims(g, [sim('x'), sim('y'), sim('z')])
    expect(calls).toEqual(['x', 'y', 'z'])
  })

  it('is a no-op with no sims', () => {
    const before = JSON.stringify(g)
    yearlyCareerSims(g, [])
    yearlyCareerSims(g)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('runs from yearlySpecial, after the legacy astronaut hook and before the hustler', () => {
    const calls: string[] = []
    const fake: CareerSim = { id: 'zz', key: 'zz.sim', yearly: () => { calls.push('zz') } }
    ;(CAREER_SIMS as CareerSim[]).push(fake)
    try {
      yearlySpecial(g)
    } finally {
      ;(CAREER_SIMS as CareerSim[]).splice((CAREER_SIMS as CareerSim[]).indexOf(fake), 1)
    }
    expect(calls).toEqual(['zz'])
    // R2-K10: the order is the registry's (special.ts used to say it in a table of tuples that this test read as text)
    const ids = yearlyEntries('special').map((e) => e.id)
    const at = ids.indexOf('special.astronaut')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(ids.slice(at, at + 3)).toEqual(['special.astronaut', 'special.careers2', 'special.hustler'])
  })
})

describe('playthrough kit, run on the probe career', () => {
  const work = gig({ once: 'probe.work' })
  const setup: CareerSetup = {
    defId: 'probe',
    stateKey: 'probe.sim',
    hire: (g) => {
      hire(g, { defId: 'probe', title: 'Prober', company: 'Probe Co', salary: 50_000 })
    },
    roots: () => [work, card()],
    prefer: { steady: /^probe\.work$/, greedy: /^probe\.work$/, reckless: /^probe\.work$/ },
  }
  const sim: CareerSim = { id: 'actor', key: 'probe.sim', yearly: probeYear }

  beforeAll(() => {
    CAREER_SETUPS.actor = setup
    ;(CAREER_SIMS as CareerSim[]).push(sim)
  })
  afterAll(() => {
    delete CAREER_SETUPS.actor
    ;(CAREER_SIMS as CareerSim[]).splice((CAREER_SIMS as CareerSim[]).indexOf(sim), 1)
  })
  afterEach(() => setCareerAudit(null))

  it('newCareerGame is a hired 24-year-old with 200,000, an empty queue and no prison, the same for one seed', () => {
    const g = newCareerGame('actor', 4, 'gb', 1980)
    expect([g.character.age, g.year, g.character.money, g.queue.length, g.character.prison, g.character.countryId]).toEqual([24, 1980, 200_000, 0, null, 'gb'])
    expect(g.character.job?.defId).toBe('probe')
    expect(JSON.stringify(newCareerGame('actor', 4, 'gb', 1980))).toBe(JSON.stringify(g))
    expect(newCareerGame('actor', 5).lifeId).not.toBe(newCareerGame('actor', 6).lifeId)
    // a career with no registered setup throws: model has one now, so take it out for the check
    const registered = CAREER_SETUPS.model
    delete CAREER_SETUPS.model
    try {
      expect(() => newCareerGame('model', 1)).toThrow(/model/)
    } finally {
      CAREER_SETUPS.model = registered
    }
  })

  it('nextYear bumps year and age, clears yearActions and then runs the hook', () => {
    const g = newCareerGame('actor', 4)
    g.yearActions = { x: 2 }
    const seen: number[] = []
    nextYear(g, (x) => { seen.push(x.year, x.character.age, Object.keys(x.yearActions).length) })
    expect(seen).toEqual([1996, 25, 0])
  })

  it('collectActions returns the enabled, visible actions of the roots, nested to the depth', () => {
    const g = newCareerGame('actor', 4)
    const hidden: MenuNode = { type: 'action', id: 'h', label: 'h', emoji: 'x', visible: () => false, run: () => {} }
    const off: MenuNode = { type: 'action', id: 'o', label: 'o', emoji: 'x', disabledReason: () => 'no', run: () => {} }
    const deep = (d: number): MenuNode => ({ type: 'menu', id: `m${d}`, label: 'm', emoji: 'x', children: () => (d === 0 ? [work] : [deep(d - 1)]) })
    expect(collectActions(g, [work, hidden, off]).map((a) => a.id)).toEqual(['probe.work'])
    expect(collectActions(g, [deep(2)]).map((a) => a.id)).toEqual(['probe.work'])
    expect(collectActions(g, [deep(5)], 3)).toEqual([])
    expect(collectActions(g, [card()])).toEqual([])
  })

  it('pickStance takes safe, cash or bold, else the first option', () => {
    const m = (...ids: string[]) => ({ kind: 'choice', id: 'm', title: 't', text: 'x', source: 'script', choices: ids.map((id) => ({ id, label: id })) }) as const
    expect(pickStance('steady', m('bold', 'safe', 'cash'))).toBe('safe')
    expect(pickStance('greedy', m('bold', 'safe', 'cash'))).toBe('cash')
    expect(pickStance('reckless', m('safe', 'cash', 'bold'))).toBe('bold')
    expect(pickStance('idle', m('cash', 'safe'))).toBe('cash')
    expect(pickStance('steady', m('accept', 'decline'))).toBe('accept')
    expect(pickStance('reckless', m('cash', 'safe'))).toBe('cash')
  })

  it('drainCareer answers career choices by stance and everything else with the first option', () => {
    const g = newCareerGame('actor', 4)
    const audit: AuditEvent[] = []
    setCareerAudit((e) => audit.push(e))
    const s = probeStore.mut(g)
    const c = careerCtx(g, 'probe', s)
    expect(offerChoice(c, 'career.probe.rush', 'Rush job', 'A client needs it by Friday. What will you do?', [{ id: 'bold', label: 'Take it' }, { id: 'safe', label: 'Say no' }], { id: 'rush', d: { fee: 5000 } })).toBe(true)
    scriptChoice(g, 'special.probe.plain', 'Plain', 'Pick one. What will you do?', [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }])
    const picked: string[] = []
    defineScript('special.probe.plain', (_g, choice) => { picked.push(choice) })
    g.queue.push({ kind: 'notice', id: 'n1', title: 'Heads up', text: 'The fee is NaN today.' })
    const sink: string[] = []
    const n = drainCareer(g, 'steady', sink, audit)
    expect(n).toBe(4) // 2 choices, the notice, and the notice the rush script added
    expect(picked).toEqual(['first'])
    expect(probeStore.view(g).stock).toBe(5) // the safe branch ran
    expect(g.queue).toEqual([])
    expect(sink.some((l) => /NaN/.test(l))).toBe(true) // the bad text was caught
    expect(sink.filter((l) => /ledger/.test(l))).toEqual([])
  })

  it('drainCareer flags a career script that moves cash outside the ledger', () => {
    const g = newCareerGame('actor', 4)
    const audit: AuditEvent[] = []
    setCareerAudit((e) => audit.push(e))
    defineScript('career.probe.leak', (x) => { x.character.money += 500 })
    scriptChoice(g, 'career.probe.leak', 'Leak', 'Go on. What will you do?', [{ id: 'go', label: 'Go' }])
    const sink: string[] = []
    drainCareer(g, 'idle', sink, audit)
    expect(sink.some((l) => /career\.probe\.leak/.test(l) && /ledger/.test(l))).toBe(true)
  })

  it('roundTrip is null for a fresh life and says what differs otherwise', () => {
    const g = newCareerGame('actor', 4)
    expect(roundTrip(g)).toBeNull()
    const loop: Record<string, unknown> = {}
    loop.self = loop
    g.flags.loop = loop as never // cannot be saved at all
    expect(roundTrip(g)).toMatch(/saveGame returned false/)
  })

  it('plays a probe career: purity, ledger, voice and saves are all checked and clean', () => {
    const rows: CareerStats[] = [playCareer('actor', 'steady', 3, 11, 'us', 1995, { saveEvery: 2 }), playCareer('actor', 'reckless', 3, 12), playCareer('actor', 'idle', 2, 13)]
    for (const r of rows) {
      expect(r.text).toEqual([])
      expect(r.checks.purity).toBe(r.years)
      expect(r.checks.ledger).toBe(r.years + r.actions) // once a year, and once for each action's dry run
      expect(r.checks.voice).toBe(r.years)
      expect(Number.isFinite(r.worthDelta)).toBe(true)
    }
    const [steady, , idle] = rows
    expect([steady.careerId, steady.strategy, steady.seed, steady.country, steady.year0]).toEqual(['actor', 'steady', 11, 'us', 1995])
    expect(steady.years).toBe(3)
    expect(steady.checks.saves).toBe(1)
    expect(steady.actions).toBeGreaterThan(0)
    expect(steady.income).toBeGreaterThanOrEqual(3 * 10_000) // the probe's yearly fees, plus gigs
    expect(steady.ended).toBe('active')
    expect(steady.standingEnd).toBeGreaterThan(5)
    expect(idle.actions).toBe(0)
    expect(JSON.stringify(playCareer('actor', 'steady', 3, 11, 'us', 1995, { saveEvery: 2 }))).toBe(JSON.stringify(steady)) // deterministic
    expect(() => assertCareersClean(rows)).not.toThrow()
    expect(summarizeCareers(rows)).toMatch(/actor\/steady/)
    expect(summarizeCareers(rows)).toMatch(/actor\/idle/)
  }, 120_000)

  it('assertCareersClean throws with the seed and the first problems', () => {
    const [clean] = [playCareer('actor', 'idle', 1, 21)]
    expect(() => assertCareersClean([{ ...clean, text: ['purity menu-throw: boom'] }])).toThrow(/idle seed 21.*boom/s)
  }, 60_000)
})
