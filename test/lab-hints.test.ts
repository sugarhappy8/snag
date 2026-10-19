// Purple hints and the hired CEO's moves (R&D 3.0 task 6): every start, patent and hire row on the
// Research & Operations screen shows what its own rule says it is worth, the hired CEO picks the
// move the hint calls best and pays for it through the board's budget, and nothing here rolls a die.
// Fixed seeds; brewery is mid tier (cap 4 scientists, three rungs), restaurant low. With 40 sites the
// cost and quality programs pay and the output programs do not (the company is not short of capacity).
import { describe, expect, it, vi } from 'vitest'
import * as board from '../src/game/business/board'
import { boardOf } from '../src/game/business/board-state'
import { capexLeft, reserveDollars } from '../src/game/business/board-vote'
import { askingSalary, stepDown } from '../src/game/business/career'
import * as economy from '../src/game/business/economy'
import { bizWorth } from '../src/game/business/economy'
import { smartManagerTurn } from '../src/game/business/board-ceo'
import { OPS_PROGRAMS, opsProgram } from '../src/game/business/lab-data'
import { labMenus } from '../src/game/business/lab-menu'
import * as rules from '../src/game/business/lab-rules'
import { bestLabMove, opsBlock, opsOffers, opsPrice, opsValue, patentableFamilies, patentBlock, patentTerms, patentValue, teamBlock, teamValue, type LabMove } from '../src/game/business/lab-rules'
import { readLab, type LabPatent, type LabProgram } from '../src/game/business/lab-state'
import { bizOf, readBiz, type BizState, type CeoStyle } from '../src/game/business/state'
import { money } from '../src/game/business/util'
import type { Mandate } from '../src/game/business/board-state'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import type { Industry } from '../src/game/data/markets'
import { deepFreeze, labGame, launchBreakthrough, noDraw, PATENT_COUNTRY, PATENT_TRADE, patchLab } from './lab-kit'

const exact = (v: number): number => v
const NO_PAY = "Doesn't pay back now"

/** The Research & Operations screen's rows, read fresh. */
function rows(g: GameState, a: Asset): MenuNode[] {
  return (labMenus(a, readBiz(g, a))[0] as MenuGroup).children(g)
}

function actions(g: GameState, a: Asset): MenuAction[] {
  return rows(g, a).filter((n): n is MenuAction => n.type === 'action')
}

function row(g: GameState, a: Asset, key: string): MenuAction {
  return actions(g, a).find((n) => n.id === `biz.mkt.${key}.${a.id}`)!
}

const slug = (family: string): string => family.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/** Every row's text (label, subtitle, hint, reason): what the screen shows. */
function textOf(g: GameState, n: MenuNode): string {
  if (n.type === 'info') return typeof n.text === 'function' ? n.text(g) : n.text
  if (n.type === 'heading') return n.label
  return [n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''), n.hint?.(g) ?? '', n.disabledReason?.(g) ?? ''].join('\n')
}

/** A rich mid-tech company: 40 sites, so the cost and quality programs pay. */
function rich(seed: number, opts: { country?: string; cash?: number; industry?: Industry } = {}): { g: GameState; a: Asset; b: BizState } {
  const { industry, ...rest } = opts
  return labGame(seed, industry ?? 'brewery', { outlets: 40, ...rest })
}

/** A held patent that is not a real family: only the book and the count matter to the screen. */
function held(g: GameState, n: number): LabPatent {
  return { family: `Held Thing ${n}`, filed: g.year - 1, until: g.year + 5, mode: 'hold', lic: 0, plan: 100_000, book: 60_000, earned: 0 }
}

