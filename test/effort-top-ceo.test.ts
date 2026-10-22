// R3-M10 (J.8): a top hired CEO makes the company's research steadier. R0-3 took away the skill-100 "strategic trading income" (it minted
// money); this is the bounded benefit that replaces it, and it moves no money at all. A hired CEO rated 90 to 100, or a division under an
// autonomous group CEO of that rating, adds up to 3 odds points to the company's own research, as one labelled line, "steady CEO".
//
// What this file pins:
//   - the ramp: nothing at 90 and below, half at 95, the whole 3 points at 100, never more, and a skill that is not a number is nothing;
//   - the line: Heavy, Operations and product R&D quotes carry a `ceo` line of at most 3 points for a top hired CEO, and none below 90, for
//     an owner-run company, for an NPC company and for a division whose group CEO is not autonomous; a division under an autonomous
//     group CEO has it from the group CEO's rating;
//   - the odds move by exactly the line (at every budget: money does not widen it), and the price, the years and the quality do not move;
//   - parity: the oracle rows of v5.0.0 (hired skill 90 and up) sit above it by at most TOL.topCeoSlack, every other row within a point;
//   - no money: twenty seeded firms with a skill-100 manager over five years book what the books say, no strategic income, no foresight
//     line, and the books balance;
//   - the CEO's letter says it once, and only for a company with research going, in the voice (no colon join, 12 words or fewer);
//   - nothing here draws a number or writes the game (noDraw, a deep-frozen state).
//
// No pinned seed: lives are the kits' own, with a tuple of arguments.
import { describe, expect, it } from 'vitest'
import { boardOf } from '../src/game/business/board-state'
import { smartManagerTurn, steadyLetterLine } from '../src/game/business/board-ceo'
import { askingSalary, becomeCeo, installManager, managerCandidate, stepDown } from '../src/game/business/career'
import { TOP_CEO_MAX_PTS, topCeoPts, topCeoSteady } from '../src/game/business/ceo-edge'
import { formGroup, groupBiz } from '../src/game/business/conglomerate-actions'
import { groupsOf, liveGroup, readMembership, saveGroup } from '../src/game/business/conglomerate-state'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { HEAVY_ODDS_X } from '../src/game/business/heavy-effort'
import { heavyOdds, heavyQuality, heavyQuote, heavyTask, heavyWhy, heavyWhyLine, heavyYears } from '../src/game/business/heavy-rd'
import { OPS_TIER, RUNG_PENALTY } from '../src/game/business/lab-data'
import { opsOdds, opsQuote, opsWhy, opsWhyLine } from '../src/game/business/lab-rules'
import { startOps } from '../src/game/business/lab-year'
import { classicIdeas } from '../src/game/business/products'
import { launchP, rdCost, rdOf, rdQuote, researchState } from '../src/game/business/rd'
import { researchActor, researchInputs, withCeoEdge } from '../src/game/business/research-effort'
import { bizOf, readBiz, type BizState } from '../src/game/business/state'
import { clampN } from '../src/game/business/util'
import { statementLines, yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { quote } from '../src/game/effort/engine'
import { flowsOf } from '../src/game/kernel/ledger'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState, NoticeModal } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { hasColonJoin } from '../scripts/voice/rules.mjs'
import { ceoSlack } from './ceo-edge-kit'
import { parityDiff, probe, setCompany, TOL, tradeFixture } from './effort-parity-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { noDraw } from './lab-kit'
import { expectConserved } from './ledger-kit'

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const LIFE = [7, 2030] as const
const LINE = /^Kept the lab steady\. Research odds run (\d) points? better\.$/

type Fixture = { g: GameState; a: Asset; b: BizState }

/** A restaurant at the default actor (ambition 50, steady, fatigue 0) with a hired manager of `skill`, a research team of `scientists` and `projects` projects going. */
function hired(skill: number, scientists = 0, projects = 0): Fixture {
  const f = tradeFixture('restaurant', LIFE)
  setCompany(f.g, f.b, { manager: skill, quality: 50, scientists, staff: 0, projects })
  return f
}

