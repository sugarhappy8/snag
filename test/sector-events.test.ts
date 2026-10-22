// The sector events engine: one table-driven event a company-year at most, the token that guards the
// script, hints that equal the resolver's own expectation, and the bounds every outcome must keep.
// Every test runs on a stub family (test/sector-kit.ts), so the real family events are not involved.
import { beforeEach, describe, expect, it } from 'vitest'
import { bizWorth, expectedFx, LASTING_YEARS, type BizFx } from '../src/game/business/economy'
import { businessEventInternals, maybeBusinessEvent } from '../src/game/business/events'
import { sectorEffects, sectorValue } from '../src/game/business/sector-core'
import {
  applySec, applySectorFx, choiceValue, eventProblems, maybeSectorEvent, SECTOR_EVENT_P, SECTOR_EVENT_SCRIPT,
} from '../src/game/business/sector-events'
import { registerFamily, sectorText, type Branch, type CopyTable, type SectorEvent } from '../src/game/business/sector-kit'
import { blankRecord, readSector, saveSector, type FoodState } from '../src/game/business/sector-state'
import type { BizState } from '../src/game/business/state'
import { nextRandom } from '../src/game/rng'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, ModalItem } from '../src/game/types'
import { deskGame, jail, playYear, stubModel } from './sector-kit'

const COPY: CopyTable = {
  'stub.ev.deal.head': 'A Rush Order',
  'stub.ev.deal.scene': 'A buyer wants a rush order by Friday. What will you do?',
  'stub.ev.deal.take.label': 'Take it',
  'stub.ev.deal.skip.label': 'Skip it',
  'stub.ev.deal.take.0.out': 'The order cost ${cost}. Hygiene rose.',
  'stub.ev.deal.skip.0.out': 'A smaller buyer paid you ${gain}.',
  'stub.ev.deal.skip.1.out': 'The buyer went elsewhere.',
  'stub.ev.ghost.head': 'Never Rolled',
  'stub.ev.ghost.scene': 'Nothing happens here. What will you do?',
}

/** Not a SectorChoice: a plain table row keeps the event definitions short. */
function choice(id: string, label: string, branches: Branch[]) {
  return { id, label, branches: () => branches }
}

const TAKE: Branch = { p: 1, fx: { cash: -1000, brand: 2 }, sec: { add: { hygiene: 5 } }, text: 'stub.ev.deal.take.0.out', vals: { cost: '$1,000' } }
const SKIP: Branch[] = [
  { p: .5, fx: { cash: 400 }, text: 'stub.ev.deal.skip.0.out', vals: { gain: '$400' } },
  { p: .5, fx: { demandTo: .95 }, text: 'stub.ev.deal.skip.1.out' },
]

const DEAL: SectorEvent = {
  id: 'deal', family: 'food', title: sectorText(COPY, 'stub.ev.deal.head'), emoji: '\u{1F4E6}',
  weight: () => 1,
  scene: () => sectorText(COPY, 'stub.ev.deal.scene'),
  choices: () => [choice('take', sectorText(COPY, 'stub.ev.deal.take.label'), [TAKE]), choice('skip', sectorText(COPY, 'stub.ev.deal.skip.label'), SKIP)],
}

const GHOST: SectorEvent = {
  id: 'ghost', family: 'food', title: sectorText(COPY, 'stub.ev.ghost.head'), emoji: '\u{1F47B}',
  weight: () => 0,
  scene: () => sectorText(COPY, 'stub.ev.ghost.scene'),
  choices: () => [choice('a', 'One', [{ p: 1, fx: {}, text: 'stub.ev.deal.skip.1.out' }]), choice('b', 'Two', [{ p: 1, fx: {}, text: 'stub.ev.deal.skip.1.out' }])],
}

/** A family whose year depends on hygiene, so a `sec` change has a price. */
function sensitiveModel(): void {
  registerFamily({
    family: 'food', copy: COPY,
    seed: (_g, _a, _b, since) => blankRecord('food', since),
    effects: (_g, _a, _b, st) => ({
      demand: st.family === 'food' ? 1 + (st.hygiene - 71) / 500 : 1, cost: 1, capLoss: 0, open: 1, income: 0, costs: 0, randIncome: 0, randCosts: 0, next: st, note: null,
    }),
    header: () => [],
    levers: [],
    events: [DEAL, GHOST],
  })
}

beforeEach(() => stubModel({ events: [DEAL, GHOST], copy: COPY }))

/** A record that is live (made two years back), so the event roll for last year is allowed. */
function liveRecord(g: GameState, b: BizState): FoodState {
  saveSector(b, blankRecord('food', g.year - 2))
  return readSector(b) as FoodState
}

