import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, readBiz } from '../src/game/business/state'
import { availableStudioEngines, engineIpValue, ENGINE_TIERS, normalizeEngines, studioEngineDef, type StudioEngine } from '../src/game/business/gamestudio-engine-state'
import { engineDevelopmentBlock, sellStudioEngine, simulateStudioEngines, startStudioEngine, studioEngineMenu } from '../src/game/business/gamestudio-engines'
import { assignedDevs, normalizeStudio, studioValue, type StudioState } from '../src/game/business/gamestudio-state'
import { saveStudio, simulateStudioYear, startGreenlight, studioInternals, studioManagerTurn, studioNodes, studioOf } from '../src/game/business/gamestudio'
import { runScript } from '../src/game/scripts'
import { neutralAmbition } from './effort-parity-kit'
import type { Asset, GameState, Json, MenuAction, MenuNode, ModalItem } from '../src/game/types'

function studio(seed = 937, countryId = 'us') {
  const g = makeTestGame(seed, { age: 35, money: 10_000_000, countryId })
  const a = createBusinessAsset(g, 'Aurora Games', newBiz(g, 'gameStudio', countryId, 'Chicago', {
    cash: 100_000_000, employees: 60, quality: 90, brand: 80,
  }), 1_000_000)
  g.assets.push(a)
  return { g, a, b: bizOf(g, a) }
}

const operation = { employees: 60, wage: 50_000, quality: 90, leadership: 90, brand: 80, operations: 1, open: 1, market: 1 }

function engine(overrides: Partial<StudioEngine> = {}): StudioEngine {
  return {
    id: 'engine1', name: 'Aurora Engine', tier: 'professional', stage: 'ready', progress: 100,
    quality: 90, team: 0, started: 2020, released: 2022, spent: 1_000_000, terms: 'private',
    licenses: [], licenseSeq: 0, lastYear: 2022, lastRevenue: 0, earned: 0, soldFor: 0, ...overrides,
  }
}

function withEngine(a: Asset, e = engine()): StudioState {
  const st = studioOf(a)
  st.engines.push(e)
  st.engineSeq = 1
  saveStudio(a, st)
  return st
}

function action(g: GameState, a: Asset, id: string): MenuAction {
  const search = (nodes: MenuNode[]): MenuAction | undefined => {
    for (const n of nodes) {
      if (n.id === id && n.type === 'action') return n
      if (n.type === 'menu') {
        const hit = search(n.children(g))
        if (hit) return hit
      }
    }
  }
  const found = search(studioNodes(g, a))
  if (!found) throw new Error(`Missing action ${id}`)
  return found
}

function choice(g: GameState, id: string) {
  const m = g.queue.shift()!
  if (m.kind !== 'choice' || !m.choices.some((x) => x.id === id)) throw new Error(`Missing choice ${id}`)
  runScript(g, m.scriptId!, id, m.data, m)
}