const ceoLine = (why: readonly { key: string; label: string; pts: number }[]) => why.filter((x) => x.key === 'ceo')
const idea = (f: Fixture): string => classicIdeas(f.g, f.b)[0]!

describe('the ramp (business/ceo-edge.ts)', () => {
  it('is nothing at 90 and below, half at 95, the whole at 100 and never more', () => {
    expect(TOP_CEO_MAX_PTS).toBe(3)
    for (const skill of [0, 20, 50, 75, 85, 89, 90]) expect(topCeoSteady(skill), String(skill)).toBe(0)
    expect(topCeoSteady(95)).toBe(0.5)
    expect(topCeoSteady(100)).toBe(1)
    expect(topCeoSteady(100_000)).toBe(1)
    expect(topCeoSteady(Infinity)).toBe(1)
    let last = 0
    for (let skill = 0; skill <= 100; skill++) {
      const s = topCeoSteady(skill)
      expect(s, String(skill)).toBeGreaterThanOrEqual(last)
      expect(s).toBeLessThanOrEqual(1)
      last = s
    }
  })

  it('reads a skill that is not a number as nothing, and turns the steadiness into odds points, 0 to 3', () => {
    for (const bad of [Number.NaN, -5, -Infinity, undefined, '99', null]) expect(topCeoSteady(bad as unknown as number), String(bad)).toBe(0)
    expect(topCeoPts(0)).toBe(0)
    expect(topCeoPts(0.5)).toBe(1.5)
    expect(topCeoPts(1)).toBe(3)
    expect(topCeoPts(7)).toBe(3)
    expect(topCeoPts(Infinity)).toBe(3)
    expect(topCeoPts(-1)).toBe(0)
    expect(topCeoPts(Number.NaN)).toBe(0)
  })

  it('keeps no drive or calm term: the benefit is odds points and nothing else', async () => {
    const edge = await import('../src/game/business/ceo-edge')
    expect(Object.keys(edge).sort()).toEqual(['TOP_CEO_MAX_PTS', 'topCeoPts', 'topCeoSteady'])
  })
})

