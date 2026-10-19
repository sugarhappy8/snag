import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scriptChoice } from '../src/game/core'
import { policyOf, writePolicy } from '../src/game/nation/state'
import { ownerKey } from '../src/game/special/common'
import type { Standing } from '../src/game/special/kit/rivals'
import {
  budgetLevel,
  careerCtx,
  careerLog,
  careerSay,
  claimChoice,
  fit,
  offerChoice,
  pendingCareerChoices,
  setCareerAudit,
  settleYear,
  ACTION_BUDGET,
  YEARLY_BUDGET,
  type AuditEvent,
  type CareerCtx,
} from '../src/game/special/kit/year'
import type { ChoiceModal, GameState } from '../src/game/types'
import { checkLedger, voiceProblems } from './career-kit'
import { newProbeGame, probeActive, probePeers, probeRun, probeStore, probeYear, type ProbeState } from './career-probe'

const PRISON = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 } as const

/** The probe hook with a body of the test's choosing. */
const hookWith = (run: (c: CareerCtx<ProbeState>, live: boolean) => string | void) =>
  settleYear({ career: 'probe', store: probeStore, incomeLabel: 'Fees', active: probeActive, run, peers: probePeers })

const nextYear = (g: GameState): void => {
  g.year += 1
  g.character.age += 1
}

