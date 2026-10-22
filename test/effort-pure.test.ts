// ci: fast
// R3-E9 (C.12, purity): every read of the effort engine is a view of a state that it never moves, and `quote` never sees the roll.
// The rule no type can state is "a read never rolls", so this file proves it with the purity kit (test/effort-kit.ts) on every read
// of the track: `quote`, the odds line and the why lines, the posture rows and the whole Life Priorities menu, the Ambition word and
// the Profile row, the player's record and the focus pool.
//
//   frozen    each read runs on a state that is deep-frozen with a g.rng that throws on a read or a write: a write to any field is a
//             TypeError and a draw is an RngTrapError, so a read that moves the state or rolls fails at the offending line. The same
//             read on a plain twin gives the same answer (a read does not behave differently because it is frozen)
//   u trap    a quote whose input carries a `u` that throws on a read never fires it, over a grid of inputs; the trap itself can fail
//   tokens    a token scan of src/game/effort/ finds no draw (rand, chance, a stream, `.rng`, Math.random) and no clock (Date)
//
// No pinned seed: every life is makeTestGame's own, with a tuple of arguments, and the input grids come from a local generator.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quote } from '../src/game/effort/engine'
import { focusLeft, focusPreview, focusReason, focusUsed } from '../src/game/effort/focus'
import type { RevealPolicy } from '../src/game/effort/hooks'
import { postureNodes } from '../src/game/effort/menu'
import {
  YOU_KEY, ambitionOf, ambitionReveal, ambitionWord, blankYou, burnedOut, effortStrain, fatigueOf, hasYou, postureOf, readYou, setPosture, writeYou, youInput,
} from '../src/game/effort/persona'
import { landQuality, resolve } from '../src/game/effort/step'
import { defineTask } from '../src/game/effort/task'
import type { EffortInput, Outcome, Quote, Task, Worker } from '../src/game/effort/types'
import { causeLine, oddsLine, payoffLine, whyLines, whyNodes } from '../src/game/effort/why'
import { lifePrioritiesMenu } from '../src/game/household'
import type { GameState, Json, MenuNode } from '../src/game/types'
import { UTrapError, frozenGame, trapRng, uTrap, RngTrapError } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { K_ID, K_PUNCT, K_STR, loadSources, toSource, type SourceFile } from './scan-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const task = (): Task =>
  defineTask({
    field: 'rd.beverage', mode: 'project', cost: 30_000, p0: 0.4, baseYears: 1.5, minYears: 1, maxYears: 4, oddsLo: 0.05, oddsHi: 0.95,
    fteCap: 6, refCrew: { fte: 3, skill: 60 }, quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 }, hit: { p: 0.15, bonus: 10 }, partial: 0.1,
  })

const ownerOf = (g: GameState): string => `${g.generation}:${g.character.id}`

/** A life of 30 that has a record worth reading: a chosen pace, a shift, know-how, overtime, and a tired household. */
function used(): GameState {
  const g = makeTestGame(7, { age: 30 })
  expect(setPosture(g, 'push')).toBe(true)
  const y = readYou(g)
  y.effective = 'push'
  y.shift = 3.4
  y.over = 4
  y.fieldK = { 'rd.beverage': 41.5, 'dt.aiLab.cap.reasoning': 12 }
  y.at = { 'rd.beverage': 2025 }
  writeYou(g, y)
  g.flags.household = { owner: ownerOf(g), priority: 'balanced', fatigue: 62, training: 0, lastYear: 2025, effective: 'balanced', spent: 0 }
  g.yearActions = { study: 2, 'practice:chess': 1 }
  return g
}

/** The same life frozen all the way down with a trapped g.rng (the kit's frozenGame, for a state that has been set up). */
const frozen = (g: GameState): GameState => deepFreeze(trapRng(g))

