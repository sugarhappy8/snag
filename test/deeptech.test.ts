// Deep tech: founding all eight industries in very different markets, R&D programs, funding
// rounds and grants (and why they can't be farmed), clinical trials, AI training runs, rocket
// test flights, milestone IPOs, companies that run themselves, old saves, and the Business
// talent's purple hints.
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { businessAssetView, businessCareerMenu, businessSummary } from '../src/game/business'
import { techOf, techView, sellable, runwayYears } from '../src/game/business/deeptech-core'
import { DEEP_TECH, PROGRAMS, frontierScore, grantsFor } from '../src/game/business/deeptech-data'
import { DEEP_TECH_EVENT_IDS, presentDeepTechEvent } from '../src/game/business/deeptech-events'
import { closeRound, grantBlock, makeTermSheet, roundBlock } from '../src/game/business/deeptech-funding'
import { deepTechManagerTurnImpl } from '../src/game/business/deeptech-manager'
import { startProgram, startTrial } from '../src/game/business/deeptech-rd'
import { TECH_VERSION, deepTechIpoThreshold, readTech, type TechState } from '../src/game/business/deeptech-state'
import { canIpo, goPublic } from '../src/game/business/exit'
import { listingsForSale, newBiz, createBusinessAsset } from '../src/game/business/founding'
import { bizOf, businessAssets, normalizeBiz, readBiz } from '../src/game/business/state'
import { DEEP_TECH_IDS, INDUSTRY_IDS, industryDemand } from '../src/game/data/markets'
import { classicSlots, exchangeInfo, slotPlan } from '../src/game/invest/engine'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import { HINT_EMOJI } from '../src/game/talents'
import type { AnnualReportData, Asset, ChoiceModal, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { PRESENT_YEAR } from '../src/game/history/timeline'

function adultIn(countryId: string, money: number, seed = 3, smarts = 90): GameState {
  const g = createNewLife({ seed, year: 2000, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  c.money = money
  c.city = getCountry(countryId).cities[0]
  c.stats.smarts = smarts
  c.licenses = ['driver']
  c.talent = null
  c.talents = []
  return g
}

/** Answer every popup: preferred ids first, else the first choice; sane annual plans. */
function drain(g: GameState, prefer: string[] = []): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices.find((c) => prefer.includes(c.id)) ?? m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') {
      runScript(g, m.scriptId, m.defaultValue || (m.input === 'number' ? String(m.min ?? 1) : 'Test Co'), m.data, m)
    } else if (m.kind === 'minigame') {
      if (m.game === 'annualReport') {
        const r = m.data as unknown as AnnualReportData
        const production = Math.min(r.maxProduction, Math.round(r.expectedDemand * 1.05))
        runScript(g, m.scriptId, JSON.stringify({ price: r.suggestedPrice, production }), m.data, m)
      } else runScript(g, m.scriptId, 'lose', m.data, m)
    } else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

const YEAR_PREFS = ['sign', 'savings', 'pay', 'decline', 'patch', 'recall', 'help', 'disclose', 'fix', 'investor', 'loan', 'steady', 'closed', 'pause', 'license', 'program', 'quiet', 'fair']

function all(g: GameState, nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...all(g, n.children(g))] : [n]))
}

function find(nodes: MenuNode[], id: string): MenuNode | undefined {
  return nodes.find((n) => n.id === id)
}

function startMenu(g: GameState): MenuGroup {
  const start = find(businessCareerMenu.children(g), 'biz.start')
  if (!start || start.type !== 'menu') throw new Error('no start menu')
  return start
}

function startRow(g: GameState, industry: string): MenuAction {
  const row = find(startMenu(g).children(g), `biz.start.${industry}`)
  if (!row || row.type !== 'action') throw new Error(`no row for ${industry}`)
  return row
}

/** Found a company through the real menus and popups. */
function found(g: GameState, industry: string, prefer = ['savings', 'seed', 'cofounder', 'me', 'refuse', 'yes']): Asset {
  const row = startRow(g, industry)
  const reason = row.disabledReason?.(g)
  expect(reason, `can't found ${industry}: ${reason}`).toBeFalsy()
  row.run(g)
  drain(g, prefer)
  const a = businessAssets(g).find((x) => x.details.industry === industry)
  expect(a, `${industry} was founded`).toBeTruthy()
  return a!
}

/** Every number in the state is finite (no NaN or Infinity sneaking into a save). */
function finiteState(v: unknown, path = 'g'): void {
  if (typeof v === 'number') {
    expect(Number.isFinite(v), path).toBe(true)
    return
  }
  if (Array.isArray(v)) v.forEach((x, i) => finiteState(x, `${path}[${i}]`))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) finiteState(x, `${path}.${k}`)
}

