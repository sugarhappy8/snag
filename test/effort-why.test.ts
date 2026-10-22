// ci: fast
// R3-E8 (C.11, the words of research): the odds line, the one-line reasons, the cause of a failure, the payoff of a result and
// the info rows a menu shows. "Research must pay visibly" and "the player sees why" are proved here on hand-built quotes, so this
// file needs no engine: a Quote is plain data. The policy hook (hooks.ts) is how Fog decides what the player may see; with
// nothing bound every number shows, which is also what the test suite runs under.
//
// The cases that matter most: the example line of the R3 block word for word, the folding of small terms into "other", the hard
// 110 character limit, a policy that hides a term (its number must not leak anywhere), and a line free of any dash.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { EASY_FIELD_LABEL, TERM_LABEL } from '../src/game/effort/limits'
import { EXACT_POLICY } from '../src/game/effort/hooks'
import type { RevealPolicy } from '../src/game/effort/hooks'
import { causeLine, oddsLine, payoffLine, whyLines, whyNodes } from '../src/game/effort/why'
import { defineTask } from '../src/game/effort/task'
import type { CauseKind, Outcome, OutcomeKind, Quote, StepResult, TermKey } from '../src/game/effort/types'
import { makeTestGame } from './helpers'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** An en-dash or an em-dash (written as code points so this file holds none). */
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

const ALL_TERMS: TermKey[] = ['team', 'funding', 'crew', 'tools', 'know', 'hard', 'rival', 'spill', 'bold', 'tired', 'ceo']
const CAUSES: CauseKind[] = ['deadEnd', 'starved', 'churn', 'shortcut', 'rival', 'tired']
const KINDS: OutcomeKind[] = ['fail', 'partial', 'works', 'hit']

/** A quote with these labelled lines (in this order) and the odds `p`; everything else is neutral. */
function quoteOf(rows: readonly (readonly [TermKey, number])[], p = 0.62): Quote {
  return {
    p, hitP: 0, years: 2, yearsExact: 2, quality: null, spread: 8, k: 1, spend: 50_000, payrollX: 1,
    reasons: rows.map(([key, pts]) => ({ key, label: key === 'hard' && pts > 0 ? EASY_FIELD_LABEL : TERM_LABEL[key], pts })),
    effort: { crew: 1, tools: 0, rho: 1, phi: 1, speed: 1 },
    risk: { shortcut: 0, explosion: 0, scandal: 0 }, burnout: false, capped: [],
  }
}

/** The example of the R3 block: odds 62% with team +9, funding +7, hard field -12 and tired -4. */
const EXAMPLE = quoteOf([['team', 9], ['funding', 7], ['hard', -12], ['tired', -4]])

/** A realistic policy: the odds come in tens, and the player doesn't know the hidden terms. */
function realistic(hidden: readonly TermKey[] = []): RevealPolicy {
  return { exact: false, knows: (t) => !hidden.includes(t), band: (p) => `about ${Math.round(p * 10) * 10}%` }
}

function outcomeOf(kind: OutcomeKind): Outcome {
  return { kind, margin: kind === 'fail' ? -12 : 20, cause: kind === 'fail' ? 'starved' : null, done: kind === 'fail' ? 0.5 : 1 }
}

function resultOf(knowledge: number, learned: number): StepResult {
  return { replay: false, knowledge, learned, shift: 0, reveals: [] }
}

const TASK = defineTask({ field: 'rd.beverage', mode: 'project', cost: 50_000 })