/** An rng state whose first draw is below (or at least) the owner's event chance. */
function seedBelow(): number {
  for (let s = 1; ; s++) if (nextRandom(s)[0] < SECTOR_EVENT_P.owner) return s
}
function seedAbove(): number {
  for (let s = 1; ; s++) if (nextRandom(s)[0] >= SECTOR_EVENT_P.owner) return s
}

const NOTICE: ModalItem = { kind: 'notice', id: 'test', title: '', text: '' }
const run = (g: GameState, choiceId: string, data: unknown) => runScript(g, SECTOR_EVENT_SCRIPT, choiceId, data as never, NOTICE)

/** Fire one event now and return its popup. */
function fire(g: GameState, a: { id: string }, b: BizState): { modal: ChoiceModal; data: { assetId: string; token: string } } {
  g.rng = seedBelow()
  expect(maybeSectorEvent(g, a as never, b, g.year - 1, false)).toBe(true)
  const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === SECTOR_EVENT_SCRIPT)
  if (!modal) throw new Error('no sector popup')
  return { modal, data: modal.data as unknown as { assetId: string; token: string } }
}

describe('maybeSectorEvent', () => {
  it('rolls at most one event per company-year and none in the observation year', () => {
    let seen = 0
    for (const seed of [1, 2, 3]) {
      const { g } = deskGame('restaurant', { seed, talent: false })
      for (let i = 0; i < 12; i++) {
        const popups = playYear(g).filter((m) => m.scriptId === SECTOR_EVENT_SCRIPT)
        if (i === 0) expect(popups, `seed ${seed}: observation year`).toHaveLength(0)
        expect(popups.length, `seed ${seed}: year ${i}`).toBeLessThanOrEqual(1)
        seen += popups.length
      }
    }
    expect(seen).toBeGreaterThan(0)
  }, 120_000)

  it('uses g.rng exactly twice when it fires and once when it does not', () => {
    const fired = deskGame('restaurant')
    liveRecord(fired.g, fired.b)
    fired.g.rng = seedBelow()
    const start = fired.g.rng
    expect(maybeSectorEvent(fired.g, fired.a, fired.b, fired.g.year - 1, false)).toBe(true)
    expect(fired.g.rng).toBe(nextRandom(nextRandom(start)[1])[1])

    const quiet = deskGame('restaurant')
    liveRecord(quiet.g, quiet.b)
    quiet.g.rng = seedAbove()
    const first = quiet.g.rng
    expect(maybeSectorEvent(quiet.g, quiet.a, quiet.b, quiet.g.year - 1, false)).toBe(false)
    expect(quiet.g.rng).toBe(nextRandom(first)[1])
    expect(quiet.g.queue.filter((m) => m.kind === 'choice' && m.scriptId === SECTOR_EVENT_SCRIPT)).toHaveLength(0)
  })

  it('sets b.lastEvent, st.lastEvent and a token', () => {
    const { g, a, b } = deskGame('restaurant')
    liveRecord(g, b)
    const year = g.year - 1
    const { modal, data } = fire(g, a, b)
    const st = readSector(b) as FoodState
    expect(b.lastEvent).toBe(year)
    expect(st.lastEvent).toBe(year)
    expect(st.pending).toEqual({ token: data.token, id: 'deal', year: g.year })
    expect(data.assetId).toBe(a.id)
    expect(modal.title).toBe('A Rush Order')
    expect(modal.text.endsWith('What will you do?')).toBe(true)
    expect(modal.choices.map((c) => c.id)).toEqual(['take', 'skip'])
    // One event a year: the same year does not roll again.
    g.rng = seedBelow()
    expect(maybeSectorEvent(g, a, b, year, false)).toBe(false)
  })

  it('stays out of the observation year, a dead or imprisoned owner and a foreign record', () => {
    const obs = deskGame('restaurant')
    saveSector(obs.b, blankRecord('food', obs.g.year - 1))
    obs.g.rng = seedBelow()
    expect(maybeSectorEvent(obs.g, obs.a, obs.b, obs.g.year - 1, false)).toBe(false)

    const none = deskGame('restaurant')
    none.g.rng = seedBelow()
    expect(maybeSectorEvent(none.g, none.a, none.b, none.g.year - 1, false)).toBe(false)

    const cell = deskGame('restaurant')
    liveRecord(cell.g, cell.b)
    jail(cell.g)
    cell.g.rng = seedBelow()
    expect(maybeSectorEvent(cell.g, cell.a, cell.b, cell.g.year - 1, false)).toBe(false)

    const dead = deskGame('restaurant')
    liveRecord(dead.g, dead.b)
    dead.g.character.alive = false
    dead.g.rng = seedBelow()
    expect(maybeSectorEvent(dead.g, dead.a, dead.b, dead.g.year - 1, false)).toBe(false)

    const foreign = deskGame('restaurant')
    foreign.b.sector = { v: 2 }
    foreign.g.rng = seedBelow()
    expect(maybeSectorEvent(foreign.g, foreign.a, foreign.b, foreign.g.year - 1, false)).toBe(false)
    expect(foreign.b.sector).toEqual({ v: 2 })
  })

  it('drops an old pending event with a diary line', () => {
    const { g, a, b } = deskGame('restaurant')
    const st = liveRecord(g, b)
    st.pending = { token: 'old1', id: 'deal', year: g.year - 1 }
    saveSector(b, st)
    g.rng = seedAbove()
    maybeSectorEvent(g, a, b, g.year - 1, false)
    const after = readSector(b) as FoodState
    expect(after.pending).toBeNull()
    expect(after.diary.length).toBe(1)
  })
})

