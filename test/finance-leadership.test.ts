import { describe, expect, it } from 'vitest'
import { boardOf } from '../src/game/business/board-state'
import { bestMandate, mandateScores, outlook } from '../src/game/business/board-ceo'
import { becomeCeo, installManager, LETTER_WORDS, letterWords, managerCandidate, optimizerGain, shortlist } from '../src/game/business/career'
import {
  financeCandidateScore,
  financeLeadershipSkill,
  financeProfileOf,
  financeRoleLabel,
  financeTarget,
} from '../src/game/business/finance-leadership'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { fundManagerTurn, fundNodes, initFund } from '../src/game/business/fund'
import {
  diligence,
  fundLeverBlock,
  inventAlgorithm,
  runCampaign,
  setCall,
  setCommission,
  setFee,
  setHedgeTerms,
  setStrategy,
  setStyle,
} from '../src/game/business/fund-actions'
import { fundAutopilot } from '../src/game/business/fund-manager'
import { readFund, saveFund, type FundType } from '../src/game/business/fund-state'
import { openPitches } from '../src/game/business/fund-vc'
import { businessView } from '../src/game/business/manage'
import { normalizeBiz, type BizState, type FinanceProfile, type Manager } from '../src/game/business/state'
import { runScript } from '../src/game/scripts'
import type { GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { firm } from './fund-fixtures'
import { makeTestGame } from './helpers'

function fixedManager(year: number, finance?: FinanceProfile, skill = 90): Manager {
  return {
    firstName: 'Sam', lastName: 'Lee', gender: 'female', skill, salary: 150_000, since: year,
    style: 'steady', integrity: 85, ...(finance ? { finance } : {}),
  }
}

function managed(type: FundType, finance: FinanceProfile, cash = 20_000_000) {
  const x = firm(type, { cash, lifeId: 'finance-leadership' })
  installManager(x.g, x.b, fixedManager(x.g.year, finance))
  return x
}

function all(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap(node => node.type === 'menu' && depth < 8 ? [node, ...all(g, node.children(g), depth + 1)] : [node])
}

function action(g: GameState, nodes: MenuNode[], id: string): MenuAction {
  const node = all(g, nodes).find(n => n.id === id)
  if (!node || node.type !== 'action') throw new Error(`missing action ${id}`)
  return node
}

describe('corporate finance leadership profiles', () => {
  it('builds one deterministic specialist mix without changing the old shortlist RNG budget', () => {
    const financeGame = makeTestGame(31, { age: 40, money: 10_000_000 })
    const ordinaryGame = makeTestGame(31, { age: 40, money: 10_000_000 })
    const hedge = newBiz(financeGame, 'investmentFirm', 'us', 'Chicago', { founded: financeGame.year })
    initFund(financeGame, hedge, 'hedge')
    const cafe = newBiz(ordinaryGame, 'restaurant', 'us', 'Chicago', { founded: ordinaryGame.year })
    const finance = shortlist(financeGame, hedge)
    const ordinary = shortlist(ordinaryGame, cafe)

    expect(financeGame.rng).toBe(ordinaryGame.rng)
    expect(finance.map(m => [m.firstName, m.lastName, m.skill, m.style, m.integrity]))
      .toEqual(ordinary.map(m => [m.firstName, m.lastName, m.skill, m.style, m.integrity]))
    expect(finance.slice(0, 4).map(m => m.finance?.specialty)).toEqual(['hedge', 'hedge', 'generalist', 'asset'])
    expect(ordinary.every(m => m.finance === undefined)).toBe(true)
    for (const m of finance) {
      expect(m.finance).toBeTruthy()
      expect(m.finance!.record).toBeGreaterThanOrEqual(20)
      expect(m.finance!.record).toBeLessThanOrEqual(99)
    }

    for (let seed = 50; seed < 70; seed++) {
      const game = makeTestGame(seed, { age: 40, money: 10_000_000 })
      const fund = newBiz(game, 'investmentFirm', 'us', 'Chicago', { founded: game.year })
      initFund(game, fund, 'hedge')
      const specialists = shortlist(game, fund).filter(m => m.finance?.specialty === 'hedge')
      expect(specialists.length).toBeGreaterThan(0)
      expect(specialists.every(m => m.finance?.approach !== 'macro')).toBe(true)
    }

    const replay = makeTestGame(31, { age: 40, money: 10_000_000 })
    const replayFund = newBiz(replay, 'investmentFirm', 'us', 'Chicago', { founded: replay.year })
    initFund(replay, replayFund, 'hedge')
    expect(shortlist(replay, replayFund)).toEqual(finance)
  })

  it('normalizes valid profiles, rejects malformed ones and preserves old-manager skill', () => {
    const g = makeTestGame(32, { age: 40 })
    const b = newBiz(g, 'investmentFirm', 'us', 'Chicago')
    initFund(g, b, 'asset')
    const old = fixedManager(g.year, undefined, 77)
    expect(financeLeadershipSkill(b, old)).toBe(77)

    const raw = JSON.parse(JSON.stringify(b)) as Record<string, Json>
    raw.ceo = 'manager'
    raw.manager = { ...old, finance: { specialty: 'asset', approach: 'fundamental', risk: 'balanced', record: 500 } } as unknown as Json
    const valid = normalizeBiz(raw, g.year)
    expect(valid.manager?.finance).toEqual({ specialty: 'asset', approach: 'fundamental', risk: 'balanced', record: 100 })

    const bad = JSON.parse(JSON.stringify(raw)) as Record<string, Json>
    ;(bad.manager as Record<string, Json>).finance = { specialty: 'wizard', approach: 'future', risk: 'infinite', record: Number.NaN }
    const normalized = normalizeBiz(bad, g.year)
    expect(normalized.manager?.finance).toBeUndefined()
    const currentMalformed = { ...old, finance: { specialty: 'asset', approach: 'future', risk: 'bold', record: 80 } } as unknown as Manager
    expect(financeProfileOf(currentMalformed)).toBeUndefined()
    expect(financeLeadershipSkill(b, currentMalformed)).toBe(77)
  })

  it('recognizes real finance books, including legacy eras, but not synthetic group-like wrappers', () => {
    const g = makeTestGame(33, { age: 40 })
    for (const type of ['asset', 'hedge', 'vc', 'broker'] as FundType[]) {
      const b = newBiz(g, 'investmentFirm', 'us', 'Chicago', { founded: 2026 })
      initFund(g, b, type)
      expect(financeTarget(b)).toBe(type)
    }
    const bank = newBiz(g, 'bank', 'us', 'Chicago')
    const online = newBiz(g, 'onlineBank', 'us', 'Chicago')
    expect(financeTarget(bank)).toBe('bank')
    expect(financeTarget(online)).toBe('bank')
    expect(financeRoleLabel(bank)).toBe('Bank CEO')
    expect(financeRoleLabel(online)).toBe('Online Bank CEO')

    const legacy = { ...newBiz(g, 'investmentFirm', 'us', 'Chicago', { founded: 1930 }), financeFirm: { model: 'private', lastYear: -1 } as unknown as Json }
    expect(financeTarget(legacy)).toBe('asset')
    legacy.founded = 1960
    expect(financeTarget(legacy)).toBe('hedge')
    legacy.financeFirm = {} as Json
    expect(financeTarget(legacy)).toBe('hedge')

    const groupLike = { ...bank, financeFirm: undefined }
    expect(financeTarget(groupLike)).toBeNull()
    expect(financeRoleLabel(groupLike)).toBe('CEO')
    expect(managerCandidate(g, groupLike).finance).toBeUndefined()
  })

  it('shows and preserves the selected finance résumé in the hiring flow', () => {
    const { g, a, b } = firm('hedge', { cash: 10_000_000, talent: 'Business' })
    becomeCeo(g, a, b)
    const stepDown = businessView(g, a).find(n => n.id === `biz.stepDown.${a.id}`)
    expect(stepDown?.type).toBe('action')
    if (!stepDown || stepDown.type !== 'action') throw new Error('missing step-down action')
    expect(stepDown.label).toBe('Hire a Hedge Fund CEO')
    stepDown.run(g)
    const modal = g.queue.at(-1)
    expect(modal?.kind).toBe('choice')
    if (!modal || modal.kind !== 'choice' || modal.source !== 'script' || !modal.scriptId) throw new Error('missing hiring modal')
    expect(modal.title).toBe('Hire a Hedge Fund CEO')
    expect(modal.text).toMatch(/career record/)
    const data = modal.data as Record<string, Json>
    const candidates = data.candidates as Record<string, Json>[]
    const shown = candidates[0].finance
    expect(shown).toBeTruthy()
    runScript(g, modal.scriptId, 'm0', modal.data, modal)
    expect(b.manager?.finance).toEqual(shown)
    const reloaded = normalizeBiz(JSON.parse(JSON.stringify(b)) as Record<string, Json>, g.year)
    expect(reloaded.manager?.finance).toEqual(shown)
  })

  it('bounds finance skill and changes candidate order by institution and mandate', () => {
    const g = makeTestGame(34, { age: 40 })
    const hedge = newBiz(g, 'investmentFirm', 'us', 'Chicago')
    initFund(g, hedge, 'hedge')
    const cautious = fixedManager(g.year, { specialty: 'hedge', approach: 'risk', risk: 'cautious', record: 50 }, 50)
    const bold = fixedManager(g.year, { specialty: 'hedge', approach: 'event', risk: 'bold', record: 50 }, 50)
    expect(financeCandidateScore(hedge, cautious, 'cash', 150_000)).toBeGreaterThan(financeCandidateScore(hedge, bold, 'cash', 150_000))
    expect(financeCandidateScore(hedge, bold, 'growth', 150_000)).toBeGreaterThan(financeCandidateScore(hedge, cautious, 'growth', 150_000))

    const asset = newBiz(g, 'investmentFirm', 'us', 'Chicago')
    initFund(g, asset, 'asset')
    const assetSpecialist = fixedManager(g.year, { specialty: 'asset', approach: 'fundamental', risk: 'balanced', record: 50 }, 50)
    expect(financeLeadershipSkill(asset, assetSpecialist)).toBeGreaterThan(financeLeadershipSkill(hedge, assetSpecialist))
    const skills = [0, 50, 100].map(skill => financeLeadershipSkill(asset, { ...assetSpecialist, skill }))
    expect(skills[0]).toBeGreaterThanOrEqual(0)
    expect(skills[1]).toBeGreaterThan(skills[0])
    expect(skills[2]).toBe(100)
    expect(financeLeadershipSkill(asset, fixedManager(g.year, undefined, 5))).toBe(5)
  })

  it('adds a profile once to profileless direct appointments', () => {
    const g = makeTestGame(35, { age: 40 })
    const b = newBiz(g, 'investmentFirm', 'us', 'Chicago')
    initFund(g, b, 'hedge')
    const installed = installManager(g, b, fixedManager(g.year))
    expect(installed.finance?.specialty).toBe('hedge')
    const shown = installed.finance
    expect(installManager(g, b, installed).finance).toEqual(shown)
  })
})

describe('delegated investment-firm controls', () => {
  const profile: FinanceProfile = { specialty: 'hedge', approach: 'risk', risk: 'balanced', record: 88 }

  it('blocks asset, hedge and brokerage operating levers at both action and menu layers', () => {
    const asset = managed('asset', { ...profile, specialty: 'asset' })
    const assetBefore = JSON.stringify({ fund: readFund(asset.b), cash: asset.b.cash, costs: asset.b.yearCosts, actions: asset.g.yearActions })
    expect(setStyle(asset.g, asset.a.id, 'growth')).toBe(false)
    expect(setFee(asset.g, asset.a.id, .02)).toBe(false)
    expect(runCampaign(asset.g, asset.a.id)).toBe(false)
    expect(JSON.stringify({ fund: readFund(asset.b), cash: asset.b.cash, costs: asset.b.yearCosts, actions: asset.g.yearActions })).toBe(assetBefore)
    const block = fundLeverBlock(asset.g, asset.a)
    expect(block).toContain('Sam Lee runs the firm')
    const staleNodes = fundNodes(asset.g, asset.a)
    expect(action(asset.g, staleNodes, `fund.${asset.a.id}.fee`).disabledReason?.(asset.g)).toBe(block)

    const restored = { ...asset.a, details: JSON.parse(JSON.stringify(asset.a.details)) as Record<string, Json> }
    ;(restored.details as unknown as BizState).ceo = 'owner'
    ;(restored.details as unknown as BizState).manager = null
    asset.g.assets[asset.g.assets.findIndex(a => a.id === asset.a.id)] = restored
    expect(action(asset.g, staleNodes, `fund.${asset.a.id}.fee`).disabledReason?.(asset.g)).toBeNull()

    const hedge = managed('hedge', profile)
    const hedgeBefore = JSON.stringify(readFund(hedge.b))
    expect(setStrategy(hedge.g, hedge.a.id, 'event')).toBe(false)
    expect(setCall(hedge.g, hedge.a.id, 'bull', 3)).toBe(false)
    for (const key of ['mgmt', 'perf', 'lev', 'coinvest'] as const) expect(setHedgeTerms(hedge.g, hedge.a.id, key, 1)).toBe(false)
    expect(runCampaign(hedge.g, hedge.a.id)).toBe(false)
    expect(JSON.stringify(readFund(hedge.b))).toBe(hedgeBefore)
    expect(action(hedge.g, fundNodes(hedge.g, hedge.a), `fund.${hedge.a.id}.strategy.event`).disabledReason?.(hedge.g)).toBe(fundLeverBlock(hedge.g, hedge.a))

    const broker = managed('broker', { ...profile, specialty: 'broker', approach: 'client' })
    const brokerBefore = JSON.stringify(readFund(broker.b))
    expect(setCommission(broker.g, broker.a.id, .001)).toBe(false)
    expect(runCampaign(broker.g, broker.a.id)).toBe(false)
    expect(JSON.stringify(readFund(broker.b))).toBe(brokerBefore)
    expect(action(broker.g, fundNodes(broker.g, broker.a), `fund.${broker.a.id}.commission`).disabledReason?.(broker.g)).toBe(fundLeverBlock(broker.g, broker.a))
  })

  it('keeps deliberate VC-deal and owner-inventor exceptions available', () => {
    const vc = managed('vc', { ...profile, specialty: 'vc', approach: 'growth' }, 50_000_000)
    const pitch = openPitches(vc.g, vc.b, readFund(vc.b), vc.g.year)[0]
    expect(pitch).toBeTruthy()
    expect(diligence(vc.g, vc.a.id, pitch.id)).toBe(true)
    const beforeFunds = readFund(vc.b).funds.length
    const raise = action(vc.g, fundNodes(vc.g, vc.a), `fund.${vc.a.id}.raise`)
    expect(raise.disabledReason?.(vc.g)).toBe(fundLeverBlock(vc.g, vc.a))
    raise.run(vc.g)
    expect(readFund(vc.b).funds).toHaveLength(beforeFunds)

    const hedge = firm('hedge', { cash: 50_000_000, talent: 'Inventor', year: 2026 })
    installManager(hedge.g, hedge.b, fixedManager(hedge.g.year, profile))
    expect(fundLeverBlock(hedge.g, hedge.a)).not.toBeNull()
    expect(inventAlgorithm(hedge.g, hedge.a.id)).toBe(true)
  })
})

describe('mandates and finance decision letters', () => {
  const profile: FinanceProfile = { specialty: 'hedge', approach: 'event', risk: 'bold', record: 92 }

  function ready(mandate: 'growth' | 'cash', lifeId: string) {
    const x = managed('hedge', profile, 100_000_000)
    x.g.lifeId = lifeId
    const f = readFund(x.b)
    f.lastYear = x.g.year - 1
    f.marks = [{ y: x.g.year - 3, r: .04, m: -.1, k: .6 }, { y: x.g.year - 2, r: .08, m: .12, k: .7 }, { y: x.g.year - 1, r: .02, m: .03, k: .55 }]
    saveFund(x.b, f)
    boardOf(x.b).mandate = mandate
    return x
  }

  it('makes Growth and Cash meaningfully different without using shared RNG or future timelines', () => {
    const growth = ready('growth', 'future-a')
    const cash = ready('cash', 'future-b')
    const growthRng = growth.g.rng, cashRng = cash.g.rng
    fundAutopilot(growth.g, growth.b)
    fundAutopilot(cash.g, cash.b)
    const gf = readFund(growth.b), cf = readFund(cash.b)
    expect(gf.coinvest).toBeGreaterThan(0)
    expect(cf.coinvest).toBe(0)
    expect(gf.campaign).toBe(growth.g.year)
    expect(cf.campaign).not.toBe(cash.g.year)
    expect(gf.strategy).not.toBe('macro')
    expect(cf.strategy).not.toBe('macro')
    expect(growth.g.rng).toBe(growthRng)
    expect(cash.g.rng).toBe(cashRng)
    expect(growth.b.yearCosts).toBeGreaterThanOrEqual(0)
    expect(cash.b.yearCosts).toBe(0)

    const twin = ready('growth', 'a-completely-different-future')
    fundAutopilot(twin.g, twin.b)
    const tf = readFund(twin.b)
    expect({ strategy: tf.strategy, lev: tf.lev, call: tf.call, mgmt: tf.mgmt, perf: tf.perf, coinvest: tf.coinvest, campaign: tf.campaign })
      .toEqual({ strategy: gf.strategy, lev: gf.lev, call: gf.call, mgmt: gf.mgmt, perf: gf.perf, coinvest: gf.coinvest, campaign: gf.campaign })
  })

  it('writes one truthful, voice-safe post-settlement letter', () => {
    const x = ready('growth', 'letter-life')
    x.g.queue = []
    fundManagerTurn(x.g, x.b)
    const afterFirst = JSON.stringify({ fund: readFund(x.b), cash: x.b.cash, costs: x.b.yearCosts, queue: x.g.queue, board: boardOf(x.b) })
    fundManagerTurn(x.g, x.b)
    expect(JSON.stringify({ fund: readFund(x.b), cash: x.b.cash, costs: x.b.yearCosts, queue: x.g.queue, board: boardOf(x.b) })).toBe(afterFirst)
    const letters = x.g.queue.filter(q => q.kind === 'notice' && q.title === `${x.a.name}: Letter from the CEO`)
    expect(letters).toHaveLength(1)
    const board = boardOf(x.b)
    expect(board.letter).toBe(x.g.year)
    expect(board.memo.join(' ')).toMatch(/growth mandate/i)
    expect(board.memo.some(line => /strategy|fees|cash/i.test(line))).toBe(true)
    for (const line of board.memo) expect(letterWords(line)).toBeLessThanOrEqual(LETTER_WORDS)

    const plan = JSON.stringify(readFund(x.b))
    x.g.year++
    expect(fundAutopilot(x.g, x.b)).toEqual({ lines: [], big: false })
    expect(JSON.stringify(readFund(x.b))).toBe(plan)
  })

  it('treats one pricing-grid step as a material change despite floating-point rounding', () => {
    const x = managed('asset', { specialty: 'asset', approach: 'fundamental', risk: 'balanced', record: 92 }, 100_000_000)
    const initial = readFund(x.b)
    initial.lastYear = x.g.year - 1
    initial.campaign = x.g.year
    saveFund(x.b, initial)
    boardOf(x.b).mandate = 'cash'
    fundAutopilot(x.g, x.b)

    const planned = readFund(x.b)
    const target = planned.fee
    const prior = target <= .0195 ? target + .0005 - 1e-12 : target - .0005 + 1e-12
    expect(Math.abs(prior - target)).toBeLessThan(.0005)
    expect(Math.round(prior / .0005)).not.toBe(Math.round(target / .0005))
    planned.fee = prior
    planned.decisionYear = x.g.year - 1
    saveFund(x.b, planned)

    const result = fundAutopilot(x.g, x.b)
    expect(readFund(x.b).fee).toBe(target)
    expect(result.big).toBe(true)
  })

  it('keeps every investment-firm letter short and free of profit guarantees', () => {
    const specialties: Record<FundType, FinanceProfile> = {
      asset: { specialty: 'asset', approach: 'fundamental', risk: 'balanced', record: 80 },
      hedge: profile,
      vc: { specialty: 'vc', approach: 'growth', risk: 'balanced', record: 80 },
      broker: { specialty: 'broker', approach: 'client', risk: 'balanced', record: 80 },
    }
    for (const type of ['asset', 'hedge', 'vc', 'broker'] as FundType[]) {
      const x = managed(type, specialties[type], 100_000_000)
      const f = readFund(x.b)
      f.lastYear = x.g.year - 1
      saveFund(x.b, f)
      boardOf(x.b).mandate = 'growth'
      fundManagerTurn(x.g, x.b)
      const memo = boardOf(x.b).memo
      expect(memo.length).toBeGreaterThan(0)
      expect(memo.join(' ')).not.toMatch(/guarantee|certain profit|sure profit/i)
      for (const line of memo) expect(letterWords(line)).toBeLessThanOrEqual(LETTER_WORDS)
    }
  })
})

describe('finance model routing', () => {
  it('never values a financial CEO with price-and-production economics', () => {
    const rows: { g: GameState; a: ReturnType<typeof createBusinessAsset>; b: BizState }[] = []
    for (const type of ['asset', 'hedge'] as FundType[]) rows.push(firm(type))
    for (const industry of ['bank', 'onlineBank'] as const) {
      const g = makeTestGame(industry === 'bank' ? 41 : 42, { age: 40, money: 10_000_000 })
      const b = newBiz(g, industry, 'us', 'Chicago')
      const a = createBusinessAsset(g, `Test ${industry}`, b, 1_000_000)
      g.assets.push(a)
      rows.push({ g, a, b })
    }
    for (const { g, a, b } of rows) {
      const before = JSON.stringify(g), rng = g.rng
      expect(optimizerGain(g, b)).toBe(0)
      expect(outlook(g, a, b)).toMatchObject({ modeled: false, invest: 0, cost: 0 })
      expect(mandateScores(g, a, b)).toEqual({ growth: 0, balanced: 0, profit: 0, cash: 0 })
      expect(bestMandate(g, a, b)).toBeNull()
      expect(JSON.stringify(g)).toBe(before)
      expect(g.rng).toBe(rng)
    }

    const g = makeTestGame(43, { age: 40 })
    const b = newBiz(g, 'restaurant', 'us', 'Chicago')
    const a = createBusinessAsset(g, 'Control Cafe', b, 100_000)
    expect(outlook(g, a, b).modeled).toBe(true)

    const groupLike = { ...newBiz(g, 'bank', 'us', 'Chicago'), financeFirm: undefined }
    const groupAsset = createBusinessAsset(g, 'Synthetic Group', groupLike, 100_000)
    g.assets.push(groupAsset)
    expect(financeTarget(groupLike)).toBeNull()
    expect(outlook(g, groupAsset, groupLike).modeled).toBe(true)
  })
})