/** A policy that hides one term and says the odds in words, like the realistic mode Fog binds. */
const REALISTIC: RevealPolicy = { exact: false, knows: (t) => t !== 'tired', band: (p) => `about ${Math.round(p * 10) * 10}%` }

const CREW: Worker[] = [{ fte: 3, skill: 70, morale: 60, drive: 80, fatigue: 20 }, { fte: 2, skill: 40, morale: 90 }]

/** A full input: money, crew, tools, know-how, the actor's own fields, rivals, public research and a base term. */
function fullInput(): EffortInput {
  return {
    who: 'you', k: 2.5, base: 0.35, quality0: 55, people: CREW, tools: 0.5, rival: 3, spill: 5,
    baseTerms: [{ key: 'team', label: 'team', pts: 9 }, { key: 'ceo', label: 'steady CEO', pts: 2 }],
  }
}

/** The rows of a menu as plain data (a node's functions run against `g`), so two states can be compared. */
function rowsOf(nodes: readonly MenuNode[], g: GameState): unknown[] {
  return nodes.map((n) => {
    const row: Record<string, unknown> = { id: n.id, type: n.type }
    if ('label' in n) row.label = n.label
    if ('text' in n) row.text = typeof n.text === 'function' ? n.text(g) : n.text
    if ('subtitle' in n) row.subtitle = typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle
    if ('visible' in n) row.visible = n.visible?.(g) ?? null
    if ('disabledReason' in n) row.disabled = n.disabledReason?.(g) ?? null
    if ('hint' in n) row.hint = n.hint?.(g) ?? null
    if ('badge' in n) row.badge = n.badge?.(g) ?? null
    if (n.type === 'action') row.confirm = n.confirm?.(g) ?? null
    if (n.type === 'menu') {
      row.header = n.header?.(g) ?? null
      row.children = rowsOf(n.children(g), g)
    }
    return row
  })
}

type Read = (g: GameState) => unknown

/** Every read of the track, by name. A read never writes the state and never rolls, so each runs on a frozen, trapped one. */
function reads(): Record<string, Read> {
  const t = task()
  const q = (g: GameState): Quote => quote(g, t, fullInput())
  const lost: Outcome = { kind: 'fail', margin: -20, cause: 'tired', done: 0.5 }
  return {
    'quote (the player)': q,
    'quote (no actor)': (g) => quote(g, t, {}),
    'quote (explicit actor)': (g) => quote(g, t, { ambition: 100, posture: 'push', fatigue: 70, knowledge: 100, k: 400 }),
    'oddsLine (exact)': (g) => oddsLine(q(g)),
    'oddsLine (realistic)': (g) => oddsLine(q(g), REALISTIC),
    whyLines: (g) => whyLines(q(g)),
    'whyLines (realistic)': (g) => whyLines(q(g), REALISTIC),
    whyNodes: (g) => whyNodes(g, q(g)),
    causeLine: () => (['deadEnd', 'starved', 'churn', 'shortcut', 'rival', 'tired'] as const).map((c) => causeLine(c, 'rd.beverage')),
    payoffLine: () => payoffLine(t, lost, { replay: false, knowledge: 41, learned: 3, shift: 0, reveals: [] }),
    resolve: (g) => resolve(q(g), 0.37, { drawHit: () => 0.05, done: 0.4, partial: 0.1 }),
    landQuality: (g) => landQuality(q(g), t, 0.7, true),
    postureNodes: (g) => rowsOf(postureNodes(g), g),
    'Life Priorities menu': (g) => rowsOf([lifePrioritiesMenu], g),
    readYou: (g) => readYou(g),
    blankYou: (g) => blankYou(g),
    hasYou: (g) => hasYou(g),
    ambition: (g) => [ambitionOf(g), ambitionReveal(g), ambitionWord(ambitionOf(g))],
    posture: (g) => [postureOf(g), effortStrain(g), fatigueOf(g), burnedOut(g)],
    youInput: (g) => youInput(g, 'rd.beverage'),
    focus: (g) => [focusUsed(g), focusLeft(g), focusPreview(g, 'study', 3, 1), focusPreview(g, 'practice:chess', 2, 30), focusReason(g, 'study', 3, 1)],
  }
}