describe('a top hired CEO shows as a named line of the odds', () => {
  it('Heavy: a skill-100 manager has one "steady CEO" line of 3 points, a 95 has half, a 90 and an 89 have none', () => {
    for (const [skill, pts] of [[100, 3], [95, 1.5], [90, 0], [89, 0], [60, 0], [20, 0]] as const) {
      const { g, b } = hired(skill, 2)
      const lines = ceoLine(heavyWhy(g, b))
      if (pts === 0) expect(lines, String(skill)).toEqual([])
      else {
        expect(lines, String(skill)).toHaveLength(1)
        expect(lines[0]!.label).toBe('steady CEO')
        expect(lines[0]!.pts).toBeCloseTo(pts, 12)
        expect(lines[0]!.pts).toBeLessThanOrEqual(3)
      }
    }
  })

  it('Operations: the same line on every rung, at most 3 points', () => {
    for (const [skill, pts] of [[100, 3], [95, 1.5], [90, 0], [89, 0]] as const) {
      const { g, b } = hired(skill, 1)
      for (const rung of [1, 2, 3] as const) {
        const lines = ceoLine(opsWhy(g, b, rung, 'cost'))
        if (pts === 0) expect(lines, `${skill}/${rung}`).toEqual([])
        else expect(lines.map((x) => x.pts), `${skill}/${rung}`).toEqual([pts])
      }
    }
  })

  it('product R&D: the quote of an idea has it, and a manager rated 80 does not', () => {
    const f = hired(100, 1)
    const q = rdQuote(f.g, f.b, idea(f), rdCost(f.b, idea(f)))
    expect(ceoLine(q.why).map((x) => x.pts)).toEqual([3])
    const low = hired(80, 1)
    expect(ceoLine(rdQuote(low.g, low.b, idea(low), rdCost(low.b, idea(low))).why)).toEqual([])
  })

  it('the odds line the player reads says "steady CEO +3" for a 100 and nothing of the kind for an 80', () => {
    const { g, b } = hired(100, 0)
    expect(heavyWhyLine(g, b)).toMatch(/steady CEO \+3/)
    expect(opsWhyLine(g, b, 2, 'cost')).toMatch(/steady CEO \+3/)
    expect(DASH.test(heavyWhyLine(g, b))).toBe(false)
    const plain = hired(80, 0)
    expect(heavyWhyLine(plain.g, plain.b)).not.toMatch(/steady CEO/)
  })

  it('an owner-run company has none, even with a stored manager of 100 (the owner runs it)', () => {
    const { g, b } = hired(100, 0)
    b.ceo = 'owner'
    expect(researchState(g, b).steady ?? 0).toBe(0)
    expect(ceoLine(heavyWhy(g, b))).toEqual([])
    expect(ceoLine(opsWhy(g, b, 1, 'cost'))).toEqual([])
  })

  it('an NPC company (no asset) has none: nothing the player does not own is lifted', () => {
    const f = hired(100, 0)
    expect(ceoLine(heavyWhy(f.g, f.b, undefined, null))).toEqual([])
    expect(ceoLine(heavyWhy(f.g, f.b))).toHaveLength(1)
    expect(researchActor(f.g, researchState(f.g, f.b), null).ceo).toBeNull()
  })

  it('the actor carries the line for a hired CEO and not for the owner', () => {
    const f = hired(100, 0)
    expect(researchActor(f.g, researchState(f.g, f.b), f.a).ceo).toEqual({ key: 'ceo', label: 'steady CEO', pts: 3 })
    setCompany(f.g, f.b, { quality: 50, scientists: 0, staff: 0, projects: 0 })
    expect(researchActor(f.g, researchState(f.g, f.b), f.a).ceo).toBeNull()
  })
})