describe('oddsLine', () => {
  it('writes the example of the R3 block word for word', () => {
    expect(oddsLine(EXAMPLE, EXACT_POLICY)).toBe('Odds 62%: team +9, funding +7, hard field -12, tired -4')
  })

  it('shows every number when no policy is given (the fallback is exact)', () => {
    expect(oddsLine(EXAMPLE)).toBe('Odds 62%: team +9, funding +7, hard field -12, tired -4')
    for (const bad of [null, 5, 'exact', {}, { exact: true }, { exact: true, knows: () => true }, { exact: 'yes', knows: () => true, band: () => 'x' }]) {
      expect(oddsLine(EXAMPLE, bad as never)).toBe('Odds 62%: team +9, funding +7, hard field -12, tired -4')
    }
  })

  it('keeps the four largest terms in the quote order and folds the rest into "other"', () => {
    const q = quoteOf([['team', 9], ['funding', 7], ['tools', 1], ['know', 1], ['hard', -12], ['tired', -4]])
    expect(oddsLine(q)).toBe('Odds 62%: team +9, funding +7, hard field -12, tired -4, other +2')
  })

  it('folds the small terms with their signs, so "other" is the sum of what it hides', () => {
    const q = quoteOf([['team', 10], ['funding', 8], ['crew', -3], ['tools', 2], ['hard', -12], ['tired', -6]])
    expect(oddsLine(q)).toBe('Odds 62%: team +10, funding +8, hard field -12, tired -6, other -1')
  })

  it('leaves "other" out when what it hides adds to zero', () => {
    const q = quoteOf([['team', 9], ['funding', 7], ['tools', 2], ['crew', -2], ['hard', -12], ['tired', -4]])
    expect(oddsLine(q)).toBe('Odds 62%: team +9, funding +7, hard field -12, tired -4')
  })

  it('breaks a tie by the quote order', () => {
    const q = quoteOf([['team', 3], ['funding', 3], ['crew', 3], ['tools', 3], ['know', 3]])
    expect(oddsLine(q)).toBe('Odds 62%: team +3, funding +3, crew +3, tools +3, other +3')
  })

  it('skips a term that rounds to zero and rounds the rest to whole points', () => {
    const q = quoteOf([['team', 8.6], ['funding', 0.4], ['crew', -0.4], ['hard', -11.6]])
    expect(oddsLine(q)).toBe('Odds 62%: team +9, hard field -12')
  })

  it('names an easy field with its own label', () => {
    expect(oddsLine(quoteOf([['hard', 6], ['team', 4]]))).toBe('Odds 62%: hard field +6, team +4'.replace('hard field', EASY_FIELD_LABEL))
  })

  it('has no colon when nothing moved the odds', () => {
    expect(oddsLine(quoteOf([]))).toBe('Odds 62%')
    expect(oddsLine(quoteOf([['team', 0], ['funding', 0.2]]))).toBe('Odds 62%')
  })

  it('stays within 110 characters over a ten term quote at the worst sizes', () => {
    const worst = quoteOf([
      ['team', 40], ['funding', -30], ['crew', 12], ['tools', 6], ['know', 15], ['hard', -30], ['rival', -8], ['spill', 18], ['bold', -10], ['tired', -40],
    ], 1)
    for (const policy of [EXACT_POLICY, realistic(), realistic(['hard']), realistic(['team', 'tired', 'spill'])]) {
      const line = oddsLine(worst, policy)
      expect(line.length).toBeLessThanOrEqual(110)
      expect(line.startsWith('Odds ')).toBe(true)
    }
    for (const key of ALL_TERMS) {
      const q = quoteOf(ALL_TERMS.map((k) => [k, k === key ? -99 : 17] as const), 0.5)
      expect(oddsLine(q, realistic([key])).length).toBeLessThanOrEqual(110)
    }
  })

  it('shows fewer terms, and folds them into "other", before the line runs past the limit', () => {
    // Four long labels, a hidden term and a sum for "other" would make 113 characters, so the smallest of the four folds in.
    const long = quoteOf([['team', 9], ['funding', 7], ['spill', 99], ['rival', -98], ['hard', -97], ['bold', -96], ['tired', -4]])
    const line = oddsLine(long, realistic(['funding']))
    expect(line).toBe('Odds about 60%: public research +99, rival pressure -98, hard field -97, other -91, unknown factors')
    expect(line.length).toBeLessThanOrEqual(110)
  })

  it('writes the odds in the words of a realistic policy', () => {
    expect(oddsLine(EXAMPLE, realistic())).toBe('Odds about 60%: team +9, funding +7, hard field -12, tired -4')
  })

  it('shows a term the player does not know as "unknown factors", with no number', () => {
    const line = oddsLine(EXAMPLE, realistic(['hard']))
    expect(line).toBe('Odds about 60%: team +9, funding +7, tired -4, unknown factors')
    expect(line).not.toContain('12')
    expect(line).not.toContain('hard field')
  })

  it('says "unknown factors" once however many terms are hidden, and keeps nothing of them', () => {
    const q = quoteOf([['team', 9], ['funding', 7], ['hard', -12], ['tired', -4]])
    expect(oddsLine(q, realistic(['team', 'funding', 'hard', 'tired']))).toBe('Odds about 60%: unknown factors')
    const line = oddsLine(q, realistic(['team', 'tired']))
    expect(line).toBe('Odds about 60%: funding +7, hard field -12, unknown factors')
    expect(line.match(/unknown factors/g)).toHaveLength(1)
  })

  it('does not count a hidden term that moved nothing', () => {
    const q = quoteOf([['team', 9], ['hard', 0]])
    expect(oddsLine(q, realistic(['hard']))).toBe('Odds about 60%: team +9')
  })

  it('asks the policy only about terms that moved the odds', () => {
    const asked: TermKey[] = []
    const policy: RevealPolicy = { exact: false, knows: (t) => (asked.push(t), true), band: () => 'about 60%' }
    oddsLine(EXAMPLE, policy)
    expect(new Set(asked)).toEqual(new Set(['team', 'funding', 'hard', 'tired']))
  })

  it('survives hostile reasons: missing labels, non-numbers, odd keys, and a p that is not a number', () => {
    const q = quoteOf([['team', 9]])
    q.reasons.push({ key: 'funding', label: '', pts: 7 } as never)
    q.reasons.push({ key: 'crew', label: 'crew', pts: Number.NaN })
    q.reasons.push({ key: 'tools', label: 'tools', pts: Number.POSITIVE_INFINITY })
    q.reasons.push(null as never, 5 as never, {} as never, { key: 'nope', label: 'x', pts: 1 } as never)
    q.p = Number.NaN
    const line = oddsLine(q)
    expect(line).toMatch(/^Odds 0%: team \+9, funding \+7/)
    expect(line.length).toBeLessThanOrEqual(110)
    expect(() => oddsLine({} as never)).not.toThrow()
    expect(() => oddsLine(null as never)).not.toThrow()
  })

  it('writes no dash, even when a caller gives a label with one', () => {
    const q = quoteOf([['team', 9]])
    q.reasons[0]!.label = `de${String.fromCharCode(0x2014)}ad${String.fromCharCode(0x2013)}beat`
    const line = oddsLine(q)
    expect(line).not.toMatch(DASH)
    expect(line).toContain('de-ad-beat +9')
  })

  it('is a pure function of the quote and the policy', () => {
    const a = oddsLine(EXAMPLE, realistic(['hard']))
    const b = oddsLine(JSON.parse(JSON.stringify(EXAMPLE)) as Quote, realistic(['hard']))
    expect(a).toBe(b)
  })
})