describe('studio engine development', () => {
  it('repairs duplicate game ids and advances the sequence past recovered saves', () => {
    const { g } = studio()
    const st = normalizeStudio(undefined)
    const game = studioInternals.addGame(st, g, { scope: 'small', genre: 'rpg', platform: 'pc', engine: 'cobalt', title: 'Original', team: 2, franchise: '', sequelOf: '' })
    const recovered = normalizeStudio({
      ...st,
      seq: 0,
      games: [{ ...game, started: 2020.6, released: 2022.6, lastDlc: 2023.6 }, { ...game, title: 'Duplicate' }],
    } as unknown as Json)
    expect(recovered.games).toHaveLength(1)
    expect(recovered.games[0]).toMatchObject({ id: 'sg1', title: 'Original', started: 2021, released: 2023, lastDlc: 2024 })
    expect(recovered.seq).toBe(1)
  })

  it('rebases an unsafe recovered game sequence without reusing its id', () => {
    const { g } = studio()
    const st = normalizeStudio(undefined)
    const old = studioInternals.addGame(st, g, { scope: 'small', genre: 'rpg', platform: 'pc', engine: 'cobalt', title: 'Recovered', team: 2, franchise: '', sequelOf: '' })
    const unsafe = Number.MAX_SAFE_INTEGER + 1
    const recovered = normalizeStudio({ ...st, seq: unsafe, games: [{ ...old, id: `sg${unsafe}` }] } as unknown as Json)
    const next = studioInternals.addGame(recovered, g, { scope: 'small', genre: 'rpg', platform: 'pc', engine: 'cobalt', title: 'Next', team: 2, franchise: '', sequelOf: '' })
    expect(Number.isSafeInteger(recovered.seq)).toBe(true)
    expect(next.id).not.toBe(`sg${unsafe}`)
    expect(new Set(recovered.games.map((game) => game.id)).size).toBe(2)
  })

  it('makes greenlight and studio-event scripts one-shot and rejects unknown choices', () => {
    const { g, a } = studio()
    const greenlight = {
      assetId: a.id, token: 'pitch-once', scope: 'small', genre: 'rpg', platform: 'pc', engine: 'cobalt',
      franchise: '', sequelOf: '', title: '',
    } as unknown as Json
    const input = { kind: 'input', id: 'greenlight', title: '', text: '', input: 'text', scriptId: 'gamestudio.gl.name' } as ModalItem
    runScript(g, 'gamestudio.gl.name', 'Replay Proof', greenlight, input)
    runScript(g, 'gamestudio.gl.name', 'Replay Proof', greenlight, input)
    expect(studioOf(a).games.map((x) => x.title)).toEqual(['Replay Proof'])

    const st = studioOf(a)
    st.games[0].stage = 'live'
    st.games[0].released = g.year
    st.games[0].tail = 100
    saveStudio(a, st)
    const event = { assetId: a.id, ev: 'streamer', gameId: st.games[0].id, token: 'event-once' } as unknown as Json
    const choice = {
      kind: 'choice', source: 'script', id: 'event', title: '', text: '',
      choices: [{ id: 'sponsor', label: 'Sponsor' }, { id: 'thank', label: 'Thank' }], scriptId: 'gamestudio.event',
    } as ModalItem
    runScript(g, 'gamestudio.event', 'unknown', event, choice)
    expect(studioOf(a).games[0].tail).toBe(100)
    runScript(g, 'gamestudio.event', 'thank', event, choice)
    runScript(g, 'gamestudio.event', 'thank', event, choice)
    expect(studioOf(a).games[0].tail).toBe(125)

    const forgedEvent = { assetId: a.id, ev: 'toString', gameId: st.games[0].id, token: 'prototype-event' } as Json
    expect(() => runScript(g, 'gamestudio.event', 'thank', forgedEvent, { ...choice, id: 'prototype-event' })).not.toThrow()
    expect(studioOf(a).games[0].tail).toBe(125)
  })

  it('rechecks live game state before stale crowdfunding and DLC actions spend or create money', () => {
    const { g, a, b } = studio()
    const st = studioOf(a)
    const game = studioInternals.addGame(st, g, { scope: 'small', genre: 'rpg', platform: 'pc', engine: 'cobalt', title: 'State Check', team: 2, franchise: '', sequelOf: '' })
    game.progress = 20
    saveStudio(a, st)
    const crowd = action(g, a, `studio.crowd.${game.id}.${a.id}`)

    let live = studioOf(a)
    live.games[0].stage = 'live'
    live.games[0].released = g.year
    saveStudio(a, live)
    const beforeCrowd = { cash: b.cash, income: b.yearIncome, rng: g.rng }
    crowd.run(g)
    expect({ cash: b.cash, income: b.yearIncome, rng: g.rng }).toEqual(beforeCrowd)
    expect(studioOf(a).games[0].raised).toBe(0)

    g.year += 2
    live = studioOf(a)
    live.games[0].released = g.year - 2
    live.games[0].dlcs = 7
    saveStudio(a, live)
    const dlc = action(g, a, `studio.dlc.${game.id}.${a.id}`)
    live = studioOf(a)
    live.games[0].dlcs = 8
    saveStudio(a, live)
    const beforeDlc = { cash: b.cash, costs: b.yearCosts, rng: g.rng }
    dlc.run(g)
    expect({ cash: b.cash, costs: b.yearCosts, rng: g.rng }).toEqual(beforeDlc)
    expect(studioOf(a).games[0].dlcs).toBe(8)
  })

  it.each(ENGINE_TIERS)('builds a $label over $years staffed years, then releases developers', tier => {
    const { g, a, b } = studio()
    const cash = b.cash, personal = g.character.money
    startStudioEngine(g, a.id, tier.id, '  Aurora <Engine>  ')
    let st = studioOf(a)
    expect(st.engines[0].name).toBe('Aurora Engine')
    expect(b.cash).toBe(cash - tier.setup)
    expect(b.yearCosts).toBe(tier.setup)
    expect(g.character.money).toBe(personal)
    expect(assignedDevs(st)).toBe(tier.team)
    let costs = 0
    for (let y = 0; y < tier.years; y++) {
      const result = simulateStudioEngines(g, st, g.year + y, operation)
      costs += result.costs
      expect(result.revenue).toBe(0)
      if (y < tier.years - 1) expect(st.engines[0].stage).toBe('dev')
    }
    expect(costs).toBe(tier.research * tier.years)
    expect(st.engines[0].stage).toBe('ready')
    expect(st.engines[0].progress).toBe(100)
    expect(st.engines[0].spent).toBe(tier.setup + (tier.team * operation.wage + tier.research) * tier.years)
    expect(assignedDevs(st)).toBe(0)
    saveStudio(a, st)
    st = studioOf(a)
    expect(availableStudioEngines(st.engines, tier.maxScope)).toEqual(['engine1'])
  })

  it.each(ENGINE_TIERS)('never resells a freshly built, unlicensed $label for more than it cost', tier => {
    const { g, a, b } = studio()
    startStudioEngine(g, a.id, tier.id, 'Flip Engine')
    const st = studioOf(a)
    for (let y = 0; y < tier.years; y++) simulateStudioEngines(g, st, g.year + y, operation)
    const built = st.engines[0]
    expect(built.stage).toBe('ready'); expect(built.quality).toBeGreaterThanOrEqual(90)
    saveStudio(a, st)
    const cash = b.cash
    g.year = built.released
    sellStudioEngine(g, a.id, built.id)
    expect(studioOf(a).engines[0].stage).toBe('sold')
    // Everything spent (tools, R&D and the developers' payroll) is more than an unproven engine fetches.
    expect(b.cash - cash).toBeGreaterThan(0)
    expect(b.cash - cash).toBeLessThan(built.spent)
  })

  it('values proven licensing income on top of the technology, and old engines less', () => {
    const fresh = engine({ quality: 98, released: 2026, lastYear: 2026 })
    const proven = engine({ quality: 98, released: 2026, lastYear: 2026, lastRevenue: 400_000 })
    expect(engineIpValue(fresh, 2026)).toBeLessThan(fresh.spent)
    expect(engineIpValue(proven, 2026)).toBe(engineIpValue(fresh, 2026) + 1_200_000)
    expect(engineIpValue(fresh, 2032)).toBeLessThan(engineIpValue(fresh, 2026))
    expect(engineIpValue(engine({ quality: 50, released: 2026 }), 2026)).toBeLessThan(engineIpValue(fresh, 2026))
  })

  it('shares developers with game projects rather than creating extra workers', () => {
    const { g, a } = studio()
    const st = withEngine(a, engine({ stage: 'dev', progress: 0, team: 12, started: g.year, lastYear: 0 }))
    studioInternals.addGame(st, g, { scope: 'indie', genre: 'rpg', platform: 'pc', engine: 'cobalt', title: 'A Game', team: 12, franchise: '', sequelOf: '' })
    expect(assignedDevs(st)).toBe(24)
    const result = simulateStudioEngines(g, st, g.year, { ...operation, employees: 12 })
    expect(st.engines[0].progress).toBeCloseTo(50 * Math.pow(.5, .8))
    expect(result.costs).toBe(30_000)
  })

  it('keeps game and engine teams sharing labor for the whole fiscal year, including an engine launch', () => {
    const { g, a, b } = studio()
    b.employees = 2
    const st = withEngine(a, engine({ stage: 'dev', tier: 'indie', progress: 99, team: 2, started: g.year, lastYear: 0 }))
    studioInternals.addGame(st, g, { scope: 'indie', genre: 'rpg', platform: 'pc', engine: 'cobalt', title: 'Shared Team', team: 2, franchise: '', sequelOf: '' })
    saveStudio(a, st)
    const baselineG = structuredClone(g), baselineA = baselineG.assets[0]
    const baselineSt = studioOf(baselineA)
    baselineSt.engines = []
    saveStudio(baselineA, baselineSt)
    simulateStudioYear(g, a, b, g.year, 0)
    simulateStudioYear(baselineG, baselineA, bizOf(baselineG, baselineA), baselineG.year, 0)
    expect(studioOf(a).engines[0].stage).toBe('ready')
    expect(studioOf(a).games[0].progress).toBeCloseTo(studioOf(baselineA).games[0].progress * Math.pow(.5, .8))
    expect(studioOf(a).games[0].progress).toBeLessThan(studioOf(baselineA).games[0].progress)
  })

  it('reports a busy studio rather than an idle team while an engine is still being developed', () => {
    const { g, a, b } = studio()
    startStudioEngine(g, a.id, 'flagship', 'Long Project')
    simulateStudioYear(g, a, b, g.year, 0)
    expect(studioOf(a).engines[0].stage).toBe('dev')
    expect(studioOf(a).report?.idle).toBe(false)
  })

  it('does not progress before founding, twice in a fiscal year, while paused, or while closed', () => {
    const { g, a } = studio()
    const st = withEngine(a, engine({ stage: 'dev', progress: 0, team: 12, started: g.year, lastYear: 0 }))
    expect(simulateStudioEngines(g, st, g.year - 1, operation).costs).toBe(0)
    simulateStudioEngines(g, st, g.year, operation)
    const snapshot = structuredClone(st)
    expect(simulateStudioEngines(g, st, g.year, operation)).toEqual({ revenue: 0, costs: 0, notes: [] })
    expect(st).toEqual(snapshot)
    st.engines[0].team = 0
    expect(simulateStudioEngines(g, st, g.year + 1, operation).costs).toBe(0)
    expect(st.engines[0].progress).toBe(50)
    st.engines[0].team = 12
    expect(simulateStudioEngines(g, st, g.year + 2, { ...operation, open: 0 }).costs).toBe(0)
    expect(st.engines[0].progress).toBe(50)
  })

  it('rejects insufficient cash, insufficient free staff, empty names, and duplicate names without charges', () => {
    const { g, a, b } = studio()
    b.cash = 24_999
    startStudioEngine(g, a.id, 'indie', 'No Cash')
    expect(studioOf(a).engines).toHaveLength(0)
    b.cash = 1_000_000
    b.employees = 1
    expect(engineDevelopmentBlock(g, a, 'indie')).toContain('unassigned developers')
    startStudioEngine(g, a.id, 'indie', 'No Team')
    b.employees = 2
    startStudioEngine(g, a.id, 'indie', '<>   ')
    expect(studioOf(a).engines).toHaveLength(0)
    startStudioEngine(g, a.id, 'indie', 'Aurora')
    b.employees = 10
    const cash = b.cash
    startStudioEngine(g, a.id, 'indie', 'aurora')
    expect(studioOf(a).engines).toHaveLength(1)
    expect(b.cash).toBe(cash)
  })

  it('pauses, resumes and cancels from the real menu without refunds', () => {
    const { g, a, b } = studio()
    action(g, a, `studio.engine.start.indie.${a.id}`).run(g, 'Aurora')
    const team = action(g, a, `studio.engine.team.engine1.${a.id}`)
    team.run(g, '0')
    expect(studioOf(a).engines[0].team).toBe(0)
    team.run(g, 'not a number')
    expect(studioOf(a).engines[0].team).toBe(0)
    team.run(g, '2')
    expect(studioOf(a).engines[0].team).toBe(2)
    const cash = b.cash
    const cancel = action(g, a, `studio.engine.cancel.engine1.${a.id}`)
    expect(cancel.confirm?.(g)).toContain('not refunded')
    cancel.run(g)
    expect(studioOf(a).engines).toHaveLength(0)
    expect(b.cash).toBe(cash)
    startStudioEngine(g, a.id, 'indie', 'Aurora 2')
    expect(studioOf(a).engines[0].id).toBe('engine2')
  })

  it('revalidates ownership, life, age, prison, and business industry at execution time', () => {
    for (const block of ['sold', 'dead', 'young', 'prison', 'other industry']) {
      const { g, a, b } = studio()
      const start = action(g, a, `studio.engine.start.indie.${a.id}`)
      if (block === 'sold') g.assets = []
      if (block === 'dead') g.character.alive = false
      if (block === 'young') g.character.age = 17
      if (block === 'prison') g.character.prison = {} as never
      if (block === 'other industry') b.industry = 'solar'
      const cash = b.cash
      start.run(g, 'Forbidden')
      expect(studioOf(a).engines).toHaveLength(0)
      expect(b.cash).toBe(cash)
    }
  })
})