describe('the line is real: the odds move by exactly it, and the price, the years and the quality do not', () => {
  it('Heavy at skill 100 is the legacy odds plus 3 points (until the clamp), at 95 plus 1.5, at 92 plus .6, at 89 plus nothing', () => {
    for (const scientists of [0, 2, 5]) {
      for (const [skill, pts] of [[100, 3], [95, 1.5], [92, 0.6], [89, 0], [50, 0]] as const) {
        const { g, b } = hired(skill, scientists)
        const legacy = Math.min(0.6, Math.max(0.08, HEAVY_ODDS_X * launchP(g, b)))
        expect(heavyOdds(g, b), `${skill}/${scientists}`).toBeCloseTo(Math.min(0.6, legacy + pts / 100), 12)
      }
    }
  })

  it('Operations at skill 100 is the legacy odds plus 3 points, kept under the legacy ceiling of 92%', () => {
    for (const [tier, trade] of [['low', 'restaurant'], ['mid', 'brewery'], ['high', 'software']] as const) {
      const f = tradeFixture(trade, LIFE)
      for (const skill of [100, 95, 60]) {
        setCompany(f.g, f.b, { manager: skill, quality: 50, scientists: 1, staff: 0, projects: 0 })
        for (const rung of [1, 2, 3] as const) {
          const legacy = clampN(0.9 * launchP(f.g, f.b) + OPS_TIER[tier].odds - RUNG_PENALTY[rung - 1]!, 0.15, 0.92)
          const want = Math.min(0.92, legacy + (TOP_CEO_MAX_PTS * topCeoSteady(skill)) / 100)
          expect(opsOdds(f.g, f.b, rung), `${tier}/${skill}/${rung}`).toBeCloseTo(want, 12)
        }
      }
    }
  })

  it('product R&D at skill 100 moves by 3 points at every budget, half a cost to four times it, and never past the legacy clamp', () => {
    const f = hired(100, 1)
    const cost = rdCost(f.b, idea(f))
    const base = launchP(f.g, f.b)
    for (const budget of [0.5, 0.75, 1, 1.5, 2, 3, 4]) {
      const q = rdQuote(f.g, f.b, idea(f), Math.round(cost * budget))
      const legacy = Math.min(0.95, Math.max(0.05, 1 - (1 - base) * Math.pow(q.k, -0.4)))
      expect(q.odds, String(budget)).toBeCloseTo(Math.min(0.95, legacy + 0.03), 9)
      expect(q.odds).toBeLessThanOrEqual(0.95)
    }
  })

  it('withCeoEdge changes the odds and the lines and nothing else: the price, the years, the quality, the budget', () => {
    const f = hired(100, 3)
    const s = researchState(f.g, f.b)
    const task = heavyTask(f.g, f.b)
    const plain = quote(f.g, task, researchInputs(f.g, s, f.a, task.field, 1))
    const edged = quote(f.g, task, withCeoEdge(researchInputs(f.g, s, f.a, task.field, 1), s, true, task))
    expect(edged.spend).toBe(plain.spend)
    expect(edged.years).toBe(plain.years)
    expect(edged.yearsExact).toBe(plain.yearsExact)
    expect(edged.quality).toBe(plain.quality)
    expect(edged.k).toBe(plain.k)
    expect((edged.p - plain.p) * 100).toBeCloseTo(3, 9)
    expect(ceoLine(edged.reasons)).toHaveLength(1)
    expect(ceoLine(plain.reasons)).toEqual([])
  })

  it('withCeoEdge adds about its 3 points on top of know-how, a bold plan and a tired maker, never a lot more', () => {
    const f = hired(100, 2)
    const s = researchState(f.g, f.b)
    const task = heavyTask(f.g, f.b)
    for (const extra of [{ knowledge: 40 }, { knowledge: 100 }, { fatigue: 60 }, { ambition: 90, posture: 'push' as const }, { rival: 6, spill: 10 }]) {
      const input = { ...researchInputs(f.g, s, f.a, task.field, 1), ...extra }
      const plain = quote(f.g, task, input)
      const edged = quote(f.g, task, withCeoEdge(input, s, true, task))
      const moved = (edged.p - plain.p) * 100
      // Where the odds already sit at the task's own ceiling (know-how at its most) there is nothing left to add.
      if (plain.p < task.oddsHi - 0.05) expect(moved, JSON.stringify(extra)).toBeGreaterThan(1.5)
      expect(moved, JSON.stringify(extra)).toBeGreaterThanOrEqual(0)
      expect(moved, JSON.stringify(extra)).toBeLessThanOrEqual(3.5)
    }
  })

  it('withCeoEdge returns an input it has no edge for as it is, and a copy otherwise: the caller’s object is never changed', () => {
    const low = hired(70, 1)
    const sl = researchState(low.g, low.b)
    const tl = heavyTask(low.g, low.b)
    const input = researchInputs(low.g, sl, low.a, tl.field, 1)
    expect(withCeoEdge(input, sl, true, tl)).toBe(input)
    const top = hired(100, 1)
    const st = researchState(top.g, top.b)
    const tt = heavyTask(top.g, top.b)
    const raw = deepFreeze(researchInputs(top.g, st, top.a, tt.field, 1))
    expect(withCeoEdge(raw, st, false, tt)).toBe(raw)
    const out = withCeoEdge(raw, st, true, tt)
    expect(out).not.toBe(raw)
    expect(raw.baseTerms ?? []).toEqual([])
    expect(raw.base).toBeUndefined()
    expect(out.baseTerms).toEqual([{ key: 'ceo', label: 'steady CEO', pts: 3 }])
  })

  it('the quality and the years of a breakthrough are the same for a 100 as for a 60', () => {
    const top = hired(100, 3)
    const mid = hired(60, 3)
    expect(heavyYears(top.b)).toBe(heavyYears(mid.b))
    expect(heavyQuality(top.g, top.b)).toBeGreaterThanOrEqual(heavyQuality(mid.g, mid.b))
    expect(heavyQuote(top.g, top.b).spend).toBe(heavyQuote(mid.g, mid.b).spend)
  })
})

