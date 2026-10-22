// ci: fast
// R3-E10 (C.12, the barrel and the note): the one door into the effort engine, and the document a migrator reads before using it.
//
// src/game/effort/index.ts is the door the migrated systems (business, the Workshop) import through, so it has to hold every name the
// track promised, each one the real thing and not a copy, and nothing that is not part of the contract. docs/EFFORT.md is the note
// that says how the model works and how to move a system onto it, so it has to stay true: every constant of limits.ts has a row with
// its present value (a ceiling that moves in the code and not in the note fails here), every name of the barrel is written down, and
// the doc holds the sections a migrator looks for. Nothing here plays a life, draws a number or books a dollar. No pinned seed.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import * as api from '../src/game/effort'
import type {
  BurnoutResult,
  CauseKind,
  EffortInput,
  EffortMode,
  EffortYou,
  FocusUse,
  Fx,
  Outcome,
  OutcomeKind,
  Posture,
  QualityCurve,
  Quote,
  Reason,
  ResolveOpts,
  Reveal,
  RevealPolicy,
  StepCtx,
  StepResult,
  Task,
  TaskSpec,
  TermKey,
  Worker,
} from '../src/game/effort'
import * as curves from '../src/game/effort/curves'
import * as engine from '../src/game/effort/engine'
import * as focus from '../src/game/effort/focus'
import * as fx from '../src/game/effort/fx'
import * as hooks from '../src/game/effort/hooks'
import * as knowhow from '../src/game/effort/knowhow'
import * as limits from '../src/game/effort/limits'
import * as menu from '../src/game/effort/menu'
import * as module_ from '../src/game/effort/module'
import * as persona from '../src/game/effort/persona'
import * as stepMod from '../src/game/effort/step'
import * as task from '../src/game/effort/task'
import * as why from '../src/game/effort/why'
import * as world from '../src/game/effort/world'
import { layerOf } from './layer-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DOC = readFileSync(join(ROOT, 'docs', 'EFFORT.md'), 'utf8')
const BARREL = readFileSync(join(ROOT, 'src', 'game', 'effort', 'index.ts'), 'utf8')
/** The barrel without its comment lines (the header writes an import path as an example). */
const CODE = BARREL.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')

/** An en-dash or an em-dash (written as code points so this file holds none). */
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

/** Every function the track promised, by the task that wrote it (00-crosscheck.md, section 2 of effort-core.md and its amendments). */
const FUNCTIONS: readonly string[] = [
  // R3-E1: the task builder, the know-how map, the two hooks
  'defineTask', 'normalizeTask', 'isField',
  'readKnowHow', 'knowHowOf', 'learnKnowHow', 'fadeKnowHow',
  'bindRevealed', 'revealedSink', 'bindRevealPolicy', 'revealPolicyOf',
  // R3-E2: the pure curves and the world terms
  'softCeil', 'laborOf', 'phiOf', 'workerOutput', 'crewRatio', 'rhoOf', 'boldOf', 'budgetQuality', 'knowGain', 'knowBank', 'knowOdds',
  'spillPts', 'rivalPts', 'ceilingOf',
  // R3-E3: the quote
  'quote',
  // R3-E4: the player's record
  'readYou', 'hasYou', 'blankYou', 'writeYou', 'ambitionOf', 'ambitionWord', 'ambitionReveal', 'postureOf', 'setPosture', 'effortStrain',
  'fatigueOf', 'burnedOut', 'recordWin', 'recordBurnout', 'staffDrive', 'youInput',
  // R3-E5: resolve, step and the fx record
  'causeOf', 'resolve', 'landQuality', 'step', 'newFx', 'normalizeFx',
  // R3-E6: the focus weeks, the posture rows and the module
  'isFocusKey', 'focusUsed', 'focusLeft', 'focusPreview', 'focusReason', 'spendFocus', 'postureNodes', 'yearlyEffort',
  // R3-E8: the words
  'oddsLine', 'whyLines', 'causeLine', 'payoffLine', 'whyNodes',
]

/** Every value (not a function) the track promised besides the constants of limits.ts. */
const VALUES: readonly string[] = ['EXACT_POLICY', 'YOU_KEY', 'POSTURE_LABELS', 'STAFF_DRIVE', 'FX_CAPS', 'FOCUS_KEYS', 'FOCUS_FULL_TEXT', 'effortModule']

/** The types the barrel re-exports. They leave no trace at run time, so the import above (tsc) and the source text below both hold them. */
const TYPE_NAMES: readonly string[] = [
  'BurnoutResult', 'CauseKind', 'EffortInput', 'EffortMode', 'EffortYou', 'FocusUse', 'Fx', 'Outcome', 'OutcomeKind', 'Posture', 'QualityCurve',
  'Quote', 'Reason', 'ResolveOpts', 'Reveal', 'RevealPolicy', 'StepCtx', 'StepResult', 'Task', 'TaskSpec', 'TermKey', 'Worker',
]