describe('engine use and ownership', () => {
  it('offers finished engines in greenlighting, saves them, and launches games using their capabilities', () => {
    const { g, a, b } = studio()
    const st = withEngine(a)
    expect(studioEngineDef(st.engines, 'engine1').royalty).toBe(0)
    expect(studioEngineDef(st.engines, 'engine1').speed).toBeGreaterThan(studioEngineDef(st.engines, 'cobalt').speed)
    startGreenlight(g, a.id, { genre: 'rpg', sequelOf: 'old', franchise: 'Test' })
    choice(g, 'small')
    choice(g, 'pc')
    choice(g, 'engine1')
    const name = g.queue.shift()!
    expect(name.kind).toBe('input')
    if (name.kind !== 'input') throw new Error('No name input')
    expect(name.text).toContain('Aurora Engine')
    runScript(g, name.scriptId, 'Engine Showcase', name.data, name)
    expect(studioOf(a).games[0].engine).toBe('engine1')
    simulateStudioYear(g, a, b, g.year, 0)
    expect(studioOf(a).games[0].stage).toBe('live')
    expect(studioOf(a).games[0].engine).toBe('engine1')
  })

  it('does not offer unfinished, sold, another company’s, or undersized engines', () => {
    const engines = [engine({ id: 'engine1', stage: 'dev' }), engine({ id: 'engine2', stage: 'sold' }), engine({ id: 'engine3', tier: 'indie' })]
    expect(availableStudioEngines(engines, 4)).toEqual([])
    expect(availableStudioEngines(engines, 2)).toEqual(['engine3'])
    const { g, a } = studio()
    withEngine(a)
    const sister = createBusinessAsset(g, 'Sister Studio', newBiz(g, 'gameStudio', 'us', 'Chicago', { cash: 10e6, employees: 10 }), 0)
    g.assets.push(sister)
    startGreenlight(g, sister.id, { genre: 'rpg', sequelOf: 'old' })
    choice(g, 'small')
    choice(g, 'pc')
    const m = g.queue[0]
    expect(m.kind === 'choice' && m.choices.some((x) => x.id === 'engine1')).toBe(false)
  })

  it('rejects stale engine choices and a sale between choosing an engine and naming a game', () => {
    const { g, a } = studio()
    withEngine(a)
    startGreenlight(g, a.id, { genre: 'rpg', sequelOf: 'old' })
    choice(g, 'small'); choice(g, 'pc'); choice(g, 'engine1')
    const name = g.queue.shift()!
    if (name.kind !== 'input') throw new Error('No name input')
    sellStudioEngine(g, a.id, 'engine1')
    runScript(g, name.scriptId, 'Invalid Game', name.data, name)
    expect(studioOf(a).games).toHaveLength(0)
    const draft = { assetId: a.id, scope: 'small', genre: 'rpg', platform: 'pc', engine: 'engine1' }
    runScript(g, 'gamestudio.gl.engine', 'engine1', draft, {} as ModalItem)
    expect(g.queue.some((m) => m.kind === 'input')).toBe(false)
  })

  it('sells IP once into company cash, transfers licenses, and retains existing games’ use rights', () => {
    const { g, a, b } = studio()
    const st = withEngine(a, engine({ terms: 'subscription', licenses: [{ id: 1, start: 2025, until: 2027, terms: 'subscription', fee: 25_000, royalty: 0, sales: 5_000_000 }], lastRevenue: 25_000 }))
    studioInternals.addGame(st, g, { scope: 'small', genre: 'rpg', platform: 'pc', engine: 'engine1', title: 'Already Greenlit', team: 1, franchise: '', sequelOf: '' })
    saveStudio(a, st)
    const price = engineIpValue(st.engines[0], g.year), cash = b.cash, personal = g.character.money
    expect(studioValue(a.details.studio)).toBeGreaterThan(0)
    sellStudioEngine(g, a.id, 'engine1')
    expect(b.cash).toBe(cash + price)
    expect(b.yearIncome).toBe(price)
    expect(g.character.money).toBe(personal)
    let sold = studioOf(a)
    expect(sold.engines[0].stage).toBe('sold')
    expect(sold.engines[0].licenses).toEqual([])
    expect(engineIpValue(sold.engines[0])).toBe(0)
    expect(availableStudioEngines(sold.engines, 1)).toEqual([])
    expect(studioEngineDef(sold.engines, 'engine1').royalty).toBe(0)
    expect(studioEngineDef(sold.engines, 'engine1').label).toBe('Aurora Engine')
    sellStudioEngine(g, a.id, 'engine1')
    expect(b.cash).toBe(cash + price)
    simulateStudioYear(g, a, b, g.year, 0)
    sold = studioOf(a)
    expect(sold.games[0].stage).toBe('live')
    expect(sold.games[0].engine).toBe('engine1')
    expect(b.cash).toBe(cash + price + b.last!.net - price - b.last!.cashErosion)
  })

  it('lets a studio manager use owned engines instead of paying third-party royalties', () => {
    const { g, a, b } = studio()
    b.employees = 5
    withEngine(a)
    studioManagerTurn(g, a, b)
    expect(studioOf(a).games[0].engine).toBe('engine1')
  })
})