describe('parity with v5.0.0: the rows of a hired manager rated 90 or more sit above by at most 3 points, nothing else moves', () => {
  for (const system of ['rd', 'heavy', 'ops'] as const) {
    it(`${system}: the whole grid passes with the slack, and only the odds of the rows of skill 90 and up differ without it`, () => {
      const rows = probe(system)
      expect(parityDiff(system, rows, TOL, ceoSlack)).toEqual([])
      const loose = parityDiff(system, rows, TOL)
      expect(loose.length, 'the edge is real: some top-CEO rows are above the oracle by more than a point').toBeGreaterThan(0)
      for (const line of loose) expect(line, line).toMatch(/skill=(?:100|9\d)\b.*: odds /)
    })
  }
})

describe('a division under an autonomous group CEO', () => {
  function group(opts: { groupSkill: number; autonomous: boolean; divisionSkill: number; owner?: boolean }): Fixture {
    const g = makeTestGame(937, { age: 50, money: 1e9 })
    g.year = 2026
    const assets = [0, 1].map((i) => {
      const b = newBiz(g, 'solar', 'us', 'Chicago', { cash: 20e6, founded: 2018, outlets: [{ countryId: 'us', city: 'Chicago', count: 10, opened: 2018 }] })
      b.valuation = 40e6
      const a = createBusinessAsset(g, `Division ${i}`, b, 1e6)
      g.assets.push(a)
      installManager(g, bizOf(g, a), managerCandidate(g, b, opts.divisionSkill))
      return a
    })
    expect(formGroup(g, assets.map((a) => a.id), 'Steady Group')).toBe(true)
    const id = groupsOf(g)[0]!.core.id
    const grp = liveGroup(g, id)!
    grp.core.ceo = 'manager'
    grp.core.manager = managerCandidate(g, groupBiz(g, grp), opts.groupSkill)
    grp.core.autonomous = opts.autonomous
    saveGroup(g, grp)
    g.queue = []
    const a = assets[0]!
    const b = bizOf(g, a)
    if (opts.owner) b.ceo = 'owner'
    return { g, a, b }
  }
  const lineOf = (f: Fixture): number[] => ceoLine(heavyQuote(f.g, f.b, undefined, f.a).reasons).map((x) => x.pts)

  it('has the line from the group CEO rated 100, whatever the division’s own manager is rated', () => {
    const f = group({ groupSkill: 100, autonomous: true, divisionSkill: 20 })
    expect(readMembership(f.b.group, f.b.share)?.core.manager?.skill).toBe(100)
    expect(f.b.manager!.skill).toBe(20)
    expect(lineOf(f)).toEqual([3])
  })

  it('has half of it from a group CEO rated 95, and the better of the two when the division’s own manager is the top one', () => {
    expect(lineOf(group({ groupSkill: 95, autonomous: true, divisionSkill: 20 }))).toEqual([1.5])
    expect(lineOf(group({ groupSkill: 95, autonomous: true, divisionSkill: 100 }))).toEqual([3])
  })

  it('has none when the group CEO is not autonomous, or is rated 90 or below', () => {
    expect(lineOf(group({ groupSkill: 100, autonomous: false, divisionSkill: 20 }))).toEqual([])
    expect(lineOf(group({ groupSkill: 90, autonomous: true, divisionSkill: 20 }))).toEqual([])
  })

  it('never covers a division the player runs personally', () => {
    expect(lineOf(group({ groupSkill: 100, autonomous: true, divisionSkill: 20, owner: true }))).toEqual([])
  })
})