function finiteBiz(g: GameState): void {
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    for (const [k, v] of Object.entries({ value: a.value, cash: b.cash, debt: b.debt, price: b.price, production: b.production, valuation: b.valuation, share: b.share })) {
      expect(Number.isFinite(v), `${a.name} ${k} = ${v}`).toBe(true)
    }
    expect(b.share).toBeGreaterThan(0)
    expect(b.share).toBeLessThanOrEqual(1)
    expect(a.value).toBeGreaterThanOrEqual(0)
    const t = readTech(b.tech)
    expect(t.venture).toBeGreaterThanOrEqual(0)
    expect(t.level).toBeGreaterThanOrEqual(0)
    expect(t.level).toBeLessThanOrEqual(100)
  }
  expect(Number.isFinite(g.character.money)).toBe(true)
}

/** A player-run deep-tech company set up directly (skips the founding popups). */
function company(g: GameState, industry: string, patch: Partial<TechState> = {}, opts: { cash?: number; manager?: boolean } = {}): Asset {
  const c = g.character
  const b = newBiz(g, industry as (typeof INDUSTRY_IDS)[number], c.countryId, c.city, { cash: opts.cash ?? 0, ceo: opts.manager ? 'manager' : 'owner', manager: opts.manager ? { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill: 70, salary: 200_000, since: g.year } : null })
  const t = readTech(undefined)
  Object.assign(t, { level: 40, ...patch })
  b.tech = JSON.parse(JSON.stringify(t)) as Json
  const a = createBusinessAsset(g, `Test ${industry}`, b, 0)
  g.assets.push(a)
  if (!opts.manager) {
    c.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: c.age, roleStartAge: c.age } }
  }
  return a
}

function cancelAll(g: GameState, a: Asset): void {
  techOf(bizOf(g, a)).programs = []
}

function act(g: GameState, a: Asset, id: string): MenuAction {
  const node = all(g, businessAssetView(g, a)).find((n) => n.id === `${id}.${a.id}`)
  if (!node || node.type !== 'action') throw new Error(`no action ${id}`)
  return node
}