/** Compile-time: each name is a real type of the barrel (a rename or a removal is a tsc error here). */
type Exported = [
  BurnoutResult, CauseKind, EffortInput, EffortMode, EffortYou, FocusUse, Fx, Outcome, OutcomeKind, Posture, QualityCurve, Quote, Reason,
  ResolveOpts, Reveal, RevealPolicy, StepCtx, StepResult, Task, TaskSpec, TermKey, Worker,
]
const typesAreThere: Exported | null = null

/** The runtime exports of every effort file the barrel draws from. */
const SOURCES: readonly (readonly [string, Record<string, unknown>])[] = [
  ['limits', limits], ['task', task], ['knowhow', knowhow], ['hooks', hooks], ['curves', curves], ['world', world], ['engine', engine],
  ['persona', persona], ['fx', fx], ['step', stepMod], ['focus', focus], ['menu', menu], ['module', module_], ['why', why],
]

const exported = (): Record<string, unknown> => api as unknown as Record<string, unknown>

describe('the barrel holds every name of the contract', () => {
  it('exports each function of the track', () => {
    const missing = FUNCTIONS.filter((n) => typeof exported()[n] !== 'function')
    expect(missing).toEqual([])
  })

  it('exports each value of the track, and every constant of limits.ts', () => {
    const missing = [...VALUES, ...Object.keys(limits)].filter((n) => exported()[n] === undefined)
    expect(missing).toEqual([])
  })

  it('writes every type name in its source', () => {
    for (const t of TYPE_NAMES) expect(BARREL, `index.ts leaves out the type ${t}`).toMatch(new RegExp(`\\b${t}\\b`))
    expect(typesAreThere).toBeNull()
  })

  it('exports no name that is undefined', () => {
    const undef = Object.keys(exported()).filter((n) => exported()[n] === undefined)
    expect(undef).toEqual([])
  })

  it('lists each function once and no function twice across the lists', () => {
    expect(new Set(FUNCTIONS).size).toBe(FUNCTIONS.length)
    expect(new Set(VALUES).size).toBe(VALUES.length)
    expect(FUNCTIONS.filter((n) => VALUES.includes(n))).toEqual([])
  })
})