describe('engine licenses and studio accounts', () => {
  it.each(['subscription', 'royalty'] as const)('acquires clients and earns seeded %s receipts with support costs', terms => {
    const { g, a } = studio()
    const st = withEngine(a, engine({ terms }))
    const copyG = structuredClone(g), copySt = structuredClone(st)
    const result = simulateStudioEngines(g, st, g.year, operation)
    expect(result.revenue).toBeGreaterThan(0)
    expect(result.costs).toBeGreaterThan(0)
    expect(st.engines[0].licenses.length).toBeGreaterThan(0)
    expect(st.engines[0].lastRevenue).toBe(result.revenue)
    expect(st.engines[0].earned).toBe(result.revenue)
    expect(simulateStudioEngines(copyG, copySt, copyG.year, operation)).toEqual(result)
    expect(copySt).toEqual(st)
    expect(copyG.rng).toBe(g.rng)
    const snapshot = structuredClone(st)
    expect(simulateStudioEngines(g, st, g.year, operation).revenue).toBe(0)
    expect(st).toEqual(snapshot)
  })

  it('honors existing license prices while closed to new business and expires them after three years', () => {
    const { g, a } = studio()
    const st = withEngine(a, engine({ terms: 'subscription' }))
    simulateStudioEngines(g, st, g.year, operation)
    const clients = st.engines[0].licenses.length
    st.engines[0].terms = 'private'
    for (let offset = 1; offset <= 2; offset++) {
      const result = simulateStudioEngines(g, st, g.year + offset, operation)
      expect(st.engines[0].licenses).toHaveLength(clients)
      expect(result.revenue).toBe(clients * 25_000)
    }
    const expired = simulateStudioEngines(g, st, g.year + 3, operation)
    expect(st.engines[0].licenses).toHaveLength(0)
    expect(expired.revenue).toBe(0)
    expect(expired.costs).toBe(0)
  })

  it('charges royalties only above the client receipts threshold, not below it', () => {
    const { g, a } = studio()
    const st = withEngine(a, engine({ licenses: [{ id: 1, start: g.year, until: g.year + 2, terms: 'royalty', fee: 0, royalty: .05, sales: 100_000 }] }))
    expect(simulateStudioEngines(g, st, g.year, operation).revenue).toBe(0)
    st.engines[0].licenses[0].sales = 10_000_000
    expect(simulateStudioEngines(g, st, g.year + 1, operation).revenue).toBeGreaterThan(0)
  })

  it('reacts to quality, reputation, age and the market, without guaranteed client income', () => {
    const { g } = studio()
    const run = (e: StudioEngine, opts = operation) => {
      const st = normalizeStudio({ engines: [e] } as unknown as Json)
      const result = simulateStudioEngines(structuredClone(g), st, g.year, opts)
      return { result, clients: st.engines[0].licenses.length }
    }
    const modern = engine({ terms: 'subscription', released: g.year - 1 })
    const strong = run(modern)
    expect(strong.clients).toBeGreaterThan(run({ ...modern, quality: 20 }).clients)
    expect(strong.clients).toBeGreaterThan(run(modern, { ...operation, brand: 0 }).clients)
    expect(strong.clients).toBeGreaterThan(run({ ...modern, released: 1980 }).clients)
    expect(strong.clients).toBeGreaterThan(run(modern, { ...operation, market: .1 }).clients)
    expect(run(modern, { ...operation, market: 0 }).result.revenue).toBe(0)
    expect(run(modern, { ...operation, open: 0 }).clients).toBe(0)
  })

  it('does not book contracts before they start or licensing income in the release year', () => {
    const { g, a } = studio()
    const st = withEngine(a, engine({ released: g.year, lastYear: g.year - 1, terms: 'subscription', licenses: [{ id: 1, start: g.year + 1, until: g.year + 3, terms: 'subscription', fee: 25_000, royalty: 0, sales: 0 }] }))
    const result = simulateStudioEngines(g, st, g.year, operation)
    expect(result.revenue).toBe(0)
    expect(result.costs).toBe(0)
  })

  it.each(['us', 'kr', 'jp'] as const)('books engine development and licensing in %s studio accounts without personal or duplicate income', country => {
    const { g, a, b } = studio(937, country)
    neutralAmbition(g)
    startStudioEngine(g, a.id, 'indie', 'Local Engine')
    const personal = g.character.money
    const cash = b.cash, setup = b.yearCosts
    const first = simulateStudioYear(g, a, b, g.year, 0).stmt
    expect(first.cogs).toBeGreaterThan(0)
    expect(first.revenue).toBe(0)
    expect(b.cash).toBe(cash + first.net + setup - first.cashErosion)
    expect(studioOf(a).engines[0].stage).toBe('ready')
    expect(studioOf(a).report?.idle).toBe(true) // Finished engine frees the team for its next project.
    // The engine may finish later under a weak founder: advance the studio until ready.
    for (let i = 0; studioOf(a).engines[0].stage === 'dev' && i < 5; i++) {
      g.year++; b.yearCosts = 0
      simulateStudioYear(g, a, b, g.year, 0)
    }
    action(g, a, `studio.engine.terms.subscription.engine1.${a.id}`).run(g)
    expect(studioOf(a).engines[0].terms).toBe('subscription')
    g.year++; b.yearCosts = 0
    const before = b.cash
    const result = simulateStudioYear(g, a, b, g.year, 0).stmt
    expect(result.revenue).toBe(studioOf(a).engines[0].lastRevenue)
    expect(result.revenue).toBeGreaterThan(0)
    expect(result.cogs).toBeGreaterThan(0)
    expect(b.cash).toBe(before + result.net - result.cashErosion)
    expect(g.character.money).toBe(personal)
  })
})