describe('the sector.event script', () => {
  it('forged, replayed and expired tokens do nothing', () => {
    const { g, a, b } = deskGame('restaurant')
    liveRecord(g, b)
    const { data } = fire(g, a, b)
    const before = JSON.stringify(g)
    run(g, 'take', { assetId: a.id, token: 'forged' })
    expect(JSON.stringify(g)).toBe(before)
    run(g, 'take', { assetId: 'nobody', token: data.token })
    expect(JSON.stringify(g)).toBe(before)
    run(g, 'bogus', data)
    expect(JSON.stringify(g)).toBe(before)
    run(g, 'take', undefined)
    expect(JSON.stringify(g)).toBe(before)

    const cash = b.cash
    const costs = b.yearCosts
    run(g, 'take', data)
    expect(b.cash).toBe(cash - 1000)
    expect(b.yearCosts).toBe(costs + 1000)
    const st = readSector(b) as FoodState
    expect(st.pending).toBeNull()
    expect(st.hygiene).toBe(76)
    expect(st.diary.at(-1)).toBe(`${g.year} A Rush Order. Take it.`)
    const notices = g.queue.filter((m) => m.kind === 'notice' && m.title === 'A Rush Order')
    expect(notices).toHaveLength(1)
    expect(notices[0].kind === 'notice' && notices[0].text).toBe('The order cost $1,000. Hygiene rose.')

    const after = JSON.stringify(g)
    run(g, 'take', data)
    expect(JSON.stringify(g), 'a replay').toBe(after)
    expect(b.cash).toBe(cash - 1000)

    const late = deskGame('restaurant')
    liveRecord(late.g, late.b)
    const old = fire(late.g, late.a, late.b)
    late.g.year += 1
    const snap = JSON.stringify(late.g)
    run(late.g, 'take', old.data)
    expect(JSON.stringify(late.g), 'expired').toBe(snap)
  })

  it('refuses a blocked owner', () => {
    const cases: [string, (g: GameState, a: { id: string }) => void][] = [
      ['jail', (g) => jail(g)],
      ['under age', (g) => { g.character.age = 17 }],
      ['sold', (g, a) => { g.assets = g.assets.filter((x) => x.id !== a.id) }],
    ]
    for (const [name, block] of cases) {
      const { g, a, b } = deskGame('restaurant')
      liveRecord(g, b)
      const { data } = fire(g, a, b)
      block(g, a)
      const cash = b.cash
      const sector = JSON.stringify(b.sector)
      run(g, 'take', data)
      expect(b.cash, name).toBe(cash)
      expect(JSON.stringify(b.sector), name).toBe(sector)
      expect((b.sector as { pending: unknown }).pending, name).not.toBeNull()
    }
  })

  it('rolls the branches of a choice with one draw', () => {
    const { g, a, b } = deskGame('restaurant')
    liveRecord(g, b)
    const { data } = fire(g, a, b)
    const before = g.rng
    run(g, 'skip', data)
    expect(g.rng).toBe(nextRandom(before)[1])
    const outcomes = g.queue.filter((m) => m.kind === 'notice' && m.title === 'A Rush Order')
    expect(outcomes).toHaveLength(1)
  })
})