describe('career year wrapper', () => {
  let g: GameState
  beforeEach(() => {
    g = newProbeGame(5)
  })
  afterEach(() => setCareerAudit(null))

  it('is a pure no-op without a job and a record', () => {
    g.character.job = null
    const before = JSON.stringify(g)
    const rng = JSON.stringify(g.rng)
    probeYear(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(JSON.stringify(g.rng)).toBe(rng)
  })

  it('settles once per (year, age) [RF3]', () => {
    probeYear(g)
    expect(g.character.money).toBe(110_000)
    const once = JSON.stringify(g)
    const rng = JSON.stringify(g.rng)
    probeYear(g)
    expect(JSON.stringify(g)).toBe(once)
    expect(JSON.stringify(g.rng)).toBe(rng)
    nextYear(g)
    probeYear(g)
    expect(g.character.money).toBe(120_000)
    expect(probeStore.view(g).rows.map((r) => r.y)).toEqual([2026, 2027])
  })

  it('does nothing for a dead character', () => {
    probeYear(g)
    nextYear(g)
    g.character.alive = false
    const before = JSON.stringify(g)
    probeYear(g)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('skips prison; with the job gone it settles with live false and pays nothing new', () => {
    probeYear(g)
    nextYear(g)
    g.character.prison = { ...PRISON }
    const inside = JSON.stringify(g)
    probeYear(g)
    expect(JSON.stringify(g)).toBe(inside)
    g.character.prison = null
    g.character.job = null
    const cash = g.character.money
    probeYear(g)
    expect(g.character.money).toBe(cash)
    const s = probeStore.view(g)
    expect(s.stock).toBe(2)
    expect(s.rows.at(-1)).toMatchObject({ income: 0, spent: 0, note: 'Lived on the old fees.' })
  })

  it("runs in prison only when asked with prison: 'run'", () => {
    const seen: boolean[] = []
    const hook = settleYear({ career: 'probe', store: probeStore, incomeLabel: 'Fees', active: probeActive, prison: 'run', run: (_c, live) => void seen.push(live) })
    g.character.prison = { ...PRISON }
    hook(g)
    expect(seen).toEqual([true])
  })

  it('books one row per settle with the ledger, the rank and the note', () => {
    let field: Standing | null = null
    const hook = settleYear({
      career: 'probe',
      store: probeStore,
      incomeLabel: 'Fees',
      active: probeActive,
      peers: probePeers,
      run: (c) => {
        field = c.field
        c.earn('Fee', 3000)
        c.pay('Rent', 500)
        c.s.standing = 250
        return 'x'.repeat(40) + ' ' + 'y'.repeat(80)
      },
    })
    hook(g)
    const s = probeStore.view(g)
    expect(field).not.toBeNull()
    expect(s.years).toBe(1)
    expect(s.standing).toBe(100)
    expect(s.peak).toBe(100)
    expect(s.appt).toBe(String(g.character.job?.data.appointmentId))
    const row = s.rows[0]
    expect(row).toMatchObject({ y: 2026, income: 3000, spent: 500, standing: 100 })
    expect(row.note.length).toBeLessThanOrEqual(90)
    expect(row.note).toBe('x'.repeat(40))
    expect(row.of).toBeGreaterThanOrEqual(2)
    expect(row.rank).toBeGreaterThanOrEqual(1)
    expect(row.rank).toBeLessThanOrEqual(row.of)
  })

  it('books rank 0 of 0 with no peers, and no field in action contexts', () => {
    const hook = settleYear({ career: 'probe', store: probeStore, incomeLabel: 'Fees', active: probeActive, run: (c) => void (c.field === null || expect.fail('field set without peers')) })
    hook(g)
    expect(probeStore.view(g).rows[0]).toMatchObject({ rank: 0, of: 0 })
    expect(careerCtx(g, 'probe', probeStore.mut(g)).field).toBeNull()
  })

  it('offers crises only while the job is held', () => {
    const offer = vi.fn(() => false)
    const hook = settleYear({ career: 'probe', store: probeStore, incomeLabel: 'Fees', active: probeActive, run: probeRun, crises: { offer } })
    hook(g)
    expect(offer).toHaveBeenCalledTimes(1)
    nextYear(g)
    g.character.job = null
    hook(g)
    expect(offer).toHaveBeenCalledTimes(1)
  })

  it('holds the popup budget [1 choice, 2 notices]', () => {
    const asked: boolean[] = []
    const say: boolean[] = []
    hookWith((c) => {
      for (let i = 1; i <= 5; i++) say.push(careerSay(c, `Note ${i}`, `You filed note ${i}.`))
      for (let i = 0; i < 3; i++) asked.push(offerChoice(c, 'career.probe.rush', 'Rush job', 'A client calls. What will you do?', [{ id: 'safe', label: 'Say no' }], { id: 'rush', d: { fee: 1000 } }))
    })(g)
    expect(g.queue.map((m) => m.kind)).toEqual(['notice', 'notice', 'choice'])
    expect(say).toEqual([true, true, false, false, false])
    expect(asked).toEqual([true, false, false])
    expect(g.log.flatMap((y) => y.entries).map((e) => e.text)).toEqual(['You filed note 3.', 'You filed note 4.', 'You filed note 5.'])
    const choice = g.queue[2] as ChoiceModal
    expect(choice.scriptId).toBe('career.probe.rush')
    expect(choice.data).toEqual({ id: 'rush', d: { fee: 1000 }, owner: ownerKey(g), year: g.year })
  })

  it('keeps the budgets as documented and copies them per use', () => {
    expect(YEARLY_BUDGET).toEqual({ choices: 1, notices: 2 })
    expect(ACTION_BUDGET).toEqual({ choices: 3, notices: 6 })
    const c = careerCtx(g, 'probe', probeStore.mut(g))
    expect(c.budget).toEqual(ACTION_BUDGET)
    expect(c.budget).not.toBe(ACTION_BUDGET)
    c.budget.notices = 0
    expect(ACTION_BUDGET.notices).toBe(6)
  })

  it('caps pending career choices at 2 across careers', () => {
    scriptChoice(g, 'career.x.y', 'One', 'Text. What will you do?', [{ id: 'a', label: 'A' }])
    scriptChoice(g, 'career.z.w', 'Two', 'Text. What will you do?', [{ id: 'a', label: 'A' }])
    scriptChoice(g, 'special.actor.pick', 'Legacy', 'Text. What will you do?', [{ id: 'a', label: 'A' }])
    expect(pendingCareerChoices(g)).toBe(2)
    const c = careerCtx(g, 'probe', probeStore.mut(g), { choices: 1, notices: 2 })
    expect(offerChoice(c, 'career.probe.rush', 'Rush job', 'A client calls. What will you do?', [{ id: 'safe', label: 'Say no' }], {})).toBe(false)
    expect(c.budget.choices).toBe(1)
    expect(pendingCareerChoices(g)).toBe(2)
  })

  it('guards the ledger', () => {
    const c = careerCtx(g, 'probe', probeStore.mut(g))
    expect(c.earn('', 5)).toBe(0)
    for (const bad of [NaN, -5, 0, 0.4, Infinity]) expect(c.earn('Fee', bad)).toBe(0)
    expect(g.character.money).toBe(100_000)
    expect(c.pay('Rent', 1e9)).toBe(false)
    for (const bad of [NaN, -5, Infinity]) expect(c.pay('Rent', bad)).toBe(false)
    expect(c.pay('', 5)).toBe(false)
    expect(g.character.money).toBe(100_000)
    expect(c.earn('Fee', 1000.4)).toBe(1000)
    expect(g.character.money).toBe(101_000)
    expect(g.flags.taxableIncome).toBe(1000)
    expect(c.pay('Rent', 250)).toBe(true)
    expect(g.character.money).toBe(100_750)
    expect(c.pay('Rent', 0.3)).toBe(true)
    expect(g.character.money).toBe(100_750)
  })

  it('books matches the cash delta', () => {
    const sink: AuditEvent[] = []
    setCareerAudit((e) => sink.push(e))
    hookWith((c) => {
      c.earn('Fee', 1000)
      c.pay('Rent', 200)
    })(g)
    expect(sink.filter((e) => e.t === 'books')).toEqual([{ t: 'books', career: 'probe', where: 'settle', delta: 800, booked: 800, moves: 2 }])
    expect(sink.filter((e) => e.t === 'earn' || e.t === 'pay')).toEqual([
      { t: 'earn', career: 'probe', label: 'Fee', amount: 1000 },
      { t: 'pay', career: 'probe', label: 'Rent', amount: 200 },
    ])
    expect(checkLedger(sink)).toEqual([])
  })

  it('audits text from the kit helpers', () => {
    const sink: AuditEvent[] = []
    setCareerAudit((e) => sink.push(e))
    const c = careerCtx(g, 'probe', probeStore.mut(g), { choices: 1, notices: 1 })
    careerSay(c, 'Fees in', 'You were paid.')
    careerSay(c, 'Spill', 'You were paid again.')
    careerLog(c, 'I was paid.')
    offerChoice(c, 'career.probe.rush', 'Rush job', 'A client calls. What will you do?', [{ id: 'safe', label: 'Say no' }], {})
    const texts = sink.flatMap((e) => (e.t === 'text' ? [`${e.role}:${e.text}`] : []))
    expect(texts).toEqual([
      'title:Fees in',
      'outcome:You were paid.',
      'log:You were paid again.',
      'log:I was paid.',
      'title:Rush job',
      'scene:A client calls. What will you do?',
    ])
    for (const e of sink) if (e.t === 'text') expect(voiceProblems(e.text, e.role)).toEqual([])
  })

  it('checkLedger and voiceProblems flag what they promise to', () => {
    const books = { t: 'books', career: 'probe', where: 'x', booked: 100, moves: 2 } as const
    expect(checkLedger([{ ...books, delta: 102 }])).toEqual([])
    expect(checkLedger([{ ...books, delta: 103 }])).toHaveLength(1)
    expect(checkLedger([{ t: 'earn', career: 'probe', label: ' ', amount: 5 }, { t: 'pay', career: 'probe', label: 'Rent', amount: NaN }])).toHaveLength(2)
    expect(checkLedger([{ t: 'earn', career: 'probe', label: 'Huge', amount: 1e12 }])[0]).toMatch(/^note-windfall/)
    expect(voiceProblems('You did not go.', 'outcome')).toContain('no-contraction')
    expect(voiceProblems(`You went ${String.fromCharCode(0x2014)} twice.`, 'outcome')).toContain('em-dash')
    expect(voiceProblems('x'.repeat(125), 'log')).toEqual(['over-cap'])
    expect(voiceProblems('Look at you go.', 'outcome')).toContain('banned: Look at you')
  })

  it('claimChoice accepts the first matching owner and year only [RF3]', () => {
    const s = probeStore.mut(g)
    const data = { id: 'rush', owner: ownerKey(g), year: g.year }
    expect(claimChoice(g, s, data, 'crisis.rush')).toBe(true)
    expect(claimChoice(g, s, data, 'crisis.rush')).toBe(false)
    expect(claimChoice(g, s, { ...data, owner: 'v2:9:someone-else' }, 'crisis.other')).toBe(false)
    expect(claimChoice(g, s, { ...data, year: g.year + 1 }, 'crisis.other')).toBe(false)
    expect(claimChoice(g, s, undefined, 'crisis.other')).toBe(false)
    expect(claimChoice(g, s, data, '')).toBe(false)
    expect(s.done).toEqual(['crisis.rush'])
    expect(claimChoice(g, s, data, 'crisis.other')).toBe(true)
    // a long key survives the next normalization, so the guard still holds
    const long = 'k'.repeat(200)
    expect(claimChoice(g, s, data, long)).toBe(true)
    expect(claimChoice(g, probeStore.mut(g), data, long)).toBe(false)
  })

  it('fit cuts at the last space under the cap, with no ellipsis', () => {
    expect(fit('one two three', 13)).toBe('one two three')
    expect(fit('one two three', 12)).toBe('one two')
    expect(fit('one two three', 8)).toBe('one two')
    expect(fit('one two three', 7)).toBe('one two')
    expect(fit('one two three', 3)).toBe('one')
    expect(fit('abcdefghij', 4)).toBe('abcd')
    expect(fit('one, two three', 5)).toBe('one')
    expect(fit('anything', 0)).toBe('')
    expect(fit('anything', NaN)).toBe('')
  })

  it('reads a budget line as 1 unless the country set it', () => {
    expect(budgetLevel(g, 'space')).toBe(1)
    const p = structuredClone(policyOf(g, 'us'))
    p.national.budget.space = 1.5
    writePolicy(g, p)
    expect(budgetLevel(g, 'space')).toBe(1.5)
    expect(budgetLevel(g, 'space', 'fr')).toBe(1)
    expect(budgetLevel(g, 'research')).toBe(1)
  })
})