describe('whyLines', () => {
  it('writes one short line for each term that moved the odds, in the quote order', () => {
    expect(whyLines(EXAMPLE)).toEqual([
      'Your team added 9 points.',
      'The budget added 7 points.',
      'The hard field cost 12 points.',
      'Being tired cost 4 points.',
    ])
  })

  it('writes no line for a term that rounds to zero, and counts "1 point" in the singular', () => {
    const q = quoteOf([['team', 1], ['funding', 0.2], ['crew', -1]])
    expect(whyLines(q)).toEqual(['Your team added 1 point.', 'The crew cost 1 point.'])
  })

  it('has a line for every kind of term in both directions', () => {
    for (const key of ALL_TERMS) {
      for (const pts of [5, -5]) {
        const lines = whyLines(quoteOf([[key, pts]]))
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatch(/\b5 points\b/)
        expect(lines[0]!.length).toBeLessThanOrEqual(90)
        expect(lines[0]).not.toMatch(DASH)
      }
    }
    expect(whyLines(quoteOf([['hard', 5]]))[0]).toBe('The easy field added 5 points.')
  })

  it('puts the terms a policy hides into one line with no number', () => {
    const lines = whyLines(EXAMPLE, realistic(['hard', 'tired']))
    expect(lines).toEqual(['Your team added 9 points.', 'The budget added 7 points.', 'Unknown factors moved the odds.'])
    expect(lines.join(' ')).not.toMatch(/12|-4|\b4\b/)
  })

  it('writes nothing for a hidden term that moved nothing', () => {
    expect(whyLines(quoteOf([['team', 9], ['hard', 0]]), realistic(['hard']))).toEqual(['Your team added 9 points.'])
  })

  it('does not fold: eleven terms are eleven lines', () => {
    const q = quoteOf(ALL_TERMS.map((k, i) => [k, i % 2 ? -(i + 1) : i + 1] as const))
    expect(whyLines(q)).toHaveLength(11)
  })

  it('writes a line for a label the table does not know, from the label', () => {
    const q = quoteOf([])
    q.reasons.push({ key: 'team', label: 'night shift', pts: 3 })
    expect(whyLines(q)).toEqual(['Your team added 3 points.'])
    q.reasons.push({ key: 'nope' as TermKey, label: 'mystery', pts: -2 })
    expect(whyLines(q)).toEqual(['Your team added 3 points.', 'Mystery cost 2 points.'])
  })

  it('is empty for an empty or hostile quote', () => {
    expect(whyLines(quoteOf([]))).toEqual([])
    expect(whyLines({} as never)).toEqual([])
    expect(whyLines(null as never)).toEqual([])
  })
})