describe('deep tech', () => {
  it('founds all eight industries in seven very different markets and trades 15+ years with finite numbers', () => {
    const countries = ['us', 'tw', 'kr', 'jp', 'de', 'in', 'ng']
    let survived = 0
    let selling = 0
    for (const [i, cc] of countries.entries()) {
      for (const [j, ind] of DEEP_TECH_IDS.entries()) {
        const g = adultIn(cc, 4_000_000, 11 + i * 8 + j)
        const a = found(g, ind)
        const b0 = readBiz(g, a)
        expect(readTech(b0.tech).level).toBeGreaterThan(0)
        expect(b0.share, `${cc} ${ind} share after founding`).toBeLessThan(1)
        for (let y = 0; y < 16 && g.character.alive; y++) {
          const cur = businessAssets(g)[0]
          if (cur) deepTechManagerTurnImpl(g, cur, bizOf(g, cur))
          ageUp(g)
          drain(g, YEAR_PREFS)
          finiteBiz(g)
        }
        finiteState(g)
        expect(() => JSON.parse(JSON.stringify(g))).not.toThrow()
        const left = businessAssets(g)[0]
        if (left) {
          survived++
          if (readBiz(g, left).last && readBiz(g, left).last!.revenue > 0) selling++
          expect(businessSummary(g)).toMatch(/deep tech at/)
        }
      }
    }
    // Deep tech is risky, not hopeless: plenty survive and many sell something.
    expect(survived).toBeGreaterThan(15)
    expect(selling).toBeGreaterThan(10)
  })

  it('groups the eight under a Deep Tech heading with requirements, and keeps every classic row', () => {
    const g = adultIn('jp', 2_000_000, 5, 50)
    const rows = startMenu(g).children(g)
    const ids = rows.map((r) => r.id)
    const deepH = ids.indexOf('biz.start.deepH')
    expect(deepH).toBeGreaterThan(0)
    for (const ind of INDUSTRY_IDS) {
      const idx = ids.indexOf(`biz.start.${ind}`)
      expect(idx, ind).toBeGreaterThanOrEqual(0)
      expect(idx > deepH, ind).toBe((DEEP_TECH_IDS as readonly string[]).includes(ind))
    }
    // Without the background, the subtitle says what you need.
    const sub = startRow(g, 'quantum').subtitle
    expect(typeof sub === 'function' ? sub(g) : sub).toMatch(/co-founder|physics/)
  })

  it('needs a co-founder or an expert without the background', () => {
    const g = adultIn('us', 3_000_000, 4, 40)
    const a = found(g, 'biotech', ['savings', 'seed', 'expert', 'me', 'refuse'])
    const b = readBiz(g, a)
    expect(b.staff.some((s) => s.role === DEEP_TECH.biotech.expert)).toBe(true)
    const g2 = adultIn('us', 3_000_000, 4, 40)
    const a2 = found(g2, 'biotech', ['savings', 'seed', 'cofounder', 'me', 'refuse'])
    expect(readTech(readBiz(g2, a2).tech).cofounder).not.toBe('')
    expect(readBiz(g2, a2).share).toBeLessThan(readBiz(g, a).share)
  })

  it('runs R&D programs that cost money every year and end in breakthroughs or setbacks', () => {
    const g = adultIn('us', 1_000_000, 8)
    const a = company(g, 'robotics', { venture: 50_000_000, series: 2 })
    const lab = find(businessAssetView(g, a), `dt.lab.${a.id}`) as MenuGroup
    expect(lab && lab.type === 'menu').toBe(true)
    const row = find(lab.children(g), `dt.rd.proto.${a.id}`) as MenuAction
    expect(row.disabledReason?.(g)).toBeNull()
    row.run(g)
    drain(g)
    expect(techView(readBiz(g, a)).programs).toHaveLength(1)
    const before = techView(readBiz(g, a)).venture
    ageUp(g)
    drain(g, YEAR_PREFS)
    const t = techView(readBiz(g, a))
    expect(t.programs).toHaveLength(0)
    expect(t.last?.rd).toBeGreaterThan(0)
    expect(t.venture).toBeLessThan(before)
    expect(t.done.includes('proto') || t.fails > 0).toBe(true)
    // The yearly Lab Report offers to start the recommended program in a free slot.
    g.queue = []
    const lab2 = find(businessAssetView(g, a), `biz.plan.${a.id}`) as MenuAction
    lab2.run(g)
    const report = g.queue.find((m) => m.kind === 'choice' && m.scriptId === 'deeptech.labReport') as ChoiceModal | undefined
    if (report) {
      const start = report.choices.find((c) => c.id.startsWith('start:'))
      expect(start, 'lab report offers a program').toBeTruthy()
      expect(report.choices.filter((c) => c.hint)).toHaveLength(0)
      g.queue = []
      runScript(g, report.scriptId!, start!.id, report.data, report)
      expect(techView(readBiz(g, a)).programs.length).toBe(1)
      cancelAll(g, a)
    }
    // A finished one-off program disappears from the list; slots are limited.
    const b = bizOf(g, a)
    const tt = techOf(b)
    for (const def of PROGRAMS.robotics) startProgram(g, b, tt, def)
    expect(tt.programs.length).toBeLessThanOrEqual(4)
  })

  it('raises rounds that dilute the owner and fill the R&D account, never twice a year, never without milestones', () => {
    const g = adultIn('us', 1_000_000, 9)
    const a = company(g, 'aiLab', { series: 1, venture: 1_000_000, lastRoundYear: g.year - 1, rounds: [{ series: 1, year: g.year - 1, raised: 5_000_000, pre: 20_000_000, equity: 0.2, investor: 'Seed Co', down: false }] })
    const b = bizOf(g, a)
    b.share = 0.8
    const t = techOf(b)
    // No R&D win yet: no Series A.
    expect(roundBlock(g, b, t)).toMatch(/Series A/)
    t.done.push('train')
    t.models.push({ gen: 1, name: 'Nova 1', score: 60, open: false, year: g.year })
    t.stage = 1
    expect(roundBlock(g, b, t)).toBeNull()
    const raise = act(g, a, 'dt.raise')
    expect(raise.disabledReason?.(g)).toBeNull()
    raise.run(g)
    const sheet = g.queue.find((m) => m.kind === 'choice') as ChoiceModal
    expect(sheet.title).toMatch(/Series A/)
    const shareBefore = readBiz(g, a).share
    drain(g, ['sign'])
    const after = readBiz(g, a)
    const ta = readTech(after.tech)
    expect(ta.series).toBe(2)
    expect(after.share).toBeLessThan(shareBefore)
    expect(ta.venture).toBeGreaterThan(5_000_000)
    // Not again this year.
    expect(act(g, a, 'dt.raise').disabledReason?.(g)).toBeTruthy()
    // Investor money can't be paid out: the dividend row has nothing to pay.
    const dividend = act(g, a, 'biz.dividend')
    expect(dividend.disabledReason?.(g)).toBeTruthy()
  })

  it("doesn't turn investor money into the founder's money (close or sell right after a seed)", () => {
    for (const ind of DEEP_TECH_IDS) {
      const g = adultIn('us', 6_000_000, 21)
      const before = g.character.money
      const a = found(g, ind)
      const b = readBiz(g, a)
      expect(readTech(b.tech).venture).toBeGreaterThan(0)
      // Selling: even the best offer (128% of the valuation) can't beat what the founder put in.
      expect(1.28 * b.valuation * b.share, ind).toBeLessThan(before - g.character.money + 1)
      // Closing: the liquidation goes to the founder, the R&D account doesn't.
      const close = act(g, a, 'biz.close')
      close.run(g)
      drain(g)
      expect(businessAssets(g)).toHaveLength(0)
      expect(g.character.money, ind).toBeLessThan(before)
    }
  })

  it('limits grants: one application a year, cooldowns, two awards per program, money stays in the R&D account', () => {
    const g = adultIn('us', 1_000_000, 12)
    const a = company(g, 'quantum', { venture: 10_000_000, series: 2 })
    const b = bizOf(g, a)
    const t = techOf(b)
    const gr = grantsFor('us', 'quantum').find((x) => x.id === 'us-sbir')!
    expect(grantBlock(g, a, b, t, gr)).toMatch(/R&D programs/)
    startProgram(g, b, t, PROGRAMS.quantum.find((p) => p.id === 'qubits')!)
    expect(grantBlock(g, a, b, t, gr)).toBeNull()
    const row = act(g, a, 'dt.grant.us-sbir')
    const cash = b.cash
    const venture = t.venture
    row.run(g)
    drain(g)
    expect(act(g, a, 'dt.grant.us-sbir').disabledReason?.(g)).toMatch(/already applied/)
    const t2 = techView(readBiz(g, a))
    expect(readBiz(g, a).cash).toBe(cash)
    expect(t2.venture).toBeGreaterThanOrEqual(venture)
    // Cooldown and lifetime cap.
    t.grants = [{ id: gr.id, year: g.year, amount: 1 }]
    g.yearActions = {}
    expect(grantBlock(g, a, b, t, gr)).toMatch(/apply again/)
    t.grants = [{ id: gr.id, year: g.year - 10, amount: 1 }, { id: gr.id, year: g.year - 5, amount: 1 }]
    expect(grantBlock(g, a, b, t, gr)).toMatch(/twice/)
  })

  it('runs a biotech pipeline: trials pass or fail, and drugs only earn after approval', () => {
    const g = adultIn('us', 1_000_000, 14)
    const a = company(g, 'biotech', { venture: 3_000_000_000, series: 3, level: 70 })
    const b = bizOf(g, a)
    const t = techOf(b)
    t.drugs.push({ id: 'd1', name: 'Zoravatinib', area: 'rare', phase: 0, quality: 95, peak: 2, filed: g.year, approved: 0, royalty: 1, partner: '', failed: false })
    t.seq = 1
    // Exercise the business clock directly: a random accidental death is unrelated to trials.
    let approvedYear = 0
    let sawTrial = false
    for (let y = 0; y < 30 && !approvedYear; y++) {
      const bb = bizOf(g, a)
      const tt = techOf(bb)
      let d = tt.drugs.find((x) => !x.failed && x.phase < 4)
      if (!d) {
        tt.seq += 1
        tt.drugs.push({ id: `d${tt.seq}`, name: `Candidate ${tt.seq}`, area: 'rare', phase: 0, quality: 95, peak: 2, filed: g.year, approved: 0, royalty: 1, partner: '', failed: false })
        d = tt.drugs[tt.drugs.length - 1]
      }
      if (!tt.programs.some((p) => p.id === 'trial')) {
        const phase = d.phase
        expect(startTrial(g, bb, tt, d)).toBeTruthy()
        sawTrial = true
        expect(tt.stage).toBeGreaterThanOrEqual(Math.min(3, phase + 1))
      }
      g.year += 1
      g.character.age += 1
      g.yearActions = {}
      yearlyBusinessImpl(g)
      drain(g, YEAR_PREFS)
      const after = bizOf(g, a)
      const ta = techOf(after)
      if (ta.drugs.some((x) => x.phase >= 4)) approvedYear = g.year
      else expect(after.last!.revenue, 'no sales before approval').toBe(0)
    }
    expect(sawTrial).toBe(true)
    expect(approvedYear, 'a strong rare-disease drug gets approved within 30 years').toBeGreaterThan(0)
    const b2 = bizOf(g, a)
    expect(sellable(g, b2, techOf(b2))).toBe(true)
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    yearlyBusinessImpl(g)
    drain(g, YEAR_PREFS)
    expect(readBiz(g, a).last!.revenue).toBeGreaterThan(0)
  })

  it('trains AI models with benchmark scores and asks how to release them', () => {
    const g = adultIn('us', 1_000_000, 15)
    const a = company(g, 'aiLab', { venture: 200_000_000, series: 3, level: 60 })
    let trained = false
    for (let y = 0; y < 6 && !trained; y++) {
      const b = bizOf(g, a)
      const t = techOf(b)
      if (!t.programs.some((p) => p.id === 'train')) startProgram(g, b, t, PROGRAMS.aiLab.find((p) => p.id === 'train')!)
      ageUp(g)
      const release = g.queue.find((m) => m.kind === 'choice' && m.scriptId === 'deeptech.release') as ChoiceModal | undefined
      if (release) {
        trained = true
        expect(release.choices.map((c) => c.id)).toEqual(['closed', 'open', 'hold'])
        g.queue = g.queue.filter((m) => m !== release)
        runScript(g, release.scriptId!, 'open', release.data, release)
      }
      drain(g, YEAR_PREFS)
    }
    expect(trained).toBe(true)
    const t = techView(readBiz(g, a))
    expect(t.models.length).toBeGreaterThan(0)
    expect(t.models[0].score).toBeGreaterThan(0)
    expect(t.models[0].score).toBeLessThanOrEqual(99)
    expect(t.models[0].open).toBe(true)
    expect(t.stage).toBeGreaterThanOrEqual(1)
    expect(frontierScore(g.year)).toBeGreaterThanOrEqual(40)
  })

  it('flies test rockets that explode or reach orbit; the first success makes it operational', () => {
    const g = adultIn('us', 1_000_000, 16)
    // Today's launch market: before private spaceflight opened up (~2002-08), state-backed
    // launch providers took almost every customer (business/competition-data.ts).
    g.year = PRESENT_YEAR
    const a = company(g, 'spaceTech', { venture: 2_000_000_000, series: 3, stage: 2, level: 50, done: ['engine', 'rocket'] })
    let flights = 0
    for (let y = 0; y < 8 && techView(readBiz(g, a)).wins === 0; y++) {
      for (let k = 0; k < 2; k++) {
        const fly = act(g, a, 'dt.testflight')
        if (fly.disabledReason?.(g)) break
        const v0 = techView(readBiz(g, a)).venture
        fly.run(g)
        flights++
        drain(g)
        expect(techView(readBiz(g, a)).venture).toBeLessThan(v0)
        if (techView(readBiz(g, a)).wins > 0) break
      }
      if (techView(readBiz(g, a)).wins > 0) break
      ageUp(g)
      drain(g, YEAR_PREFS)
    }
    const t = techView(readBiz(g, a))
    expect(t.tests).toBe(flights)
    expect(t.wins + t.booms).toBe(t.tests)
    expect(t.wins).toBe(1)
    expect(t.stage).toBeGreaterThanOrEqual(3)
    // Now it sells launches, and every good flight adds to the track record.
    expect(sellable(g, readBiz(g, a), t)).toBe(true)
    ageUp(g)
    drain(g, YEAR_PREFS)
    expect(readBiz(g, a).last!.revenue).toBeGreaterThan(0)
    expect(techView(readBiz(g, a)).wins).toBeGreaterThanOrEqual(1)
    // Two flights a year at most.
    g.yearActions = {}
    act(g, a, 'dt.testflight').run(g)
    act(g, a, 'dt.testflight').run(g)
    drain(g)
    const tests = techView(readBiz(g, a)).tests
    act(g, a, 'dt.testflight').run(g)
    drain(g)
    expect(techView(readBiz(g, a)).tests).toBe(tests)
  })

  it('lists on milestones before profits, but not trivially', () => {
    const g = adultIn('us', 1_000_000, 17)
    const a = company(g, 'semiconductor', { series: 1, stage: 1, level: 50 })
    const b = bizOf(g, a)
    expect(canIpo(b)).toMatch(/profit/)
    expect(deepTechIpoThreshold(b)).toBeGreaterThan(0)
    const t = techOf(b)
    t.series = 3
    t.stage = 2
    t.venture = 80_000_000
    t.value = 900_000_000
    b.history = [2001, 2002, 2003].map((year) => ({ year, revenue: 30_000_000, profit: -40_000_000, tax: 0, units: 1, price: 40, staff: 50, valuation: 1e9, outlets: 1 }))
    b.valuation = 950_000_000
    expect(deepTechIpoThreshold(b)).toBeLessThanOrEqual(-40_000_000)
    expect(canIpo(b)).toBeNull()
    // Huge losses still keep public investors away.
    b.history[2].profit = -600_000_000
    expect(canIpo(b)).toBeTruthy()
    b.history[2].profit = -40_000_000
    const shareBefore = b.share
    goPublic(g, a, b)
    drain(g)
    expect(b.public).toBe(true)
    expect(b.share).toBeLessThan(shareBefore)
    // The listing converts investor money into ordinary company cash at year end.
    ageUp(g)
    drain(g, YEAR_PREFS)
    expect(techView(readBiz(g, a)).venture).toBe(0)
  })

  it('runs itself under a general manager: R&D, rounds and plans without the owner', () => {
    let progressed = 0
    for (const ind of ['cybersecurity', 'semiconductor', 'aiLab', 'biotech'] as const) {
      const g = adultIn('us', 2_000_000, 23)
      const a = company(g, ind, { venture: 8_000_000, series: 1, rounds: [{ series: 1, year: g.year, raised: 8_000_000, pre: 30_000_000, equity: 0.2, investor: 'Seed', down: false }], lastRoundYear: g.year }, { manager: true })
      g.character.job = null
      if (ind === 'biotech') techOf(bizOf(g, a)).drugs.push({ id: 'd1', name: 'Velozumab', area: 'autoimmune', phase: 0, quality: 70, peak: 2, filed: g.year, approved: 0, royalty: 1, partner: '', failed: false })
      // R&D the manager ran counts even if the company later fails (cash crunches are the owner's call).
      let ran = false
      for (let y = 0; y < 12; y++) {
        ageUp(g)
        // Nobody asks the owner for a lab report or a price plan.
        expect(g.queue.some((m) => (m.kind === 'choice' && m.scriptId === 'deeptech.labReport') || (m.kind === 'minigame' && m.game === 'annualReport'))).toBe(false)
        drain(g, YEAR_PREFS)
        finiteBiz(g)
        const cur = businessAssets(g)[0]
        if (cur) {
          const t = techView(readBiz(g, cur))
          if (t.done.length + t.fails > 0) ran = true
        }
      }
      if (ran) progressed++
    }
    expect(progressed).toBeGreaterThanOrEqual(3)
  })

  it('leaves classic businesses and old saves alone', () => {
    const g = adultIn('us', 2_000_000, 18)
    const a = found(g, 'restaurant')
    for (let y = 0; y < 3; y++) {
      ageUp(g)
      drain(g, YEAR_PREFS)
    }
    const r = businessAssets(g)[0]
    expect(r).toBeTruthy()
    expect(r.details.tech).toBeUndefined()
    expect(normalizeBiz({ ...r.details, tech: { level: 99 } }, g.year).tech).toBeUndefined()
    // Classic listings for sale never include deep tech.
    for (const cc of ['us', 'tw', 'jp', 'de', 'ng']) {
      const gg = adultIn(cc, 1_000_000, 19)
      for (const l of listingsForSale(gg)) expect((DEEP_TECH_IDS as readonly string[]).includes(l.biz.industry)).toBe(false)
    }
    // A deep-tech company saved without any tech state still loads and trades.
    const g2 = adultIn('de', 1_000_000, 20)
    const old = company(g2, 'robotics')
    delete old.details.tech
    for (let y = 0; y < 3; y++) {
      ageUp(g2)
      drain(g2, YEAR_PREFS)
      finiteBiz(g2)
    }
    expect(readTech(readBiz(g2, businessAssets(g2)[0] ?? old).tech).v).toBe(TECH_VERSION)
    void a
  })

  it('shows Business-talent hints only with the talent', () => {
    const plain = adultIn('tw', 5_000_000, 22)
    const hinted = adultIn('tw', 5_000_000, 22)
    hinted.character.talents = ['Business']
    const hintsOf = (g: GameState) =>
      startMenu(g)
        .children(g)
        .map((n) => (n.type === 'action' && n.hint ? n.hint(g) : null))
        .filter((x): x is string => !!x)
    expect(hintsOf(plain)).toHaveLength(0)
    const h = hintsOf(hinted)
    expect(h.length).toBeGreaterThan(0)
    for (const x of h) expect(x.startsWith(HINT_EMOJI)).toBe(true)
    // Taiwan's semiconductor scene gets a hint.
    const semis = startRow(hinted, 'semiconductor')
    expect(semis.hint?.(hinted)).toMatch(/hub/)

    for (const [g, want] of [[plain, false], [hinted, true]] as const) {
      const a = company(g, 'semiconductor', { venture: 30_000_000, series: 1, rounds: [{ series: 1, year: g.year - 1, raised: 6_000_000, pre: 24_000_000, equity: 0.2, investor: 'Seed', down: false }], lastRoundYear: g.year - 1 })
      const lab = find(businessAssetView(g, a), `dt.lab.${a.id}`) as MenuGroup
      const programHints = lab.children(g).filter((n) => n.type === 'action' && n.hint?.(g))
      expect(programHints.length > 0, `program hint ${want}`).toBe(want)
      // A term sheet: one choice hinted with the talent, none without.
      const b = bizOf(g, a)
      const t = techOf(b)
      t.done.push('firstChip')
      t.stage = 1
      act(g, a, 'dt.raise').run(g)
      const sheet = g.queue.find((m) => m.kind === 'choice') as ChoiceModal
      expect(sheet.choices.filter((c) => c.hint).length).toBe(want ? 1 : 0)
      g.queue = []
      // The annual report's best-plan hint.
      t.stage = 2
      t.done.push('volume')
      const view = businessAssetView(g, a)
      const plan = find(view, `biz.plan.${a.id}`) as MenuAction
      plan.run(g)
      const report = g.queue.find((m) => m.kind === 'minigame')
      expect(report).toBeTruthy()
      const data = report!.kind === 'minigame' ? (report!.data as unknown as AnnualReportData) : null
      expect(!!data?.talentHint, `report hint ${want}`).toBe(want)
      g.queue = []
    }
  })

  it('resolves every deep-tech event choice without breaking the numbers', () => {
    const setups: [string, Partial<TechState>][] = [
      ['semiconductor', { stage: 2, level: 60, ipBook: 1_000_000 }],
      ['aiLab', { stage: 3, level: 60, models: [{ gen: 1, name: 'Iris 1', score: 50, open: false, year: 1999 }, { gen: 2, name: 'Iris 2', score: 70, open: false, year: 2000 }], ipBook: 1_000_000 }],
      ['robotics', { stage: 2, level: 50 }],
      ['biotech', { stage: 2, level: 50, drugs: [{ id: 'd1', name: 'Calavir', area: 'infection', phase: 2, quality: 60, peak: 2, filed: 2000, approved: 0, royalty: 1, partner: '', failed: false }, { id: 'd2', name: 'Noratinib', area: 'oncology', phase: 4, quality: 60, peak: 2, filed: 1995, approved: 1999, royalty: 1, partner: '', failed: false }] }],
      ['spaceTech', { stage: 3, level: 50, wins: 2 }],
      ['electricVehicles', { stage: 2, level: 50, autonomy: 1 }],
      ['quantum', { stage: 2, level: 50, logical: 2, qubits: 200 }],
      ['cybersecurity', { stage: 3, level: 50 }],
    ]
    const seen = new Set<string>()
    for (const [ind, patch] of setups) {
      for (const id of DEEP_TECH_EVENT_IDS) {
        const g = adultIn('us', 5_000_000, 30)
        const a = company(g, ind, { venture: 50_000_000, series: 2, stuck: 2, ...patch }, { cash: 1_000_000 })
        const b = bizOf(g, a)
        b.valuation = 50_000_000
        b.share = 0.6
        b.price = 100
        if (ind === 'biotech') techOf(b).programs.push({ id: 'trial', key: 'trial:d1:2', name: 'Calavir: Phase III trial', emoji: '\u{1F9EA}', years: 3, progress: 1, cost: 1_000_000, odds: 0.6, started: g.year, spent: 1, target: 'd1' })
        if (ind === 'aiLab') techOf(b).programs.push({ id: 'train', key: 'train:3', name: 'Train Iris 3', emoji: '\u{1F9E0}', years: 1, progress: 0, cost: 1_000_000, odds: 0.8, started: g.year, spent: 0, target: '' })
        if (ind === 'electricVehicles') techOf(b).programs.push({ id: 'ramp', key: 'ramp:1', name: 'Escape Production Hell', emoji: '\u{1F635}', years: 1, progress: 0, cost: 1_000_000, odds: 0.6, started: g.year, spent: 0, target: '' })
        if (!presentDeepTechEvent(g, a, id)) continue
        seen.add(id)
        const modal = g.queue.find((m) => m.kind === 'choice') as ChoiceModal
        expect(modal, id).toBeTruthy()
        for (const ch of modal.choices) {
          const copy = structuredClone(g)
          copy.queue = []
          runScript(copy, modal.scriptId!, ch.id, modal.data, modal)
          drain(copy)
          finiteBiz(copy)
          finiteState(copy)
          for (const m of copy.queue) if (m.kind === 'notice') expect(m.text).not.toMatch(/NaN|undefined|\[object/)
        }
        expect(modal.text, id).not.toMatch(/NaN|undefined|\[object/)
      }
    }
    expect(seen.size).toBe(DEEP_TECH_EVENT_IDS.length)
  })

  it('renders every deep-tech menu at every stage without NaN, and menus never touch the dice or the state', () => {
    for (const ind of DEEP_TECH_IDS) {
      for (let stage = 0; stage < DEEP_TECH[ind].stages.length; stage++) {
        for (const talent of [false, true]) {
          const g = adultIn('in', 2_000_000, 50 + stage)
          if (talent) g.character.talents = ['Business']
          const a = company(g, ind, {
            stage,
            level: 30 + stage * 15,
            venture: 40_000_000,
            series: Math.min(6, stage + 1),
            models: stage > 0 ? [{ gen: 1, name: 'Echo 1', score: 55, open: false, year: 1999 }] : [],
            drugs: [{ id: 'd1', name: 'Pelatide', area: 'obesity', phase: Math.min(4, stage), quality: 60, peak: 3, filed: 1998, approved: stage >= 4 ? 1999 : 0, royalty: 1, partner: '', failed: false }],
            contract: stage >= 3 ? { name: 'cargo flights for NASA', perYear: 30_000_000, years: 2 } : null,
            sats: stage >= 3 ? 2 : 0,
            plant: stage >= 2 ? 1 : 0,
            rented: 1,
          })
          const b = bizOf(g, a)
          b.last = { year: g.year - 1, demand: 100, sold: 90, produced: 95, spoiled: 0, price: 10, revenue: 2_000_000, salesTax: 0, netRevenue: 2_000_000, cogs: 500_000, wages: 900_000, keyStaff: 0, rent: 100_000, marketing: 50_000, interest: 0, upkeep: 50_000, other: 3_000_000, otherIncome: 100_000, ownerPay: 0, pbt: -2_500_000, corpTax: 0, net: -2_500_000, cashErosion: 0, cycle: 1, openFraction: 1, employees: 12 }
          techOf(b).last = { year: g.year - 1, rd: 2_000_000, compute: 500_000, side: 100_000, grants: 50_000, credit: 20_000, fromVenture: 1_000_000, oneOff: 0, notes: ['A note.'] }
          const before = JSON.stringify(g)
          const rng = g.rng
          const text: string[] = []
          const walk = (nodes: MenuNode[]) => {
            for (const n of nodes) {
              if (n.type === 'heading') text.push(n.label)
              else if (n.type === 'info') text.push(typeof n.text === 'function' ? n.text(g) : n.text)
              else {
                if (n.visible && !n.visible(g)) continue
                text.push(n.label)
                const sub = typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle
                if (sub) text.push(sub)
                const h = n.hint?.(g)
                if (h) text.push(h)
                const why = n.disabledReason?.(g)
                if (why) text.push(why)
                if (n.type === 'menu') {
                  if (n.header) text.push(n.header(g))
                  walk(n.children(g))
                } else if (n.confirm) {
                  const c = n.confirm(g)
                  if (c) text.push(c)
                }
              }
            }
          }
          walk(businessAssetView(g, a))
          expect(g.rng, `${ind} stage ${stage}`).toBe(rng)
          expect(JSON.stringify(g), `${ind} stage ${stage}: menus changed the state`).toBe(before)
          for (const x of text) expect(x, `${ind} stage ${stage}`).not.toMatch(/NaN|undefined|\[object|Infinity/)
          expect(text.join(' ')).toMatch(/R&D Lab/)
        }
      }
    }
  })

  it('knows the real tech hubs and lists their champions on local exchanges', () => {
    expect(industryDemand('tw', 'semiconductor')).toBeGreaterThanOrEqual(2.5)
    expect(industryDemand('kr', 'semiconductor')).toBeGreaterThanOrEqual(2)
    expect(industryDemand('nl', 'semiconductor')).toBeGreaterThan(1.5)
    expect(industryDemand('us', 'aiLab')).toBeGreaterThan(2)
    expect(industryDemand('jp', 'robotics')).toBeGreaterThan(2)
    expect(industryDemand('ch', 'biotech')).toBeGreaterThan(2)
    expect(industryDemand('il', 'cybersecurity')).toBeGreaterThan(2)
    expect(industryDemand('no', 'electricVehicles')).toBeGreaterThan(1.5)
    expect(industryDemand('cn', 'electricVehicles')).toBeGreaterThan(2)
    expect(industryDemand('ng', 'quantum')).toBeLessThanOrEqual(1)
    expect(industryDemand('ht', 'quantum')).toBeLessThan(0.5)
    expect(slotPlan(exchangeInfo('tw'))).toContain('semis')
    expect(slotPlan(exchangeInfo('us'))).toContain('ai')
    expect(slotPlan(exchangeInfo('jp'))).toContain('robotics')
    expect(slotPlan(exchangeInfo('ch'))).toContain('biotech')
    // Deep-tech companies come after the classic listings, which keep their places.
    const jp = exchangeInfo('jp')
    expect(slotPlan(jp).slice(0, classicSlots(jp))).not.toContain('robotics')
    expect(slotPlan(exchangeInfo('ng')).slice(classicSlots(exchangeInfo('ng')))).toHaveLength(0)
  })

  it('gives founders realistic seeds: less money where venture capital is thin', () => {
    const us = adultIn('us', 5_000_000, 40)
    const ng = adultIn('ng', 5_000_000, 40)
    const ua = found(us, 'aiLab')
    const na = found(ng, 'aiLab')
    const seedUs = readTech(readBiz(us, ua).tech).venture
    const seedNg = readTech(readBiz(ng, na).tech).venture
    expect(seedUs).toBeGreaterThan(seedNg * 2)
    expect(runwayYears(us, ua, readBiz(us, ua), techView(readBiz(us, ua)))).toBeGreaterThan(0.5)
  })

  it('refuses to raise more than every private round there is', () => {
    const g = adultIn('us', 1_000_000, 41)
    const a = company(g, 'cybersecurity', { series: 5, stage: 3, venture: 1_000_000 })
    const b = bizOf(g, a)
    const t = techOf(b)
    b.last = { year: g.year - 1, demand: 1, sold: 1, produced: 1, spoiled: 0, price: 1, revenue: 900_000_000, salesTax: 0, netRevenue: 900_000_000, cogs: 0, wages: 0, keyStaff: 0, rent: 0, marketing: 0, interest: 0, upkeep: 0, other: 0, otherIncome: 0, ownerPay: 0, pbt: 0, corpTax: 0, net: 0, cashErosion: 0, cycle: 1, openFraction: 1, employees: 10 }
    expect(roundBlock(g, b, t)).toBeNull()
    closeRound(g, a, b, t, makeTermSheet(g, a, b, t))
    expect(t.series).toBe(6)
    g.year += 2
    expect(roundBlock(g, b, t)).toMatch(/every private round/)
  })
})