describe('the hints on the Research & Operations screen', () => {
  it('the best row hint shows the number bestLabMove names', () => {
    const { g, a, b } = rich(41)
    const w = bizWorth(g, b)
    const move = bestLabMove(g, b, b.cash, w, exact)
    expect(move?.kind).toBe('ops')
    const best = move as Extract<LabMove, { kind: 'ops' }>
    const hint = row(g, a, `lab.ops.${best.id}`).hint?.(g) ?? ''
    expect(hint).toContain(money(best.value))
    expect(hint).toContain('over 8 years')
    // Every program row says what opsValue says: the money when it pays, one plain sentence when it does not.
    let paying = 0
    let flat = 0
    for (const p of opsOffers(g, b)) {
      const v = opsValue(g, b, p.id, w)
      const text = row(g, a, `lab.ops.${p.id}`).hint?.(g) ?? ''
      if (v > 0) {
        paying++
        expect(text).toContain(money(v))
      } else {
        flat++
        expect(text).toContain(NO_PAY)
      }
    }
    expect(paying).toBeGreaterThan(0)
    expect(flat).toBeGreaterThan(0)
  })

  it('a patent row names its better way and the number patentValue gives', () => {
    const { g, a, b } = rich(41, { industry: PATENT_TRADE, country: PATENT_COUNTRY })
    const fam = launchBreakthrough(g, a, b)
    const w = bizWorth(g, b)
    const pv = patentValue(g, b, fam, w)
    expect(pv.value).toBeGreaterThan(0)
    expect(pv.mode).toBe('hold')
    const move = bestLabMove(g, b, b.cash, w, exact)
    expect(move).toMatchObject({ kind: 'patent', family: fam, mode: 'hold' })
    const hint = row(g, a, `lab.patent.${slug(fam)}`).hint?.(g) ?? ''
    expect(hint).toContain('Keep it exclusive')
    expect(hint).toContain(money((move as LabMove).value))
    // The licence reading is named too (the value the rule gives, in the mode it prefers).
    const spy = vi.spyOn(rules, 'patentValue').mockReturnValue({ value: 5_000, mode: 'license', hold: 100, license: 5_300, fee: 300 })
    try {
      b.cash += 1 // a new company state: the cached reading is not reused
      const text = row(g, a, `lab.patent.${slug(fam)}`).hint?.(g) ?? ''
      expect(text).toContain('License it')
      expect(text).toContain(money(5_000))
      spy.mockReturnValue({ value: -300, mode: 'hold', hold: 0, license: 0, fee: 300 })
      b.cash += 1
      expect(row(g, a, `lab.patent.${slug(fam)}`).hint?.(g) ?? '').toContain(NO_PAY)
    } finally {
      spy.mockRestore()
    }
  })

  it('the hire row says what a scientist adds against the pay, or that it does not pay', () => {
    const { g, a, b } = rich(41)
    const tv = teamValue(g, b, bizWorth(g, b))
    expect(tv.value).toBeGreaterThan(0)
    const text = row(g, a, 'lab.hire').hint?.(g) ?? ''
    expect(text).toContain(money(tv.gain))
    expect(text).toContain(money(tv.pay))
    // One site: a scientist does not earn the pay back.
    const small = labGame(41, 'brewery')
    expect(teamValue(small.g, small.b).value).toBeLessThanOrEqual(0)
    expect(row(small.g, small.a, 'lab.hire').hint?.(small.g) ?? '').toContain(NO_PAY)
    // Letting one go has no hint: it spends the fee and gains nothing.
    expect(row(g, a, 'lab.release').hint).toBeUndefined()
  })

  it('a row that cannot start for another reason than cash shows no hint', () => {
    const { g, a, b } = rich(42)
    patchLab(b, (d) => {
      d.programs = [{ id: 'ops.cost.1', started: g.year, years: 3, progress: 0, odds: 0.5, price: 60_000, grant: 0 }]
    })
    expect(opsBlock(g, b, 'ops.cost.2', true)).not.toBeNull()
    expect(row(g, a, 'lab.ops.ops.cost.2').hint?.(g) ?? '').toBe('')
    expect(opsBlock(g, b, 'ops.quality.2', true)).toBeNull()
    expect(row(g, a, 'lab.ops.ops.quality.2').hint?.(g) ?? '').not.toBe('')
  })

  it('hints are gated by talent and by the right to manage', () => {
    const { g, a, b } = rich(43)
    launchBreakthrough(g, a, b)
    const hinted = (): string[] => actions(g, a).filter((n) => /^biz\.mkt\.lab\.(ops|patent|hire)/.test(n.id)).map((n) => n.hint?.(g) ?? '')
    expect(hinted().length).toBeGreaterThan(3)
    expect(hinted().every((h) => h.length > 0)).toBe(true)
    // No Business talent: every hint is empty.
    g.character.talents = []
    g.character.talent = null
    expect(actions(g, a).every((n) => !n.hint || !n.hint(g))).toBe(true)
    g.character.talents = ['Business']
    expect(hinted().some((h) => h.length > 0)).toBe(true)
    // Talent, but the right to manage the company is gone (prison): none.
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    expect(actions(g, a).every((n) => !n.hint || !n.hint(g))).toBe(true)
    g.character.prison = null
  })

  it('no value rolls a die', () => {
    const { g, a, b } = rich(44)
    launchBreakthrough(g, a, b)
    const w = bizWorth(g, b)
    const fam = patentableFamilies(g, b)[0]
    expect(noDraw(g, () => opsValue(g, b, 'ops.cost.2', w))).toBe(true)
    expect(noDraw(g, () => teamValue(g, b, w))).toBe(true)
    expect(noDraw(g, () => patentValue(g, b, fam, w))).toBe(true)
    expect(noDraw(g, () => bestLabMove(g, b, b.cash, w, exact))).toBe(true)
    expect(noDraw(g, () => rows(g, a).map((n) => textOf(g, n)))).toBe(true)
    // A deep-frozen state: nothing throws (so nothing writes) and the stream stays put.
    const frozen = deepFreeze(structuredClone(g))
    const fa = frozen.assets.find((x) => x.id === a.id)!
    const fb = readBiz(frozen, fa)
    const rng = frozen.rng
    expect(() => {
      const fw = bizWorth(frozen, fb)
      opsValue(frozen, fb, 'ops.quality.2', fw)
      teamValue(frozen, fb, fw)
      patentValue(frozen, fb, fam, fw)
      bestLabMove(frozen, fb, fb.cash, fw, exact)
      rows(frozen, fa).map((n) => textOf(frozen, n))
    }).not.toThrow()
    expect(frozen.rng).toBe(rng)
  })

  it('hints are cached per company state and a full screen is cheap [RF5]', () => {
    const { g, a, b } = rich(45)
    const fam = launchBreakthrough(g, a, b)
    expect(patentableFamilies(g, b)).toContain(fam)
    const render = (): string[] => rows(g, a).map((n) => textOf(g, n))
    const counts = () => [ops.mock.calls.length, pat.mock.calls.length, team.mock.calls.length, worth.mock.calls.length]
    const ops = vi.spyOn(rules, 'opsValue')
    const pat = vi.spyOn(rules, 'patentValue')
    const team = vi.spyOn(rules, 'teamValue')
    const worth = vi.spyOn(economy, 'bizWorth')
    try {
      const first = render()
      const [o1, p1, t1, w1] = counts()
      const startable = opsOffers(g, b).filter((p) => opsBlock(g, b, p.id, true) === null).length
      expect(o1).toBeGreaterThan(0)
      expect(o1).toBeLessThanOrEqual(startable)
      expect(p1).toBeGreaterThan(0)
      expect(p1).toBeLessThanOrEqual(patentableFamilies(g, b).length)
      expect(t1).toBe(1)
      expect(w1).toBeLessThanOrEqual(1)
      // The same state again: no hint is worked out twice.
      const second = render()
      expect(second).toEqual(first)
      expect(counts()).toEqual([o1, p1, t1, w1])
      // A changed company state recomputes.
      b.cash += 1
      render()
      const [o3, p3, t3] = counts()
      expect(o3).toBeGreaterThan(o1)
      expect(p3).toBeGreaterThan(p1)
      expect(t3).toBeGreaterThan(t1)
    } finally {
      ops.mockRestore()
      pat.mockRestore()
      team.mockRestore()
      worth.mockRestore()
    }
  })

  it('the fullest screen (3 programs, 6 patents, 6 scientists) renders twice and the second costs nothing [RF5]', () => {
    const { g, a, b } = rich(46)
    launchBreakthrough(g, a, b)
    patchLab(b, (d) => {
      d.programs = (['cost', 'yield', 'quality'] as const).map((t, i): LabProgram => ({ id: `ops.${t}.1`, started: g.year, years: 3, progress: i, odds: 0.5, price: 60_000, grant: 0 }))
      d.patents = Array.from({ length: 6 }, (_, i) => held(g, i))
      d.team = Array.from({ length: 6 }, () => g.year - 4)
    })
    expect(readLab(b).programs).toHaveLength(3)
    expect(readLab(b).patents).toHaveLength(6)
    expect(readLab(b).team).toHaveLength(6)
    const render = (): string => rows(g, a).map((n) => textOf(g, n)).join('\n')
    const ops = vi.spyOn(rules, 'opsValue')
    const pat = vi.spyOn(rules, 'patentValue')
    const team = vi.spyOn(rules, 'teamValue')
    try {
      const first = render()
      const n = [ops.mock.calls.length, pat.mock.calls.length, team.mock.calls.length]
      expect(n[1]).toBeLessThanOrEqual(readLab(b).patents.length + patentableFamilies(g, b).length)
      expect(render()).toBe(first)
      expect([ops.mock.calls.length, pat.mock.calls.length, team.mock.calls.length]).toEqual(n)
    } finally {
      ops.mockRestore()
      pat.mockRestore()
      team.mockRestore()
    }
  })
})