describe('every read, on a frozen state with a trapped rng', () => {
  const table = reads()
  const plain = used()
  const names = Object.keys(table)

  it('covers the reads the plan names: quote, the odds line, the posture rows, the Ambition word and readYou', () => {
    for (const name of ['quote (the player)', 'oddsLine (exact)', 'postureNodes', 'ambition', 'readYou']) expect(names).toContain(name)
    expect(names.length).toBeGreaterThanOrEqual(20)
  })

  it.each(names)('%s neither throws nor moves the state, and answers as it does on a plain twin', (name) => {
    const g = frozen(used())
    const before = JSON.stringify(g)
    let answer: unknown
    expect(() => {
      answer = table[name]!(g)
    }).not.toThrow()
    expect(JSON.stringify(g)).toBe(before)
    expect(JSON.stringify(answer)).toBe(JSON.stringify(table[name]!(plain)))
    expect(Object.isFrozen(g)).toBe(true)
  })

  it('answers the same twice in a row (a read keeps no memory)', () => {
    const g = frozen(used())
    for (const name of names) expect(JSON.stringify(table[name]!(g)), name).toBe(JSON.stringify(table[name]!(g)))
  })

  it('works on a life that never touched the record, a child and a state the kit froze itself', () => {
    const fresh = frozenGame(3, { age: 30 })
    const child = frozenGame(3, { age: 9 })
    for (const g of [fresh, child]) {
      for (const name of names) expect(() => table[name]!(g), name).not.toThrow()
      expect(YOU_KEY in g.flags).toBe(false)
    }
    expect(postureNodes(child)).toEqual([])
    expect(ambitionReveal(child)).toEqual({ shown: false, word: '', value: 0 })
  })

  it('shows the Profile row from a frozen state too', async () => {
    const { ambitionRows } = await import('../src/ui/components/ProfileSheet')
    const grown = frozenGame(3, { age: 18 })
    expect(ambitionRows(grown)).toEqual([['Ambition', ambitionReveal(grown).word]])
    expect(ambitionRows(frozenGame(3, { age: 17 }))).toEqual([])
  })

  it('catches a read that does draw: the trap is live on this very state', () => {
    const g = frozen(used())
    expect(() => g.rng).toThrow(RngTrapError)
    expect(() => {
      g.flags[YOU_KEY] = 1
    }).toThrow(TypeError)
  })
})