describe('studio engine save safety', () => {
  it('loads old studio saves unchanged and round-trips engine IP, contracts, and custom game engines', () => {
    const old = normalizeStudio({ v: 1, games: [{ title: 'Old Game', engine: 'titan' }] })
    expect(old.games[0].engine).toBe('titan')
    expect(old.engines).toEqual([])
    expect(old.engineSeq).toBe(0)
    const { g, a } = studio()
    const st = withEngine(a, engine({ terms: 'royalty' }))
    simulateStudioEngines(g, st, g.year, operation)
    studioInternals.addGame(st, g, { scope: 'indie', genre: 'rpg', platform: 'pc', engine: 'engine1', title: 'Persistent', team: 5, franchise: '', sequelOf: '' })
    saveStudio(a, st)
    const restored = JSON.parse(JSON.stringify(g)) as GameState
    expect(studioOf(restored.assets[0])).toEqual(studioOf(a))
    expect(readBiz(restored, restored.assets[0]).studio).toEqual(a.details.studio)
    expect(studioValue(a.details.studio)).toBeGreaterThan(0)
  })

  it('sanitizes malformed and duplicate engines, licenses, numbers, stages and bounded catalogs', () => {
    const licenses = [
      { id: 1, start: 2026, until: 2028, terms: 'subscription', fee: -5, royalty: Infinity, sales: NaN },
      { id: 1, start: 2026, until: 2028, terms: 'subscription', fee: 1e9 },
      { id: 2, start: 2026, until: 9999, terms: 'subscription' },
    ]
    const engines = normalizeEngines([
      null, { id: 'bad', name: 'Bad' }, { ...engine(), quality: Infinity, spent: -5, licenses },
      engine(), engine({ id: 'engine2', stage: 'sold', team: 99, licenses: licenses as never }),
    ] as unknown as Json)
    expect(engines).toHaveLength(2)
    expect(engines[0].quality).toBe(50)
    expect(engines[0].spent).toBe(0)
    expect(engines[0].licenses).toHaveLength(1)
    expect(engines[0].licenses[0]).toMatchObject({ fee: 0, royalty: 0, sales: 0 })
    expect(engines[1].licenses).toEqual([])
    expect(engines[1].team).toBe(0)
    const many = Array.from({ length: 100 }, (_, i) => engine({ id: `engine${i + 1}` }))
    expect(normalizeEngines(many as unknown as Json)).toHaveLength(32)
    expect(normalizeStudio({ engineSeq: 0, engines: [engine({ id: 'engine99' })] } as unknown as Json).engineSeq).toBe(99)
  })

  it('keeps menu rendering, previews, confirmation and valuation pure', () => {
    const { g, a } = studio()
    withEngine(a)
    const before = JSON.stringify(g)
    for (let i = 0; i < 5; i++) {
      const menu = studioEngineMenu(a)
      menu.header?.(g)
      menu.children(g)
      const sale = action(g, a, `studio.engine.sell.engine1.${a.id}`)
      sale.confirm?.(g)
      sale.disabledReason?.(g)
      studioValue(a.details.studio)
    }
    expect(JSON.stringify(g)).toBe(before)
  })

  it('can run 30 deterministic licensing years with finite, nonnegative and bounded state', () => {
    const { g, a } = studio()
    const st = withEngine(a, engine({ tier: 'flagship', terms: 'royalty' }))
    for (let i = 0; i < 30; i++) {
      const result = simulateStudioEngines(g, st, g.year + i, { ...operation, market: .2 + (i % 5) * .4 })
      expect(Number.isFinite(result.revenue) && result.revenue >= 0).toBe(true)
      expect(Number.isFinite(result.costs) && result.costs >= 0).toBe(true)
      expect(st.engines[0].licenses.length).toBeLessThanOrEqual(200)
      expect(engineIpValue(st.engines[0])).toBeGreaterThanOrEqual(0)
      for (const value of Object.values(st.engines[0])) if (typeof value === 'number') expect(Number.isFinite(value) && value >= 0).toBe(true)
      saveStudio(a, st)
      expect(studioOf(a)).toEqual(st)
    }
  })
})