describe('causeLine', () => {
  it('words the thin budget as the plan does', () => {
    expect(causeLine('starved', 'rd.beverage')).toBe('The budget was too thin for a field this hard.')
  })

  it('has a line for every cause, each different, short and free of a dash', () => {
    const seen = new Set<string>()
    for (const cause of CAUSES) {
      const line = causeLine(cause, 'rd.beverage')
      expect(line.length).toBeGreaterThan(10)
      expect(line.length).toBeLessThanOrEqual(90)
      expect(line).not.toMatch(DASH)
      expect(line).toMatch(/[.]$/)
      seen.add(line)
    }
    expect(seen.size).toBe(CAUSES.length)
  })

  it('names the field when the line is about the field, from the key', () => {
    expect(causeLine('deadEnd', 'rd.beverage')).toBe('The beverage work hit a dead end.')
    expect(causeLine('rival', 'dt.aiLab.cap.reasoning')).toBe('A rival got to reasoning first.')
    expect(causeLine('deadEnd', 'dt.aiLab.cap.codeGen')).toBe('The code gen work hit a dead end.')
  })

  it('takes a display name as it is', () => {
    expect(causeLine('deadEnd', 'Deep sea mining')).toBe('The Deep sea mining work hit a dead end.')
  })

  it('writes a plain line when it has no field to name', () => {
    expect(causeLine('deadEnd', '')).toBe('The work hit a dead end.')
    expect(causeLine('rival', '')).toBe('A rival got there first.')
    expect(causeLine('deadEnd', undefined as never)).toBe('The work hit a dead end.')
  })

  it('keeps a hostile field short and clean', () => {
    const wild = `${'x'.repeat(200)}${String.fromCharCode(0x2014)}`
    for (const cause of CAUSES) {
      const line = causeLine(cause, wild)
      expect(line.length).toBeLessThanOrEqual(90)
      expect(line).not.toMatch(DASH)
    }
    expect(causeLine('deadEnd', 5 as never)).toBe('The work hit a dead end.')
  })

  it('falls back to the dead end for a cause it does not know, or none', () => {
    for (const bad of [null, undefined, 'nope', 5, {}, '__proto__', 'constructor', 'toString']) {
      expect(causeLine(bad as never, 'rd.beverage')).toBe(causeLine('deadEnd', 'rd.beverage'))
    }
  })
})