describe('hints and bounds', () => {
  it('the best-choice hint equals the resolver’s own expectation', () => {
    sensitiveModel()
    const { g, a, b } = deskGame('restaurant')
    const st = liveRecord(g, b)
    const { modal } = fire(g, a, b)
    const hinted = modal.choices.filter((c) => c.hint)
    expect(hinted).toHaveLength(1)
    const values = Object.fromEntries(modal.choices.map((c) => [c.id, choiceValue(g, a, b, st, DEAL, c.id)]))
    const best = Object.entries(values).sort((x, y) => y[1] - x[1])[0][0]
    expect(hinted[0].id).toBe(best)

    const w = bizWorth(g, b)
    // A choice with no sec change is exactly expectedFx of the same branches.
    expect(values.skip).toBeCloseTo(expectedFx(g, b, w, SKIP), 6)
    // A sec change adds LASTING_YEARS times the change in the year's value.
    const year = g.year
    const before = sectorValue(g, b, w, sectorEffects(g, a, b, st, year, 'expected'))
    const after = sectorValue(g, b, w, sectorEffects(g, a, b, applySec(st, TAKE.sec), year, 'expected'))
    const plain = expectedFx(g, b, w, [TAKE])
    expect(values.take).toBeCloseTo(plain + LASTING_YEARS * (after - before), 6)
    expect(after).toBeGreaterThan(before)
    expect(values.take).toBeGreaterThan(plain)
  })

  it('no hint without the Business talent', () => {
    sensitiveModel()
    const { g, a, b } = deskGame('restaurant', { talent: false })
    liveRecord(g, b)
    const { modal } = fire(g, a, b)
    expect(modal.choices.every((c) => !c.hint)).toBe(true)
  })

  it('branch probabilities sum to 1', () => {
    const { g, a, b } = deskGame('restaurant')
    const st = liveRecord(g, b)
    expect(eventProblems(DEAL, g, a, b, st)).toEqual([])
    expect(eventProblems(GHOST, g, a, b, st)).toEqual([])
    const broken: SectorEvent = {
      ...DEAL, id: 'broken', scene: () => 'A thing happens.',
      choices: () => [
        choice('a', 'One two three four five six', [{ p: .9, fx: {}, text: 'stub.ev.deal.skip.1.out' }]),
        choice('b', 'Fine', [{ p: 1, fx: {}, sec: { add: { nope: 1 } }, text: 'stub.ev.deal.skip.1.out' }]),
        choice('c', 'Odd', [{ p: 1.5, fx: {}, text: 'stub.ev.deal.skip.1.out' }, { p: -.5, fx: {}, text: 'missing.key' }]),
      ],
    }
    const problems = eventProblems(broken, g, a, b, st).join('\n')
    expect(problems).toMatch(/odds sum/)
    expect(problems).toMatch(/sec key/)
    expect(problems).toMatch(/scene/)
    expect(problems).toMatch(/label/)
    expect(problems).toMatch(/outside 0 to 1/)
    expect(problems).toMatch(/text key/)
    const single: SectorEvent = { ...DEAL, id: 'single', choices: () => [choice('only', 'Only', [{ p: 1, fx: {}, text: 'stub.ev.deal.skip.1.out' }])] }
    expect(eventProblems(single, g, a, b, st).join('\n')).toMatch(/choices/)
  })

  it('event outcomes are bounded', () => {
    const { g, a, b } = deskGame('restaurant')
    const st = liveRecord(g, b)
    const withFx = (fx: BizFx): SectorEvent => ({
      ...DEAL, id: 'bounded',
      choices: () => [choice('ok', 'Fine', [{ p: 1, fx: {}, text: 'stub.ev.deal.skip.1.out' }]), choice('bad', 'Odd', [{ p: 1, fx, text: 'stub.ev.deal.skip.1.out' }])],
    })
    const cases: [BizFx, RegExp][] = [
      [{ cash: 1e9 }, /cash.*bounds/],
      [{ cash: -1e9 }, /cash.*bounds/],
      [{ brand: 40 }, /brand.*bounds/],
      [{ quality: -13 }, /quality.*bounds/],
      [{ morale: 13 }, /morale.*bounds/],
      [{ payroll: 5000 }, /fx key payroll/],
      [{ wage: .2 }, /wage.*bounds/],
      [{ demandTo: .5 }, /demandTo.*bounds/],
      [{ demandTo: 1.3 }, /demandTo.*bounds/],
      [{ capacityTo: .5 }, /capacityTo.*bounds/],
      [{ costTo: 1.5 }, /costTo.*bounds/],
      [{ cash: Number.NaN }, /finite/],
    ]
    for (const [fx, pattern] of cases) expect(eventProblems(withFx(fx), g, a, b, st).join('\n'), JSON.stringify(fx)).toMatch(pattern)
    const fine: BizFx = { cash: -1000, brand: 12, quality: -12, morale: 12, wage: .08, demandTo: .85, capacityTo: .35, costTo: 1.12 }
    expect(eventProblems(withFx(fine), g, a, b, st)).toEqual([])
  })

  it('event load at most .45', () => {
    expect(SECTOR_EVENT_P.owner + (1 - SECTOR_EVENT_P.owner) * .3).toBeLessThanOrEqual(.45)
    expect(SECTOR_EVENT_P.managed + (1 - SECTOR_EVENT_P.managed) * .18).toBeLessThanOrEqual(.45)
    const { g, a, b } = deskGame('restaurant', { talent: false })
    saveSector(b, blankRecord('food', g.year - 1))
    let fired = 0
    for (let i = 0; i < 1000; i++) {
      g.year += 1
      g.queue = []
      // A new year empties the year's actions, as ageUp does (aging.ts): the company-choice ledger of the pace rule (pace.biz) is one of them.
      g.yearActions = {}
      const fiscal = g.year - 1
      if (maybeSectorEvent(g, a, b, fiscal, false) || maybeBusinessEvent(g, a, b, fiscal, false)) fired++
    }
    expect(fired / 1000).toBeLessThanOrEqual(.48)
    expect(fired / 1000).toBeGreaterThan(.2)
  }, 60_000)
})