describe('no money moves', () => {
  // The trades of test/no-ceo-mint.test.ts, with the same seeds: the cash identity below holds for them (deep-tech firms draw venture money).
  const INDUSTRIES: Industry[] = ['manufacturing', 'gameStudio', 'solar', 'logistics']

  function firm(i: number): { g: GameState; a: Asset } {
    const g = makeTestGame(900 + i, { age: 40, money: 0 })
    const b0 = newBiz(g, INDUSTRIES[i % INDUSTRIES.length]!, 'us', 'Chicago', { cash: 20e6, founded: g.year - 5, valuation: 25e6, quality: 80, morale: 90 })
    installManager(g, b0, managerCandidate(g, b0, 100))
    b0.manager!.equity = 0.1
    const a = createBusinessAsset(g, `Steady ${i}`, b0, 1e6)
    g.assets.push(a)
    const b = bizOf(g, a)
    b.debt = (i + 1) * 20e6
    b.debtRate = 0.5
    return { g, a }
  }

  it('twenty seeded firms with a skill-100 manager and research going book what the books say for five years', () => {
    let lined = 0
    for (let i = 0; i < 20; i++) {
      const { g, a } = firm(i)
      for (let y = 0; y < 5; y++) {
        g.year++
        g.character.age++
        const before = bizOf(g, a)
        const cash = before.cash
        const debt = before.debt
        yearlyBusinessImpl(g)
        const after = readBiz(g, a)
        const at = `firm ${i} year ${y}`
        expect(after.last!.strategicIncome, at).toBeUndefined()
        expect(statementLines(after, after.last!).map((l) => l.label).join('|'), at).not.toMatch(/foresight|strategic|steady/i)
        expect(after.cash - cash, at).toBeLessThanOrEqual(after.last!.net + Math.max(0, after.debt - debt) + 1)
        for (const r of flowsOf(g, g.year)) expect(String(r.reason), at).not.toMatch(/foresight|steady|strategic/i)
        expectConserved(g)
        if (ceoLine(heavyQuote(g, after, undefined, a).reasons).length === 1) lined++
      }
      const lines = g.log.flatMap((year) => year.entries.map((e) => e.text))
      expect(lines.filter((t) => /strategic trading|foresight/i.test(t)), `firm ${i}`).toEqual([])
    }
    expect(lined, 'the edge was on the quote of the firms that could research').toBeGreaterThan(50)
  }, 240_000)
})