/** A hired CEO of this style and skill 100 (so the judge is exact), on this mandate, with a budget that does not bind. */
function hireCeo(g: GameState, a: Asset, b: BizState, mandate: Mandate = 'growth', style: CeoStyle = 'steady'): void {
  stepDown(g, a, b, { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill: 100, salary: askingSalary(b, 100), since: g.year, style, integrity: 100 })
  const st = boardOf(b)
  st.mandate = mandate
  st.limits.capex = 1
  g.queue = []
}

/** The bullets of the CEO's letter this year: the popup's when there is one (the stored memo keeps twelve), else the memo. */
function letter(g: GameState, b: BizState): string[] {
  const popup = g.queue.find((m) => m.kind === 'notice' && m.title.endsWith('Letter from the CEO'))
  if (popup && popup.kind === 'notice') return popup.text.split('\n').filter((l) => l.startsWith('\u{2022} ')).map((l) => l.slice(2))
  return boardOf(b).memo
}

/** What the lab holds: programs, patents and scientists, as ids. */
function held_(b: BizState): string[] {
  const d = readLab(b)
  return [...d.programs.map((p) => p.id), ...d.patents.map((p) => `patent:${p.family}`)]
}

/** Runs `smartManagerTurn` with a recorder around bestLabMove: what the CEO asked for, got, and what the company looked like at each call. */
function turn(g: GameState, a: Asset, b: BizState): { calls: { avail: number; costOnly: boolean; move: LabMove | null; cash: number; costs: number; spent: number; held: string[] }[] } {
  const calls: { avail: number; costOnly: boolean; move: LabMove | null; cash: number; costs: number; spent: number; held: string[] }[] = []
  const orig = rules.bestLabMove
  const spy = vi.spyOn(rules, 'bestLabMove').mockImplementation((gg, bb, avail, w, judge, costOnly) => {
    const st = boardOf(bb)
    const move = orig(gg, bb, avail, w, judge, costOnly)
    calls.push({ avail, costOnly: costOnly === true, move, cash: bb.cash, costs: bb.yearCosts, spent: st.spentYear === gg.year ? st.spent : 0, held: held_(bb) })
    return move
  })
  try {
    smartManagerTurn(g, a, b)
  } finally {
    spy.mockRestore()
  }
  return { calls }
}