describe('each name is the real one, not a copy', () => {
  it('is the very function or value its own file exports', () => {
    const wrong: string[] = []
    for (const [file, ns] of SOURCES) {
      for (const name of Object.keys(ns)) {
        if (name in exported() && exported()[name] !== ns[name]) wrong.push(`${name} (${file})`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('draws every export from one of the effort files, so the barrel writes no function of its own', () => {
    const own = Object.keys(exported()).filter((n) => !SOURCES.some(([, ns]) => n in ns))
    expect(own).toEqual([])
  })

  it('shares the focus pool constant with limits.ts (a re-export from two files is one binding)', () => {
    expect(api.FOCUS_WEEKS).toBe(limits.FOCUS_WEEKS)
    expect(focus.FOCUS_WEEKS).toBe(limits.FOCUS_WEEKS)
  })

  it('keeps the internals of the engine out of the door', () => {
    for (const n of ['deviate', 'attribute', 'moneyOdds', 'speedOf', 'risksOf', 'payrollOf', 'cleanBaseTerms', 'isRecord', 'hasOwn', 'clampNum', 'cutNum', 'round2']) {
      expect(exported()[n], `${n} is an internal`).toBeUndefined()
    }
  })

  it('loads first in a fresh module registry and exports no undefined (the way a hub is entered)', async () => {
    vi.resetModules()
    const m = (await import('../src/game/effort')) as Record<string, unknown>
    const names = Object.keys(m)
    expect(names.length).toBeGreaterThan(FUNCTIONS.length)
    expect(names.filter((n) => m[n] === undefined)).toEqual([])
    expect(typeof m.quote).toBe('function')
    expect((m.effortModule as { id: string }).id).toBe('effort.you')
  }, 120_000)
})

describe('the door sits in layer 2 and looks only down', () => {
  it('is a layer 2 file, so a domain imports it with no contract.ts', () => {
    expect(layerOf('src/game/effort/index.ts')).toBe(2)
  })

  it('imports only its own folder', () => {
    const froms = [...CODE.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!)
    expect(froms.length).toBeGreaterThan(10)
    expect(froms.filter((f) => !f.startsWith('./'))).toEqual([])
  })

  it('holds no dash and no function body: it re-exports and nothing else', () => {
    expect(DASH.test(BARREL)).toBe(false)
    const code = CODE.split('\n').filter((l) => l.trim() !== '')
    const bad = code.filter((l) => !/^(export\b|\}|\s+[A-Za-z_$][\w$]*,?\s*$|\s+type [A-Za-z_$][\w$]*,?\s*$)/.test(l) && !/^import type\b/.test(l))
    expect(bad).toEqual([])
  })
})

/** The section of the doc under a heading that matches `re`, up to the next heading of the same level. */
function section(re: RegExp): string {
  const lines = DOC.split('\n')
  const at = lines.findIndex((l) => /^## /.test(l) && re.test(l))
  if (at < 0) return ''
  let end = lines.findIndex((l, i) => i > at && /^## /.test(l))
  if (end < 0) end = lines.length
  return lines.slice(at, end).join('\n')
}

/** The words a value is written with in a table row: a number as itself, a string as itself, a record as every key and every value. */
function written(v: unknown): string[] {
  if (typeof v === 'number') return [String(v)]
  if (typeof v === 'string') return [v]
  if (typeof v === 'object' && v !== null) return Object.entries(v).flatMap(([k, x]) => [k, ...written(x)])
  return [String(v)]
}

describe('docs/EFFORT.md', () => {
  const constants = section(/constants/i)
  const rows = constants.split('\n').filter((l) => /^\| `[A-Z][A-Z0-9_]*` \|/.test(l))
  const rowOf = (name: string): string => rows.find((l) => l.startsWith(`| \`${name}\` |`)) ?? ''

  it('exists, and holds no em-dash or en-dash', () => {
    expect(DOC.length).toBeGreaterThan(4000)
    expect(DASH.test(DOC)).toBe(false)
  })

  it('has a row for every constant of limits.ts, with the value it holds now', () => {
    const wrong: string[] = []
    for (const [name, value] of Object.entries(limits)) {
      const row = rowOf(name)
      if (row === '') wrong.push(`${name}: no row`)
      else for (const w of written(value)) if (!row.includes(w)) wrong.push(`${name}: the row does not say ${w}`)
    }
    expect(wrong).toEqual([])
  })

  it('has no row for a constant that limits.ts no longer holds', () => {
    const names = rows.map((l) => /^\| `([A-Z0-9_]+)`/.exec(l)![1]!)
    expect(names.filter((n) => !(n in limits))).toEqual([])
    expect(new Set(names).size).toBe(names.length)
  })

  it('names every function and value of the barrel', () => {
    const missing = [...FUNCTIONS, ...VALUES].filter((n) => !DOC.includes(`\`${n}\``))
    expect(missing).toEqual([])
  })

  it('writes the type names of the barrel too', () => {
    const api_ = section(/the api/i)
    expect(api_.length).toBeGreaterThan(500)
    expect(TYPE_NAMES.filter((n) => !api_.includes(`\`${n}\``))).toEqual([])
  })

  it('has the sections a migrator looks for', () => {
    for (const re of [/what the engine is/i, /the model/i, /the player/i, /results/i, /what the player reads/i, /constants/i, /how to migrate a system/i, /reserved/i, /guards/i, /the api/i]) {
      expect(section(re).length, `no section for ${re}`).toBeGreaterThan(200)
    }
  })

  it('tells a migrator the steps: calibrate to today, add no crew, keep the parity grid green', () => {
    const how = section(/how to migrate a system/i)
    for (const w of ['defineTask', 'p0', 'oddsExp', 'yearsExp', 'minYears', 'maxYears', 'quality', 'people', 'parity', 'newFx', 'quote', 'resolve', 'step', 'knowHow', 'spend']) {
      expect(how, `the migration steps never say ${w}`).toContain(w)
    }
    expect(how).toMatch(/one draw/i)
    expect(how).toMatch(/ledger/i)
    expect(how).toMatch(/test\/fixtures\/effort-parity\.json/)
  })

  it('says that the risks and the overtime pay are reported and not rolled or booked (decision D12)', () => {
    const reserved = section(/reserved/i)
    for (const w of ['risk', 'payrollX', 'shortcut', 'explosion', 'scandal', 'effort.risk']) expect(reserved, `reserved never says ${w}`).toContain(w)
    expect(reserved).toMatch(/not rolled/i)
    expect(reserved).toMatch(/not booked|never booked/i)
  })

  it('states the rules that have no type: no draw in a read, no money, the 15 points, the 1.25 ceiling', () => {
    const model = section(/what the engine is/i) + section(/the model/i) + section(/results/i) + section(/the player/i)
    expect(model).toMatch(/draws no random number/i)
    expect(model).toMatch(/books no dollar/i)
    expect(model).toMatch(/15 odds points/)
    expect(model).toMatch(/1\.25/)
    expect(model).toMatch(/flags\['effort\.you'\]/)
    expect(model).toMatch(/12 focus weeks|pool of 12/)
  })
})