describe('the CEO’s letter', () => {
  function company(skill: number, seed: number): { g: GameState; a: Asset; b: BizState } {
    const g = createNewLife({ seed, year: 1990, countryId: 'us' })
    g.queue = []
    g.character.age = 36
    g.year = 2026
    g.character.money = 1_000_000
    g.character.talent = null
    g.character.talents = []
    const city = getCountry('us').cities[0]!
    const b0 = newBiz(g, 'restaurant', 'us', city, { cash: 2_000_000, founded: 2020, outlets: [{ countryId: 'us', city, count: 6, opened: 2020 }] })
    const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
    g.assets.push(a)
    becomeCeo(g, a, b0)
    const b = bizOf(g, a)
    const plan = bestPlan(g, b)
    b.price = plan.price
    b.production = plan.production
    stepDown(g, a, b, { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill, salary: askingSalary(b, skill), since: g.year, style: 'steady', integrity: 100 })
    g.queue = []
    // A project already going, so the year's letter has research to speak of whatever the CEO starts.
    rdOf(b).push({ id: 'rd-test', name: classicIdeas(g, b)[0]!, budget: 10_000, years: 3, progress: 0, odds: 0.5, boost: 0, quality: 50, started: g.year })
    return { g, a, b }
  }

  const bullets = (g: GameState, a: Asset): string[] => {
    const popup = g.queue.find((m): m is NoticeModal => m.kind === 'notice' && m.title === `${a.name}: Letter from the CEO`)
    return popup ? popup.text.split('\n').filter((x) => x.startsWith('\u{2022} ')).map((x) => x.slice(2)) : [...boardOf(bizOf(g, a)).memo]
  }

  it('a skill-100 CEO with research going writes the line once, in the voice, in 12 words or fewer', () => {
    const { g, a } = company(100, 31)
    yearlyBusinessImpl(g)
    expect(boardOf(bizOf(g, a)).letter).toBe(g.year)
    const lines = bullets(g, a).filter((x) => /^Kept the lab steady/.test(x))
    expect(lines).toEqual(['Kept the lab steady. Research odds run 3 points better.'])
    expect(lines[0]).toMatch(LINE)
    expect(lines[0]!.split(/\s+/).length).toBeLessThanOrEqual(12)
    expect(hasColonJoin(lines[0]!)).toBe(false)
    expect(DASH.test(lines[0]!)).toBe(false)
  })

  it('a skill-88 and a skill-90 CEO write no such line', () => {
    for (const skill of [88, 90]) {
      const { g, a } = company(skill, 31)
      yearlyBusinessImpl(g)
      expect(bullets(g, a).filter((x) => /Kept the lab steady/.test(x)), String(skill)).toEqual([])
    }
  })

  it('steadyLetterLine is null without research going, and null for an edge under half a point', () => {
    const f = hired(100, 0, 0)
    expect(steadyLetterLine(f.g, f.b)).toBeNull()
    setCompany(f.g, f.b, { manager: 100, quality: 50, scientists: 0, staff: 0, projects: 1 })
    expect(steadyLetterLine(f.g, f.b)).toBe('Kept the lab steady. Research odds run 3 points better.')
    f.b.manager!.skill = 91
    expect(steadyLetterLine(f.g, f.b)).toBeNull()
    f.b.manager!.skill = 92
    expect(steadyLetterLine(f.g, f.b)).toBe('Kept the lab steady. Research odds run 1 point better.')
    f.b.ceo = 'owner'
    expect(steadyLetterLine(f.g, f.b)).toBeNull()
  })

  it('a program in the lab counts as research going', () => {
    const f = hired(100, 0, 0)
    expect(steadyLetterLine(f.g, f.b)).toBeNull()
    expect(startOps(f.g, f.a, f.b, 'ops.cost.1', true)).not.toBeNull()
    expect(steadyLetterLine(f.g, f.b)).toMatch(LINE)
  })

  it('the whole letter still fits the memo', () => {
    const { g, a, b } = company(100, 6)
    smartManagerTurn(g, a, b)
    expect(boardOf(b).memo.length).toBeLessThanOrEqual(12)
    expect(boardOf(b).memo).toContain('Kept the lab steady. Research odds run 3 points better.')
  })
})

describe('reading is free', () => {
  it('quotes, the actor, the state of a company and the letter line draw nothing', () => {
    const f = hired(100, 2, 1)
    const s = researchState(f.g, f.b)
    expect(noDraw(f.g, () => researchState(f.g, f.b))).toBe(true)
    expect(noDraw(f.g, () => researchActor(f.g, s, f.a))).toBe(true)
    expect(noDraw(f.g, () => heavyWhy(f.g, f.b))).toBe(true)
    expect(noDraw(f.g, () => opsQuote(f.g, f.b, 1, 'cost'))).toBe(true)
    expect(noDraw(f.g, () => rdQuote(f.g, f.b, idea(f), rdCost(f.b, idea(f))))).toBe(true)
    expect(noDraw(f.g, () => steadyLetterLine(f.g, f.b))).toBe(true)
  })

  it('a deep-frozen state reads fine', () => {
    const f = hired(100, 2, 1)
    deepFreeze(f.g)
    expect(ceoLine(heavyWhy(f.g, f.b))).toHaveLength(1)
    expect(ceoLine(opsWhy(f.g, f.b, 3, 'cost'))).toHaveLength(1)
    expect(steadyLetterLine(f.g, f.b)).toMatch(LINE)
  })
})