describe('payoffLine', () => {
  it('words the plan example for a result that taught something', () => {
    expect(payoffLine(TASK, outcomeOf('works'), resultOf(34, 6))).toBe('You learned the field better: know-how 34.')
  })

  it('has a line for every outcome, in every state of learning', () => {
    const seen = new Set<string>()
    for (const kind of KINDS) {
      for (const [k, learned] of [[34, 6], [34, 0], [0, 0], [100, 0]] as const) {
        const line = payoffLine(TASK, outcomeOf(kind), resultOf(k, learned))
        expect(line.length).toBeGreaterThan(10)
        expect(line.length).toBeLessThanOrEqual(90)
        expect(line).not.toMatch(DASH)
        expect(line).toMatch(/[.]$/)
        seen.add(line)
      }
    }
    expect(seen.size).toBe(16)
  })

  it('shows the know-how it reports, whole, and only when there is some', () => {
    expect(payoffLine(TASK, outcomeOf('fail'), resultOf(12.4, 4.2))).toBe('The failure still taught you the field: know-how 12.')
    expect(payoffLine(TASK, outcomeOf('partial'), resultOf(30.6, 5))).toBe('Half a result still taught you the field: know-how 31.')
    expect(payoffLine(TASK, outcomeOf('works'), resultOf(34, 0))).toBe('It worked. Know-how in the field holds at 34.')
    expect(payoffLine(TASK, outcomeOf('hit'), resultOf(34, 0))).toBe('A hit. Know-how in the field holds at 34.')
    expect(payoffLine(TASK, outcomeOf('hit'), resultOf(34, 3))).toBe('A hit. You learned the field better: know-how 34.')
    expect(payoffLine(TASK, outcomeOf('fail'), resultOf(0, 0))).not.toMatch(/know-how \d/)
    expect(payoffLine(TASK, outcomeOf('works'), resultOf(0, 0))).not.toMatch(/\d/)
  })

  it('says a failure that taught nothing new taught nothing new', () => {
    expect(payoffLine(TASK, outcomeOf('fail'), resultOf(34, 0))).toBe('The failure taught you little new: know-how 34.')
    expect(payoffLine(TASK, outcomeOf('fail'), resultOf(0, 0))).toBe('The failure taught you nothing yet.')
  })

  it('speaks of study and practice as such', () => {
    const study = defineTask({ field: 'study.law', mode: 'study', cost: 1000 })
    const practice = defineTask({ field: 'practice.piano', mode: 'practice', cost: 1000 })
    expect(payoffLine(study, outcomeOf('works'), resultOf(20, 5))).toBe('Your study paid off: know-how 20.')
    expect(payoffLine(practice, outcomeOf('works'), resultOf(20, 5))).toBe('The practice paid off: know-how 20.')
  })

  it('writes the same line for a replay, which changed nothing', () => {
    const r = { ...resultOf(34, 0), replay: true }
    expect(payoffLine(TASK, outcomeOf('works'), r)).toBe('It worked. Know-how in the field holds at 34.')
  })

  it('survives hostile input: no result, no outcome, know-how that is not a number', () => {
    expect(() => payoffLine(TASK, null as never, null as never)).not.toThrow()
    expect(payoffLine(TASK, { kind: 'nope' } as never, resultOf(Number.NaN, Number.NaN))).toBe('You have no know-how in the field yet.')
    expect(payoffLine(TASK, { kind: 'nope' } as never, resultOf(20, 0))).toBe('Know-how in the field holds at 20.')
    expect(payoffLine(TASK, { kind: 'nope' } as never, resultOf(20, 3))).toBe('You learned the field better: know-how 20.')
    expect(payoffLine(null as never, outcomeOf('works'), resultOf(500, 500))).toBe('You learned the field better: know-how 100.')
    expect(payoffLine(TASK, outcomeOf('works'), resultOf(-5, -5))).not.toMatch(/-/)
  })
})