describe('quote never reads the roll', () => {
  /** A deterministic generator in 0..1: a local one, nothing here touches g.rng. */
  function lcg(seed: number): () => number {
    let s = seed >>> 0
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 4294967296
    }
  }

  /** A grid of inputs from the generator: hostile numbers, every field, the actor given or read from the record. */
  function grid(n: number): EffortInput[] {
    const r = lcg(11)
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!
    const out: EffortInput[] = []
    for (let i = 0; i < n; i++) {
      const input: EffortInput = {}
      if (r() < 0.5) input.who = 'you'
      if (r() < 0.8) input.k = pick([0.001, 0.5, 1, 2, 4, 400, -3, NaN, Infinity])
      if (r() < 0.5) input.base = r()
      if (r() < 0.5) input.quality0 = pick([0, 40, 96, 1e9, NaN])
      if (r() < 0.5) input.people = [{ fte: pick([0, 1, 40, 4000]), skill: r() * 100, morale: r() * 100 }]
      if (r() < 0.5) input.tools = pick([0, 0.5, 1, 7])
      if (r() < 0.5) input.knowledge = pick([0, 30, 100, 1e6, NaN])
      if (r() < 0.5) input.ambition = pick([0, 49, 50, 100, 1e6])
      if (r() < 0.5) input.posture = pick(['lean', 'steady', 'push'] as const)
      if (r() < 0.5) input.fatigue = pick([0, 35, 85, 100, 1e6])
      if (r() < 0.5) input.rival = pick([0, 4, 1000])
      if (r() < 0.5) input.spill = pick([0, 9, 1000])
      out.push(input)
    }
    return out
  }

  it('is silent on the roll over 400 inputs, with the same answer as the plain input, on a frozen state', () => {
    const g = frozen(used())
    const t = task()
    for (const input of grid(400)) {
      const trapped = uTrap(input)
      let answer: Quote | undefined
      expect(() => {
        answer = quote(g, t, trapped)
      }).not.toThrow()
      expect(JSON.stringify(answer)).toBe(JSON.stringify(quote(g, t, input)))
    }
  })

  it('is silent on the roll for the whole input, passed through every shape the engine reads', () => {
    const g = frozen(used())
    const t = task()
    for (const input of [fullInput(), {}, { who: 'you' as const }, { baseTerms: [{ key: 'team' as const, label: 'team', pts: 5 }] }]) {
      expect(() => quote(g, t, uTrap(input))).not.toThrow()
    }
  })

  it('can fail: a quote that reads the roll trips the trap, and one that only spreads the input does not', () => {
    const peek = (input: EffortInput): number => (input as EffortInput & { u: number }).u
    expect(() => peek(uTrap({ k: 2 }))).toThrow(UTrapError)
    expect(() => ({ ...uTrap({ k: 2 }) })).not.toThrow()
    expect(Object.keys(uTrap({ k: 2 }))).toEqual(['k'])
    const wrapped = (g: GameState, t: Task, input: EffortInput): Quote => {
      peek(input)
      return quote(g, t, input)
    }
    expect(() => wrapped(frozenGame(1), task(), uTrap({}))).toThrow(UTrapError)
  })

  it('is the odds alone: the roll belongs to resolve, which is handed it, so one quote serves every roll', () => {
    const g = frozen(used())
    const t = task()
    const q = quote(g, t, fullInput())
    const outcomes = [0, 0.1, 0.5, 0.9, 0.999].map((u) => resolve(q, u))
    expect(outcomes.map((o) => o.kind === 'works' || o.kind === 'hit')).toEqual([0, 0.1, 0.5, 0.9, 0.999].map((u) => u < q.p))
    expect(outcomes[0]!.kind).toBe('works')
    expect(outcomes[4]!.kind).toBe('fail')
    expect(JSON.stringify(quote(g, t, fullInput()))).toBe(JSON.stringify(q))
  })
})