describe('the hired CEO', () => {
  it('takes the pick the hint calls best', () => {
    const { g, a, b } = rich(51)
    const before = structuredClone(g)
    const w0 = bizWorth(before, readBiz(before, before.assets.find((x) => x.id === a.id)!))
    const pre = bestLabMove(before, readBiz(before, before.assets.find((x) => x.id === a.id)!), b.cash, w0, exact)
    expect(pre?.kind).toBe('ops')
    hireCeo(g, a, b)
    const { calls } = turn(g, a, b)
    expect(calls.length).toBeGreaterThan(0)
    const first = calls[0].move as Extract<LabMove, { kind: 'ops' }>
    expect(first.id).toBe((pre as Extract<LabMove, { kind: 'ops' }>).id)
    expect(readLab(b).programs.map((p) => p.id)).toContain(first.id)
    const program = readLab(b).programs.find((p) => p.id === first.id)!
    expect(program.started).toBe(g.year)
    expect(program.price).toBe(opsPrice(b, program.id.endsWith('1') ? 1 : program.id.endsWith('2') ? 2 : 3))
    // The letter says so in a short line.
    const said = letter(g, b).filter((line) => /^Started /.test(line))
    expect(said).toContain(`Started ${opsProgram(first.id)!.label}.`)
    expect(said.every((line) => line.trim().split(/\s+/).length <= 12)).toBe(true)
  })

  it('files the patent when that is the best move, in the mode the value prefers', () => {
    const { g, a, b } = rich(52, { industry: PATENT_TRADE, country: PATENT_COUNTRY })
    const fam = launchBreakthrough(g, a, b)
    // Every Operations program has just been won (the three years' wait), so the patent is the one move left that can pay.
    patchLab(b, (d) => {
      for (const p of OPS_PROGRAMS) d.done[p.id] = g.year
    })
    const pv = patentValue(g, b, fam, bizWorth(g, b))
    expect(pv.value).toBeGreaterThan(0)
    hireCeo(g, a, b)
    const { calls } = turn(g, a, b)
    expect(calls[0].move).toMatchObject({ kind: 'patent', family: fam, mode: pv.mode })
    const filed = readLab(b).patents.find((p) => p.family === fam)
    expect(filed).toBeDefined()
    expect(filed!.mode).toBe(pv.mode)
    expect(readLab(b).filed).toContain(fam)
    const said = letter(g, b).filter((line) => /^Filed a patent/.test(line))
    expect(said.length).toBe(1)
    expect(said.every((line) => line.trim().split(/\s+/).length <= 12)).toBe(true)
  })

  it('the mandate limits the moves and a cash mandate makes none', () => {
    const limits: [Mandate, number][] = [['growth', 2], ['balanced', 1], ['profit', 1], ['cash', 0]]
    for (const [mandate, most] of limits) {
      const { g, a, b } = rich(53)
      launchBreakthrough(g, a, b)
      hireCeo(g, a, b, mandate)
      const { calls } = turn(g, a, b)
      expect(readLab(b).programs.length + readLab(b).patents.length, mandate).toBeLessThanOrEqual(most)
      expect(calls.length, mandate).toBeLessThanOrEqual(most)
      if (most > 0) expect(readLab(b).programs.length + readLab(b).patents.length, mandate).toBeGreaterThan(0)
      else expect(held_(b), mandate).toEqual([])
    }
  })

  it('a cost-cutter may add one cost-track program and nothing else', () => {
    const { g, a, b } = rich(54)
    hireCeo(g, a, b, 'balanced', 'costCutter')
    const { calls } = turn(g, a, b)
    // Balanced makes one move; the cost-cutter's extra is asked for as cost-only.
    expect(calls.length).toBeLessThanOrEqual(2)
    expect(calls.map((c) => c.costOnly)).toEqual(calls.map((_, i) => i >= 1))
    const moves = calls.map((c) => c.move).filter((m): m is LabMove => m !== null)
    for (const m of moves.slice(1)) expect(m).toMatchObject({ kind: 'ops', track: 'cost' })
    expect(readLab(b).programs.length + readLab(b).patents.length).toBeLessThanOrEqual(2)
    // A steady hand under the same mandate makes no extra call.
    const other = rich(54)
    hireCeo(other.g, other.a, other.b, 'balanced', 'steady')
    expect(turn(other.g, other.a, other.b).calls.length).toBeLessThanOrEqual(1)
  })

  it('costOnly keeps cost-track programs only', () => {
    const { g, a, b } = rich(55)
    launchBreakthrough(g, a, b)
    const w = bizWorth(g, b)
    const move = bestLabMove(g, b, b.cash, w, exact, true)
    expect(move).toMatchObject({ kind: 'ops', track: 'cost' })
    // With the cost track busy there is nothing left for it to take.
    patchLab(b, (d) => {
      d.programs = [{ id: 'ops.cost.1', started: g.year, years: 3, progress: 0, odds: 0.5, price: 60_000, grant: 0 }]
    })
    expect(bestLabMove(g, b, b.cash, w, exact, true)).toBeNull()
    expect(bestLabMove(g, b, b.cash, w, exact, false)).not.toBeNull()
    void a
  })

  it('every move is paid through the board budget and the reserve [RF3]', () => {
    const { g, a, b } = rich(56)
    launchBreakthrough(g, a, b)
    hireCeo(g, a, b, 'growth')
    const { calls } = turn(g, a, b)
    expect(calls.length).toBe(2)
    const st = boardOf(b)
    const [c1, c2] = calls
    const move = c1.move!
    expect(move).not.toBeNull()
    // The CEO asks with what the budget and the reserve leave, and nothing more.
    expect(c1.avail).toBeLessThanOrEqual(capexLeft(g, b, st) + (st.spentYear === g.year ? st.spent - c1.spent : 0))
    expect(move.price).toBeLessThanOrEqual(c1.avail)
    // Between the two calls only the first move happened: one payment, once, in cash, costs and budget.
    expect(c1.cash - c2.cash).toBe(move.price)
    expect(c2.costs - c1.costs).toBe(move.price)
    expect(c2.spent - c1.spent).toBe(move.price)
    expect(c2.held.length - c1.held.length).toBe(1)
    expect(c2.cash).toBeGreaterThanOrEqual(reserveDollars(b, st))
    // The price is the fee of a patent or the price of a program, the same number the owner would pay.
    if (move.kind === 'patent') expect(move.price).toBe(patentTerms(g, b, move.family).fee)
  })

  it('a board budget of nothing means no lab move at all', () => {
    const { g, a, b } = rich(57)
    launchBreakthrough(g, a, b)
    hireCeo(g, a, b, 'growth')
    boardOf(b).limits.capex = 0
    const { calls } = turn(g, a, b)
    expect(calls.every((c) => c.move === null)).toBe(true)
    expect(held_(b)).toEqual([])
  })

  it('a CEO with nothing worth starting draws nothing extra', () => {
    let calls = 0
    const counting = (v: number): number => {
      calls++
      return v
    }
    /** The candidates the CEO could take whose exact value is above 0: the only ones its judge may see. */
    const worth = (g: GameState, b: BizState, w: economy.Worth): number =>
      opsOffers(g, b).filter((p) => opsBlock(g, b, p.id, true) === null && opsPrice(b, p.rung) <= b.cash && opsValue(g, b, p.id, w) > 0).length +
      patentableFamilies(g, b).filter((f) => patentBlock(g, b, f, true) === null && patentTerms(g, b, f).fee <= b.cash && patentValue(g, b, f, w).value > 0).length
    // Nothing offered in 1901: no program has started yet and nothing is patentable.
    const old = labGame(58, 'restaurant', { year: 1900 })
    expect(opsOffers(old.g, old.b)).toHaveLength(0)
    expect(bestLabMove(old.g, old.b, old.b.cash, bizWorth(old.g, old.b), counting)).toBeNull()
    expect(calls).toBe(0)
    // One site: nothing pays, so no candidate reaches the judge.
    const small = labGame(58, 'brewery')
    const ws = bizWorth(small.g, small.b)
    expect(worth(small.g, small.b, ws)).toBe(0)
    expect(bestLabMove(small.g, small.b, small.b.cash, ws, counting)).toBeNull()
    expect(calls).toBe(0)
    // 40 sites and a breakthrough to patent: exactly one judge call for each candidate whose exact value is above 0.
    const { g, a, b } = rich(58)
    launchBreakthrough(g, a, b)
    const w = bizWorth(g, b)
    const n = worth(g, b, w)
    expect(n).toBeGreaterThan(1)
    expect(bestLabMove(g, b, b.cash, w, counting)).not.toBeNull()
    expect(calls).toBe(n)
    // Too little to spend: the price test comes first, so the judge is not asked at all.
    calls = 0
    expect(bestLabMove(g, b, 1, w, counting)).toBeNull()
    expect(calls).toBe(0)
    // The whole turn, in a year nothing is offered yet (1901, a low-tech trade): the stream is where it would be without the block.
    const quiet = labGame(59, 'restaurant', { year: 1900 })
    hireCeo(quiet.g, quiet.a, quiet.b, 'growth')
    const twin = structuredClone(quiet.g)
    const tw = twin.assets.find((x) => x.id === quiet.a.id)!
    const spy = vi.spyOn(rules, 'bestLabMove')
    spy.mockReturnValue(null)
    try {
      smartManagerTurn(twin, tw, bizOf(twin, tw))
    } finally {
      spy.mockRestore()
    }
    const asked = turn(quiet.g, quiet.a, quiet.b)
    expect(asked.calls.length).toBeGreaterThan(0)
    expect(asked.calls.every((c) => c.move === null)).toBe(true)
    expect(quiet.g.rng).toBe(twin.rng)
    expect(JSON.stringify(quiet.b)).toBe(JSON.stringify(bizOf(twin, tw)))
  })

  it('never hires and never licenses later', () => {
    const { g, a, b } = rich(60)
    launchBreakthrough(g, a, b)
    patchLab(b, (d) => {
      d.patents = [{ ...held(g, 1), plan: 500_000 }]
      d.filed = ['Held Thing 1']
    })
    hireCeo(g, a, b, 'growth')
    const teamBefore = [...readLab(b).team]
    const old = readLab(b).patents[0]
    turn(g, a, b)
    expect(readLab(b).team).toEqual(teamBefore)
    const now = readLab(b).patents.find((p) => p.family === old.family)!
    expect(now.mode).toBe('hold')
    expect(now.lic).toBe(0)
    // Every patent the CEO filed is in the mode patentValue preferred and none was licensed afterwards.
    for (const p of readLab(b).patents) if (p.family !== old.family) expect(p.lic === 0 ? 'hold' : 'license').toBe(p.mode)
  })

  it('uses the same checks as the owner: a blocked move is never made', () => {
    const { g, a, b } = rich(61)
    // All three tracks busy, no line to patent: nothing is a candidate, so the CEO spends nothing on the lab.
    patchLab(b, (d) => {
      d.programs = (['cost', 'yield', 'quality'] as const).map((t): LabProgram => ({ id: `ops.${t}.1`, started: g.year, years: 3, progress: 0, odds: 0.5, price: 60_000, grant: 0 }))
      d.filed = patentableFamilies(g, b) as string[]
    })
    const w = bizWorth(g, b)
    expect(bestLabMove(g, b, b.cash, w, exact)).toBeNull()
    for (const p of opsOffers(g, b)) expect(opsBlock(g, b, p.id, true)).not.toBeNull()
    expect(teamBlock(g, b, 'release')).not.toBeNull()
    void a
  })
})

describe('boardAllows is not asked by the CEO', () => {
  it('the CEO spends its own budget: the owner vote is not called for a lab move', () => {
    const { g, a, b } = rich(62)
    hireCeo(g, a, b, 'growth')
    const spy = vi.spyOn(board, 'boardAllows')
    try {
      turn(g, a, b)
      expect(spy.mock.calls.filter(([, , , p]) => p.label.startsWith('Fund ') || p.label.startsWith('File a patent'))).toHaveLength(0)
    } finally {
      spy.mockRestore()
    }
  })
})