describe('whyNodes', () => {
  const g = makeTestGame(7)

  it('returns info rows: the odds line first, then a row for each reason', () => {
    const rows = whyNodes(g, EXAMPLE)
    expect(rows.every((r) => r.type === 'info')).toBe(true)
    expect(rows).toHaveLength(1 + whyLines(EXAMPLE).length)
    expect(typeof rows[0]!.text).toBe('string')
    expect(rows[0]!.text).toBe(oddsLine(EXAMPLE, EXACT_POLICY))
    expect(rows.slice(1).map((r) => r.text)).toEqual(whyLines(EXAMPLE, EXACT_POLICY))
  })

  it('gives every row its own id, and a caller a prefix so two lists never collide', () => {
    const a = whyNodes(g, EXAMPLE).map((r) => r.id)
    const b = whyNodes(g, EXAMPLE, 'project.7').map((r) => r.id)
    expect(new Set(a).size).toBe(a.length)
    expect(new Set(b).size).toBe(b.length)
    expect(a.filter((id) => b.includes(id))).toEqual([])
    expect(b.every((id) => id.startsWith('project.7.'))).toBe(true)
  })

  it('is the odds row alone when nothing moved the odds', () => {
    const rows = whyNodes(g, quoteOf([]))
    expect(rows.map((r) => r.text)).toEqual(['Odds 62%'])
  })

  it('reads and writes nothing in the game, and draws no random number', () => {
    const game = makeTestGame(11)
    const before = JSON.stringify(game)
    const rng = game.rng
    Object.defineProperty(game, 'rng', {
      configurable: true,
      enumerable: false,
      get() {
        throw new Error('g.rng was read')
      },
      set() {
        throw new Error('g.rng was written')
      },
    })
    expect(() => whyNodes(game, EXAMPLE)).not.toThrow()
    expect(() => whyNodes(game, quoteOf([['team', 3]]), 'x')).not.toThrow()
    delete (game as { rng?: number }).rng
    game.rng = rng
    expect(JSON.parse(JSON.stringify(game))).toEqual(JSON.parse(before))
  })

  it('shows what the bound reveal policy lets the player see', async () => {
    vi.resetModules()
    const hooks = await import('../src/game/effort/hooks')
    const why = await import('../src/game/effort/why')
    expect(why.whyNodes(g, EXAMPLE)[0]!.text).toBe('Odds 62%: team +9, funding +7, hard field -12, tired -4')
    hooks.bindRevealPolicy(() => realistic(['hard']))
    const rows = why.whyNodes(g, EXAMPLE)
    expect(rows[0]!.text).toBe('Odds about 60%: team +9, funding +7, tired -4, unknown factors')
    expect(rows.map((r) => r.text).join(' ')).not.toMatch(/12/)
    expect(rows[rows.length - 1]!.text).toBe('Unknown factors moved the odds.')
  })

  it('falls back to exact when the bound policy is not a policy', async () => {
    vi.resetModules()
    const hooks = await import('../src/game/effort/hooks')
    const why = await import('../src/game/effort/why')
    hooks.bindRevealPolicy((() => ({ nope: true })) as never)
    expect(why.whyNodes(g, EXAMPLE)[0]!.text).toBe('Odds 62%: team +9, funding +7, hard field -12, tired -4')
  })
})

describe('the voice of the lines', () => {
  const SRC = readFileSync(join(ROOT, 'src', 'game', 'effort', 'why.ts'), 'utf8')

  it('holds no en-dash or em-dash in the file', () => {
    expect(SRC).not.toMatch(DASH)
  })

  it('draws, books and reads nothing (a read of the game is a policy lookup only)', () => {
    const code = SRC.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n')
    expect(code).not.toMatch(/\b(rand|chance|Math\.random|Date)\b|\.rng\b|\bcash\b|\bledger\b|\bspend\(|\bbook\(/)
  })

  it('uses contractions, never the long forms', () => {
    const lines: string[] = [oddsLine(EXAMPLE), ...whyLines(EXAMPLE), ...whyLines(EXAMPLE, realistic(['hard']))]
    for (const c of CAUSES) lines.push(causeLine(c, 'rd.beverage'))
    for (const kind of KINDS) for (const [k, l] of [[34, 6], [34, 0], [0, 0]] as const) lines.push(payoffLine(TASK, outcomeOf(kind), resultOf(k, l)))
    for (const line of lines) {
      expect(line).not.toMatch(DASH)
      expect(line).not.toMatch(/\b(do not|did not|was not|were not|cannot|is not|are not|will not|have not|has not)\b/i)
    }
  })

  it('keeps every sentence under the log limit of 90 characters', () => {
    const lines: string[] = [...whyLines(quoteOf(ALL_TERMS.map((k) => [k, -99] as const)))]
    for (const c of CAUSES) lines.push(causeLine(c, 'x'.repeat(60)))
    for (const kind of KINDS) lines.push(payoffLine(TASK, outcomeOf(kind), resultOf(100, 12)))
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(90)
  })
})