describe('the folder holds no draw and no clock', () => {
  const files = (): SourceFile[] => loadSources(ROOT, 'src/game/effort')

  /** Identifiers that draw a random number, name a stream, or read the clock. */
  const BANNED = [
    'rand', 'randInt', 'randFloat', 'chance', 'pick', 'weightedPick', 'shuffle', 'bell', 'uid', 'nextRandom', 'freshSeed', 'seeded', 'hashString',
    'stream', 'outcomeStream', 'streamUnit', 'textUnit', 'textStreamKey', 'random', 'rng', 'Date', 'performance',
  ]

  it('has the effort files to look at (every one of the tracks so far)', () => {
    const names = files().map((f) => f.path.replace('src/game/effort/', ''))
    for (const n of ['engine.ts', 'factors.ts', 'curves.ts', 'world.ts', 'persona.ts', 'step.ts', 'fx.ts', 'focus.ts', 'menu.ts', 'module.ts', 'why.ts', 'hooks.ts']) expect(names).toContain(n)
  })

  it('has no rand, chance, stream, .rng, Math.random or Date token in any file', () => {
    const found: string[] = []
    for (const f of files()) for (const t of f.toks) if (t.k === K_ID && BANNED.includes(t.v)) found.push(`${f.path}: ${t.v}`)
    expect(found).toEqual([])
  })

  it('imports no module that draws: not rng, not the streams', () => {
    const found: string[] = []
    for (const f of files()) {
      for (let i = 0; i < f.toks.length; i++) {
        const t = f.toks[i]!
        if (t.k === K_STR && /(^|\/)(rng|streams)$/.test(t.v)) found.push(`${f.path}: ${t.v}`)
      }
    }
    expect(found).toEqual([])
  })

  it('has a scan that can fail: a synthetic file that rolls, draws a stream or reads the clock is caught', () => {
    const bad = toSource('src/game/effort/bad.ts', "import { rand } from '../rng'\nexport const f = (g) => rand(g) + g.rng + Math.random() + Date.now()\n")
    const ids = bad.toks.filter((t) => t.k === K_ID && BANNED.includes(t.v)).map((t) => t.v)
    expect(ids).toEqual(expect.arrayContaining(['rand', 'rng', 'random', 'Date']))
    expect(bad.toks.some((t) => t.k === K_STR && /(^|\/)(rng|streams)$/.test(t.v))).toBe(true)
    // A word in a comment or a string is not a token, so prose is not a finding.
    const prose = toSource('src/game/effort/prose.ts', "// we never call rand or chance, and Date is not read\nexport const s = 'rand chance Date'\n")
    expect(prose.toks.filter((t) => t.k === K_ID && BANNED.includes(t.v))).toEqual([])
    expect(prose.toks.some((t) => t.k === K_PUNCT)).toBe(true)
  })

  it('keeps the whole folder free of the em-dash and the en-dash', () => {
    const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
    for (const f of files()) expect(dash.test(readFileSync(join(ROOT, f.path), 'utf8')), f.path).toBe(false)
  })
})

describe('what a hostile record does to a read', () => {
  /** A record a save may hold, written the way JSON would give it (so `__proto__` is an own key). */
  const hostile = (owner: string): Json[] => [
    'a string', 12345, null, [], [1, 2, 3], true,
    { owner, shift: 1e9, posture: 'sprint', effective: {}, over: -4, fieldK: 'no', at: [], burnouts: 1e12, burnAt: 'x', last: 'y' },
    JSON.parse(`{"owner": "${owner}", "fieldK": {"__proto__": 50, "constructor": 9, "rd.beverage": 1e9, "BAD KEY": 5}, "shift": "7"}`) as Json,
    { owner, fieldK: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`rd.f${i}`, i])), at: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`rd.f${i}`, 1e12])) },
    { owner: 'someone:else', shift: 12, posture: 'push', effective: 'push', fieldK: { 'rd.beverage': 99 } },
  ]

  it('reads as a bounded record on a frozen state, and quote and the rows still answer', () => {
    const t = task()
    for (const raw of hostile(ownerOf(makeTestGame(7, { age: 30 })))) {
      const g = makeTestGame(7, { age: 30 })
      g.flags[YOU_KEY] = raw
      deepFreeze(trapRng(g))
      const y = readYou(g)
      expect(Math.abs(y.shift)).toBeLessThanOrEqual(12)
      expect(Object.keys(y.fieldK).length).toBeLessThanOrEqual(40)
      expect(Object.keys(y.at).length).toBeLessThanOrEqual(40)
      for (const v of Object.values(y.fieldK)) expect(v >= 0 && v <= 100).toBe(true)
      expect(y.over >= 0 && y.over <= 60).toBe(true)
      expect(Object.getPrototypeOf(y.fieldK)).toBe(Object.prototype)
      const q = quote(g, t, { who: 'you' })
      expect(q.p >= 0.05 && q.p <= 0.95).toBe(true)
      expect(() => rowsOf(postureNodes(g), g)).not.toThrow()
      expect(ambitionOf(g)).toBeGreaterThanOrEqual(0)
      expect(ambitionOf(g)).toBeLessThanOrEqual(100)
    }
  })
})