describe('the generic events the family replaces', () => {
  it('the generic inspection and critic are off for food with a live record', () => {
    const { g, b } = deskGame('restaurant')
    expect(businessEventInternals.possible(g, b)).toEqual(expect.arrayContaining(['inspection', 'critic']))
    // The observation year books as v3.0.0 did: both stay.
    saveSector(b, blankRecord('food', 2020))
    expect(businessEventInternals.possible(g, b)).toEqual(expect.arrayContaining(['inspection', 'critic']))
    // A live record uses the family's own versions.
    saveSector(b, { ...blankRecord('food', 2020), lastYear: 2022 })
    const live = businessEventInternals.possible(g, b)
    expect(live).not.toContain('inspection')
    expect(live).not.toContain('critic')
    // A newer-version record is never read: the generic events stay.
    b.sector = { v: 2 }
    expect(businessEventInternals.possible(g, b)).toEqual(expect.arrayContaining(['inspection', 'critic']))
    const bar = deskGame('bar')
    expect(businessEventInternals.possible(bar.g, bar.b)).toContain('inspection')
  })
})

describe('applySec and applySectorFx', () => {
  it('applySec changes only the family’s own keys and clamps', () => {
    const st = blankRecord('food', 2020) as FoodState
    const frozen = JSON.stringify(st)
    const next = applySec(st, { add: { hygiene: 50, rating: -9, loyal: 3, since: 5 }, set: { menu: 2, channel: 7, plans: .6 } }) as FoodState
    expect(JSON.stringify(st)).toBe(frozen)
    expect(next).not.toBe(st)
    expect(next.hygiene).toBe(100)
    expect(next.rating).toBe(1)
    expect(next.menu).toBe(2)
    expect(next.channel).toBe(2)
    expect(next.since).toBe(2020)
    expect('loyal' in next).toBe(false)
    expect('plans' in next).toBe(false)
    expect(applySec(st, undefined)).toEqual(st)
  })

  it('applySectorFx books cash once and moves the channels the way fxValue prices them', () => {
    const { g, b } = deskGame('restaurant')
    const st = liveRecord(g, b)
    const cash = b.cash
    const income = b.yearIncome
    const costs = b.yearCosts
    const brand = b.brand
    const wage = b.wageLevel
    b.demandShock = 1
    b.capacityLoss = 0
    b.costShock = 1
    applySectorFx(g, b, st, { cash: 500, brand: 10, quality: -5, morale: 200, wage: .05, demandTo: .9, capacityTo: .2, costTo: 1.05 })
    expect(b.cash).toBe(cash + 500)
    expect(b.yearIncome).toBe(income + 500)
    expect(b.yearCosts).toBe(costs)
    expect(b.brand).toBe(Math.min(100, brand + 10))
    expect(b.morale).toBe(100)
    expect(b.wageLevel).toBe(Math.round((wage + .05) * 100) / 100)
    expect(b.demandShock).toBe(.9)
    expect(b.capacityLoss).toBe(.2)
    expect(b.costShock).toBe(1.05)
    applySectorFx(g, b, st, { cash: -700, demandTo: 1.1 })
    expect(b.cash).toBe(cash + 500 - 700)
    expect(b.yearCosts).toBe(costs + 700)
    expect(b.demandShock).toBe(1.1)
  })
})
