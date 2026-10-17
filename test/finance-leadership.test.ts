import { describe, expect, it } from 'vitest'
import { boardOf } from '../src/game/business/board-state'
import { becomeCeo, shortlist } from '../src/game/business/career'
import { financeLeadershipSkill } from '../src/game/business/finance-leadership'
import { fundManagerTurn, fundNodes } from '../src/game/business/fund'
import { runCampaign, setHedgeTerms, setStrategy } from '../src/game/business/fund-actions'
import { fundAutopilot } from '../src/game/business/fund-manager'
import { readFund, saveFund } from '../src/game/business/fund-state'
import { businessView } from '../src/game/business/manage'
import { bizOf, readBiz, type Manager } from '../src/game/business/state'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuNode } from '../src/game/types'
import { firm } from './fund-fixtures'

function actions(g: GameState, nodes: MenuNode[], depth = 0): MenuAction[] {
  const out: MenuAction[] = []
  for (const node of nodes) {
    if (node.type === 'action') out.push(node)
    else if (node.type === 'menu' && depth < 8) out.push(...actions(g, node.children(g), depth + 1))
  }
  return out
}

describe('finance-specific CEO hiring', () => {
  it('offers hedge-fund specialists, a generalist and an adjacent candidate with visible records', () => {
    const { g, b } = firm('hedge')
    const list = shortlist(g, b)
    expect(list.filter(m => m.finance?.specialty === 'hedge').length).toBeGreaterThanOrEqual(2)
    expect(list.some(m => m.finance?.specialty === 'generalist')).toBe(true)
    expect(list.some(m => m.finance?.specialty === 'asset')).toBe(true)
    expect(list.every(m => (m.finance?.record ?? 0) >= 25 && (m.finance?.record ?? 0) <= 99)).toBe(true)
  })

  it('makes relevant experience useful but modest, and preserves it through save normalization', () => {
    const { g, a, b } = firm('hedge')
    const base: Manager = { firstName: 'Sam', lastName: 'Lee', gender: 'female', skill: 75, salary: 150_000, since: g.year, integrity: 80 }
    const exact: Manager = { ...base, finance: { specialty: 'hedge', approach: 'macro', risk: 'balanced', record: 80 } }
    const wrong: Manager = { ...base, finance: { specialty: 'bank', approach: 'risk', risk: 'cautious', record: 80 } }
    expect(financeLeadershipSkill(b, exact)).toBeGreaterThan(financeLeadershipSkill(b, wrong))
    expect(financeLeadershipSkill(b, exact) - base.skill).toBeLessThan(15)
    b.ceo = 'manager'; b.manager = exact
    expect(readBiz(g, a).manager?.finance).toEqual(exact.finance)
    ;(a.details.manager as Record<string, unknown>).finance = { specialty: 'wizard', approach: 'magic', risk: 'wild', record: 999 }
    expect(readBiz(g, a).manager?.finance).toBeUndefined()
  })

  it('shows the specialist shortlist when the owner hires a hedge-fund CEO and persists the pick', () => {
    const { g, a, b } = firm('hedge', { cash: 5_000_000 })
    becomeCeo(g, a, b)
    g.queue = []
    const hire = actions(g, businessView(g, a)).find(x => x.id === `biz.stepDown.${a.id}`)
    expect(hire?.label).toBe('Hire Hedge Fund CEO')
    hire!.run(g)
    const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'business.manager')!
    expect(modal.title).toBe('Hire Hedge Fund CEO')
    expect(modal.text).toMatch(/Hedge funds.*record \d+\/100/)
    runScript(g, modal.scriptId!, 'm0', modal.data, modal)
    expect(bizOf(g, a).manager?.finance?.specialty).toBe('hedge')
  })
})

describe('mandate-driven asset and hedge managers', () => {
  function managedHedge(mandate: 'growth' | 'cash') {
    const x = firm('hedge', { skill: 92, cash: 20_000_000, lifeId: `mandate-${mandate}` })
    x.b.manager!.finance = { specialty: 'hedge', approach: 'macro', risk: 'bold', record: 92 }
    boardOf(x.b).mandate = mandate
    const f = readFund(x.b)
    f.lastYear = x.g.year - 1
    f.marks = [{ y: x.g.year - 2, r: .03, m: .08, k: .6 }, { y: x.g.year - 1, r: .05, m: .12, k: .7 }]
    saveFund(x.b, f)
    fundAutopilot(x.g, x.b)
    return { ...x, f: readFund(x.b) }
  }

  it('lets a growth-mandate macro specialist take measured risk, while cash mandate protects company cash', () => {
    const growth = managedHedge('growth').f
    const cash = managedHedge('cash').f
    expect(growth.strategy).toBe('macro')
    expect(growth.lev).toBeGreaterThan(1)
    expect(growth.coinvest).toBeGreaterThan(0)
    expect(cash.strategy).not.toBe('macro')
    expect(cash.lev).toBe(1)
    expect(cash.coinvest).toBe(0)
  })

  it('uses a cautious asset-manager brief for a stable style and never invents future knowledge', () => {
    const { g, b } = firm('asset', { skill: 88, lifeId: 'asset-mandate' })
    b.manager!.finance = { specialty: 'asset', approach: 'systematic', risk: 'cautious', record: 85 }
    boardOf(b).mandate = 'cash'
    const before = g.rng
    fundAutopilot(g, b)
    expect(['index', 'bonds']).toContain(readFund(b).style)
    expect(g.rng).toBe(before)
  })

  it('locks direct fund controls under a hired CEO, keeps the mandate visible, and still writes an annual letter', () => {
    const { g, a, b } = firm('hedge', { skill: 90, cash: 10_000_000 })
    expect(setStrategy(g, a.id, 'macro')).toBe(false)
    expect(setHedgeTerms(g, a.id, 'coinvest', 1_000_000)).toBe(false)
    expect(runCampaign(g, a.id)).toBe(false)
    const rows = actions(g, fundNodes(g, a))
    const strategy = rows.find(x => x.id.endsWith('.strategy.macro'))
    expect(strategy?.disabledReason?.(g)).toMatch(/controls day-to-day strategy/i)
    const text = JSON.stringify(fundNodes(g, a))
    expect(text).toContain(`fund.${a.id}.mandate`)

    const f = readFund(b)
    f.lastYear = g.year - 1
    saveFund(b, f)
    g.queue = []
    fundManagerTurn(g, b)
    expect(g.queue.some(m => m.kind === 'notice' && /Letter from the CEO/.test(m.title))).toBe(true)

    b.ceo = 'owner'; b.manager = null
    expect(setStrategy(g, a.id, 'macro')).toBe(true)
  })
})
