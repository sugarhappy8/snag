// Deep engine fuzzer (opt-in; see test/fuzz-deep.test.ts and scripts/fuzz-engine.ts).
//
// Plays random lives across eras, countries and talents through the real engine the way the UI
// store does: menus are rendered from the committed state, an action runs on a structuredClone
// draft, then the popup queue is drained. The committed state is deep-frozen between steps, so a
// render that writes to it (or rolls its RNG) and an action closure that writes to an object it
// captured from it (instead of the draft) both throw at the offending line.
//
// Every year it walks the whole menu tree (Activities, Occupation, Assets, every person's actions
// and every company's screen) evaluating every visible / subtitle / hint / disabledReason /
// header / info text / confirm / input default and preview (and flags "NaN", "undefined" and
// "[object Object]" in player-facing text). It takes random actions with edge-case inputs, sweeps
// a sample of all enabled rows on throwaway drafts, founds companies, travels with the Time
// Machine (snapshot round trips), continues as an heir, and after every step checks the state
// invariants: finite numbers everywhere, stats in range, unique ids, plain JSON, unique popup ids,
// answerable popups, saves that load back unchanged. Each distinct failure is recorded with its
// seed and the trail of steps that led there. 'note-' findings (a single action that multiplied
// net worth) are for a human to review, not failures.
//
// No vitest imports here: the same kit runs under vitest and as a bundled node script.
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { businessAssetView } from '../src/game/business'
import { businessAssets } from '../src/game/business/state'
import { addMoney, bindMoneyContext, netWorth } from '../src/game/core'
import { acctBalance, flowsOf, ledgerProblems, peekLedger, playerAcct } from '../src/game/kernel/ledger'
import { continueAsChild, createNewLife } from '../src/game/life'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { createPerson } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import { forgetFuture, loadGame, loadSnapshot, memorySnapshotBackend, saveGame, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot } from '../src/game/save'
import { hasScript, runScript } from '../src/game/scripts'
import { ALL_TALENT_IDS, MAIN_CHARACTER } from '../src/game/talents'
import { arriveInPast, jumpsUsed, TIME_MACHINE_JUMPS } from '../src/game/timeMachine'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { COUNTRIES, getCountry } from '../src/game/world'
import { ROYAL_RULES, royalRule } from '../src/game/royalty'
import { HIDDEN_KEYS, STAT_KEYS, type AnnualReportData, type GameState, type MenuAction, type MenuGroup, type MenuInput, type MenuNode, type MinigameModal, type ModalItem } from '../src/game/types'
import { sliderOutput, sliderScale } from '../src/ui/components/menuModel'

// ---------------------------------------------------------------------------
// Driver RNG (separate from the game's, so the driver never depends on engine rolls)

export function driver(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  }
}
export type Driver = ReturnType<typeof driver>

// ---------------------------------------------------------------------------
// Failures

export interface Failure {
  kind: string
  signature: string
  message: string
  stack: string
  seed: number
  birthYear: number
  countryId: string
  age: number
  year: number
  trail: string[]
}

export class FailureLog {
  readonly bySig = new Map<string, { first: Failure; count: number }>()
  /** Called with each failure the first time its signature is seen. */
  onNew: ((f: Failure) => void) | null = null
  add(f: Failure): void {
    const hit = this.bySig.get(f.signature)
    if (hit) hit.count++
    else {
      this.bySig.set(f.signature, { first: f, count: 1 })
      this.onNew?.(f)
    }
  }
  get size(): number {
    return this.bySig.size
  }
  list(): { first: Failure; count: number }[] {
    return [...this.bySig.values()]
  }
}

/** The first stack frame inside src/ (so the same bug from different callers dedupes). */
function srcFrame(stack: string): string {
  const lines = stack.split('\n').slice(1)
  const frame = lines.find((l) => /src[\\/]game[\\/]/.test(l)) ?? lines.find((l) => /src[\\/]/.test(l)) ?? lines[0] ?? ''
  const m = /src[\\/][^\s):]+(?::\d+)?/.exec(frame)
  return m ? m[0] : frame.trim()
}

function normalize(msg: string): string {
  return msg
    .replace(/[-\d.,]+/g, '#')
    .replace(/"[^"]{20,}"/g, '"…"')
    .slice(0, 200)
}

// ---------------------------------------------------------------------------
// Inputs

const ODD_TEXT = [
  'Alex',
  '  padded name  ',
  '🎉 Émile ñandú 漢字',
  'x'.repeat(300),
  '<b>bold</b> & "quotes"',
  '0',
  '-1',
  '__proto__',
  'constructor',
  'Go for a long run',
  'Write a song about my cat',
  'Steal a candy bar',
  'Ask my boss for a raise',
  'Start a garage band with my best friend',
  'rob a bank',
  'buy a house',
]

function textValue(d: Driver, def: string | undefined, maxLen: number): string {
  const raw = def && d.chance(0.4) ? def : d.pick(ODD_TEXT)
  // The UI trims text and refuses an empty field; fields cap their length.
  const t = raw.trim().slice(0, maxLen).trim()
  return t || 'Alex'
}

type Bound = { min?: number; max?: number; money?: boolean; step?: number; slider: boolean }

/** A value the UI would hand over for a number/money/slider field (edge values often). */
function numberValue(d: Driver, b: Bound, def?: string): string | null {
  const fin = (x: number | undefined) => typeof x === 'number' && Number.isFinite(x)
  if (b.slider && fin(b.min) && fin(b.max) && b.max! >= b.min!) {
    const s = sliderScale(b.min!, b.max!, b.step ?? 1, 1)
    const span = s.max - s.min
    const pickV = d.pick(['min', 'max', 'mid', 'rand', 'rand', 'def'] as const)
    const v =
      pickV === 'min' ? s.min
      : pickV === 'max' ? s.max
      : pickV === 'mid' ? s.min + span / 2
      : pickV === 'def' && def !== undefined && Number.isFinite(Number(def)) ? Number(def)
      : s.min + d.next() * span
    return sliderOutput(s, v, b.money === true)
  }
  // A plain field (or a slider without usable bounds, which the UI shows as a field).
  if (fin(b.min) && fin(b.max) && b.min! > b.max!) return null // nothing can be typed
  if (b.money) {
    // Money fields parse digits only (no sign); normalizeInput rounds and clamps to [min, max].
    const lo = Math.max(0, fin(b.min) ? Math.ceil(b.min!) : 0)
    const hi = fin(b.max) ? Math.floor(b.max!) : d.pick([1e4, 1e6, 1e9, 1e13])
    if (hi < lo) return String(lo)
    const pickV = d.pick(['min', 'max', 'zero', 'mid', 'rand', 'def'] as const)
    let v =
      pickV === 'min' ? lo
      : pickV === 'max' ? hi
      : pickV === 'zero' ? 0
      : pickV === 'mid' ? (lo + hi) / 2
      : pickV === 'def' && def !== undefined && Number.isFinite(Number(def)) ? Number(def)
      : lo + d.next() * (hi - lo)
    v = Math.round(Math.abs(v))
    if (fin(b.max)) v = Math.min(v, Math.floor(b.max!))
    if (fin(b.min)) v = Math.max(v, Math.ceil(b.min!))
    return String(v)
  }
  const lo = fin(b.min) ? b.min! : d.pick([-1_000_000, -1, 0])
  const hi = fin(b.max) ? b.max! : d.pick([10, 1000, 1e9, 1e15])
  const pickV = d.pick(['min', 'max', 'zero', 'mid', 'rand', 'def', 'neg'] as const)
  let v =
    pickV === 'min' ? lo
    : pickV === 'max' ? hi
    : pickV === 'zero' ? 0
    : pickV === 'neg' ? -1
    : pickV === 'mid' ? (lo + hi) / 2
    : pickV === 'def' && def !== undefined && Number.isFinite(Number(def)) ? Number(def)
    : lo + d.next() * (hi - lo)
  v = Math.round(v)
  // The UI refuses values outside the bounds it knows about.
  if (fin(b.min) && v < b.min!) v = Math.ceil(b.min!)
  if (fin(b.max) && v > b.max!) v = Math.floor(b.max!)
  return String(v)
}

function menuInputValue(g: GameState, input: MenuInput, d: Driver, ctx: Ctx, where: string): string | null {
  let def: string | undefined
  if (input.defaultValue) {
    try {
      def = input.defaultValue(g)
    } catch (err) {
      ctx.fail('menu-throw', err, `input.defaultValue ${where}`)
    }
  }
  if (input.kind === 'text') return textValue(d, def, 300)
  return numberValue(d, { min: input.min, max: input.max, money: input.money, step: input.step, slider: input.kind === 'slider' }, def)
}

function modalInputValue(m: Extract<ModalItem, { kind: 'input' }>, d: Driver): string | null {
  if (m.input === 'text') return textValue(d, m.defaultValue, 120)
  return numberValue(d, { min: m.min, max: m.max, money: m.money, step: m.step, slider: m.input === 'slider' }, m.defaultValue)
}

function minigameResult(m: MinigameModal, d: Driver): string {
  switch (m.game) {
    case 'blackjack':
      return d.pick(['win', 'lose', 'push', 'blackjack', 'win:double', 'lose:bust', 'win:charlie', 'lose:double:bust'])
    case 'horseRace':
    case 'slots':
    case 'nationReport':
      return 'done'
    case 'burglary':
      return d.chance(0.2)
        ? JSON.stringify({ loot: 0, caught: false, rooms: [] })
        : JSON.stringify({ loot: d.int(0, 20000), caught: d.chance(0.3), rooms: ['living'], ...(d.chance(0.3) ? { by: d.pick(['dog', 'owner', 'police']) } : {}) })
    case 'prisonEscape':
      return d.pick(['escaped', 'caught', 'quit'])
    case 'pickpocket':
      return d.pick(['success', 'fail', 'cancel'])
    case 'annualReport': {
      if (d.chance(0.2)) return 'skip'
      const r = m.data as unknown as AnnualReportData
      const lo = Number.isFinite(r.minPrice) ? r.minPrice : 0
      const hi = Number.isFinite(r.maxPrice) ? r.maxPrice : lo
      const maxP = Number.isFinite(r.maxProduction) ? r.maxProduction : 0
      const price = d.pick([lo, hi, r.suggestedPrice, lo + d.next() * (hi - lo)])
      const production = d.pick([0, maxP, Math.round(r.expectedDemand), d.int(0, Math.max(0, Math.round(maxP)))])
      const cents = (x: number) => Math.round(x * 100) / 100
      return JSON.stringify({ price: cents(Math.min(hi, Math.max(lo, price))), production: Math.min(maxP, Math.max(0, Math.round(production))) })
    }
  }
}

// ---------------------------------------------------------------------------
// Context

interface Ctx {
  /** Birth year of each life seen (lifeId -> year - age). */
  born: Map<string, number>
  seed: number
  birthYear: number
  g: GameState
  trail: string[]
  log: FailureLog
  fail: (kind: string, err: unknown, where: string) => void
}

function makeCtx(seed: number, birthYear: number, g: GameState, log: FailureLog): Ctx {
  const ctx: Ctx = {
    born: new Map(),
    seed,
    birthYear,
    g,
    trail: [],
    log,
    fail: (kind, err, where) => {
      const e = err instanceof Error ? err : new Error(String(err))
      const stack = e.stack ?? e.message
      const frame = kind.endsWith('throw') ? srcFrame(stack) : ''
      const whereSig = where.replace(/[a-z]+_[a-z0-9]+|\b[a-z]{2,6}\d+[a-z0-9]*\b|\d+/gi, '#')
      ctx.log.add({
        kind,
        // Text problems dedupe on the text itself (the same row shows under several roots).
        signature: kind.startsWith('text') ? `${kind} | ${normalize(e.message)}` : `${kind} | ${normalize(e.message)} | ${frame || whereSig.slice(0, 160)}`,
        message: `${where}: ${e.message}`,
        stack: stack.split('\n').slice(0, 12).join('\n'),
        seed: ctx.seed,
        birthYear: ctx.birthYear,
        countryId: ctx.g.character.countryId,
        age: ctx.g.character.age,
        year: ctx.g.year,
        trail: ctx.trail.slice(-30),
      })
    },
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Text checks

// Formatting bugs that leak into player-facing text ("$NaN", "undefined", "[object Object]").
// "Infinity" only counts next to money or a unit, so names like "Infinity Pool Island" pass.
const BAD_TEXT = /\bNaN\b|\bundefined\b|\[object Object\]|\de[+-]\d{2}\b|[$€£¥₹]\s?-?Infinity|-?Infinity\s?(?:%|x\b|years?\b|yrs?\b)|^-?Infinity$|\bnull(?:%|\s(?:years?|yrs?)\b)|[$€£¥₹]\s?null\b/

function checkText(ctx: Ctx, text: unknown, where: string): void {
  if (text === null || text === undefined) return
  if (typeof text !== 'string') {
    ctx.fail('text-type', new Error(`expected a string, got ${typeof text}`), where)
    return
  }
  const m = BAD_TEXT.exec(text)
  if (m) ctx.fail('text-bad', new Error(`"${m[0]}" in text: ${text.slice(Math.max(0, m.index - 60), m.index + 60)}`), where)
}

// ---------------------------------------------------------------------------
// Menu walk

export interface WalkOptions {
  maxDepth: number
  /** Evaluate every field (full checks) vs. only what's needed to find runnable actions. */
  full: boolean
  /** Hard cap on nodes visited per root (keeps pathological trees bounded). */
  maxNodes: number
}

interface Found {
  action: MenuAction
  path: string
}

function safe<T>(ctx: Ctx, where: string, f: () => T, fallback: T): T {
  try {
    return f()
  } catch (err) {
    ctx.fail(isFrozenWrite(err) ? 'menu-mutates-throw' : 'menu-throw', err, where)
    return fallback
  }
}

function walk(ctx: Ctx, g: GameState, nodes: MenuNode[], path: string, depth: number, opt: WalkOptions, out: Found[], counter: { n: number }): void {
  if (!Array.isArray(nodes)) {
    ctx.fail('menu-shape', new Error('children() did not return an array'), path)
    return
  }
  const ids = new Set<string>()
  for (const n of nodes) {
    if (counter.n++ > opt.maxNodes) return
    if (!n || typeof n !== 'object' || typeof n.id !== 'string') {
      ctx.fail('menu-shape', new Error(`bad node ${JSON.stringify(n)?.slice(0, 80)}`), path)
      continue
    }
    const p = `${path}/${n.id}`
    if (opt.full && ids.has(n.id) && n.type !== 'info' && n.type !== 'heading') ctx.fail('menu-dup-id', new Error(`duplicate sibling id ${n.id}`), p)
    ids.add(n.id)
    const visible = n.visible ? safe(ctx, `visible ${p}`, () => n.visible!(g), false) : true
    if (!visible) continue
    if (n.type === 'heading') {
      if (opt.full) checkText(ctx, n.label, `heading ${p}`)
      continue
    }
    if (n.type === 'info') {
      if (opt.full) checkText(ctx, typeof n.text === 'string' ? n.text : safe(ctx, `info ${p}`, () => (n.text as (g: GameState) => string)(g), ''), `info ${p}`)
      continue
    }
    if (opt.full) {
      checkText(ctx, n.label, `label ${p}`)
      if (typeof n.subtitle === 'function') checkText(ctx, safe(ctx, `subtitle ${p}`, () => (n.subtitle as (g: GameState) => string)(g), ''), `subtitle ${p}`)
      else checkText(ctx, n.subtitle, `subtitle ${p}`)
      if (n.hint) checkText(ctx, safe(ctx, `hint ${p}`, () => n.hint!(g), null), `hint ${p}`)
    }
    const disabled = n.disabledReason ? safe(ctx, `disabledReason ${p}`, () => n.disabledReason!(g), null) : null
    if (opt.full && disabled) checkText(ctx, disabled, `disabledReason ${p}`)
    if (n.type === 'action') {
      if (opt.full) {
        if (n.confirm && !disabled) checkText(ctx, safe(ctx, `confirm ${p}`, () => n.confirm!(g), null), `confirm ${p}`)
        const input = n.input
        if (input) {
          let def: string | undefined
          if (input.defaultValue) def = safe(ctx, `input.defaultValue ${p}`, () => input.defaultValue!(g), '')
          if (def !== undefined && typeof def !== 'string') ctx.fail('menu-shape', new Error(`defaultValue is ${typeof def}`), p)
          const fin = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
          if ((input.min !== undefined && !fin(input.min)) || (input.max !== undefined && !fin(input.max))) {
            if (input.kind !== 'text') ctx.fail('menu-input', new Error(`non-finite bounds min=${input.min} max=${input.max}`), p)
          } else if (fin(input.min) && fin(input.max) && input.min! > input.max! && !disabled) {
            ctx.fail('menu-input', new Error(`min ${input.min} > max ${input.max} on an enabled ${input.kind}`), p)
          }
          if (input.kind === 'slider' && !disabled && !(fin(input.min) && fin(input.max))) ctx.fail('menu-input', new Error('slider without finite bounds'), p)
          if (input.preview && fin(input.min) && fin(input.max)) {
            // One value per render (rotating min / max / middle): previews can be expensive.
            const lo = input.min!, hi = Math.max(lo, input.max!)
            const v = [lo, hi, Math.round((lo + hi) / 2)][counter.n % 3]
            checkText(ctx, safe(ctx, `preview(${v}) ${p}`, () => input.preview!(g, v), ''), `preview ${p}`)
          }
        }
      }
      if (!disabled) out.push({ action: n, path: p })
      continue
    }
    // A group.
    if (disabled) continue
    if (opt.full && n.header) checkText(ctx, safe(ctx, `header ${p}`, () => n.header!(g), ''), `header ${p}`)
    // A cockpit tile (R1-N8, id `hub.`) adds no depth: the company screen is walked as deep as the flat list was.
    const next = n.id.startsWith('hub.') ? depth : depth + 1
    if (next > opt.maxDepth) continue
    const kids = safe(ctx, `children ${p}`, () => n.children(g), [] as MenuNode[])
    walk(ctx, g, kids, p, next, opt, out, counter)
  }
}

/** Every root the UI can show: the three tabs, each person's sheet and each company's screen. */
function roots(g: GameState): { name: string; nodes: () => MenuNode[] }[] {
  const out: { name: string; nodes: () => MenuNode[] }[] = [
    { name: 'activities', nodes: () => activitiesMenu.children(g) },
    { name: 'occupation', nodes: () => occupationMenu.children(g) },
    { name: 'assets', nodes: () => assetsMenu.children(g) },
  ]
  for (const p of g.people) out.push({ name: `person:${p.relation}`, nodes: () => personActions(g, p) })
  for (const a of businessAssets(g)) out.push({ name: `biz:${String(a.details.industry)}`, nodes: () => businessAssetView(g, a) })
  return out
}

function walkRoot(ctx: Ctx, g: GameState, root: { name: string; nodes: () => MenuNode[] }, opt: WalkOptions, out: Found[]): void {
  const nodes = safe(ctx, `root ${root.name}`, root.nodes, [] as MenuNode[])
  walk(ctx, g, nodes, root.name, 1, opt, out, { n: 0 })
}

/**
 * Full walk of every root. The committed state is deep-frozen, so a render that writes to it
 * (or rolls its RNG) throws at the offending line and is reported as 'menu-mutates-throw'.
 */
function fullWalk(ctx: Ctx, g: GameState, opt: WalkOptions): Found[] {
  if (!Object.isFrozen(g)) deepFreeze(g)
  const out: Found[] = []
  for (const r of roots(g)) walkRoot(ctx, g, r, opt, out)
  return out
}

/**
 * Render every menu of a copy of `g` with the full checks (frozen, so writes throw); failures go
 * to `log`. Returns how many enabled actions it saw. For quick one-off probes of a crafted state.
 */
export function renderAll(g: GameState, log: FailureLog, maxDepth = 6): number {
  const copy = structuredClone(g)
  const ctx = makeCtx(0, copy.year - copy.character.age, copy, log)
  deepFreeze(copy)
  bindMoneyContext(copy)
  const n = fullWalk(ctx, copy, { maxDepth, full: true, maxNodes: 20000 }).length
  bindMoneyContext(null)
  return n
}

/** The first few paths where two JSON documents differ. */
export function diffSummary(a: string, b: string): string {
  const diffs: string[] = []
  const rec = (x: unknown, y: unknown, path: string, depth: number) => {
    if (diffs.length > 6) return
    if (JSON.stringify(x) === JSON.stringify(y)) return
    if (depth > 8 || !x || !y || typeof x !== 'object' || typeof y !== 'object') {
      diffs.push(`${path}: ${JSON.stringify(x)?.slice(0, 80)} -> ${JSON.stringify(y)?.slice(0, 80)}`)
      return
    }
    const keys = new Set([...Object.keys(x as object), ...Object.keys(y as object)])
    for (const k of keys) rec((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], `${path}.${k}`, depth + 1)
  }
  rec(JSON.parse(a), JSON.parse(b), 'g', 0)
  return diffs.join('; ')
}

// ---------------------------------------------------------------------------
// Invariants

/** Plain JSON only, every number finite. Returns the first few offending paths. */
function deepScan(g: GameState): string[] {
  const bad: string[] = []
  const seen = new Set<object>()
  const rec = (v: unknown, path: string, depth: number) => {
    if (bad.length >= 8) return
    if (depth > 120) {
      bad.push(`${path}: nesting deeper than 120`)
      return
    }
    switch (typeof v) {
      case 'number':
        if (!Number.isFinite(v)) bad.push(`${path} = ${v}`)
        return
      case 'string':
      case 'boolean':
        return
      case 'undefined':
        // Object properties set to undefined vanish in JSON (fine); inside arrays they become null.
        return
      case 'object': {
        if (v === null) return
        if (seen.has(v)) {
          bad.push(`${path}: shared/cyclic reference`)
          return
        }
        seen.add(v)
        const proto = Object.getPrototypeOf(v)
        if (Array.isArray(v)) {
          v.forEach((x, i) => {
            if (x === undefined) bad.push(`${path}[${i}] = undefined in an array`)
            else rec(x, `${path}[${i}]`, depth + 1)
          })
        } else if (proto === Object.prototype || proto === null) {
          for (const [k, x] of Object.entries(v)) rec(x, `${path}.${k}`, depth + 1)
        } else bad.push(`${path}: not plain JSON (${proto?.constructor?.name})`)
        seen.delete(v)
        return
      }
      default:
        bad.push(`${path}: ${typeof v}`)
    }
  }
  rec(g, 'g', 0)
  return bad
}

/**
 * Freeze the committed state, like a React store treats it: any code that writes to it (a menu
 * render, a stale action closure) throws right at the offending line in strict mode.
 */
export function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

const FROZEN_WRITE = /read[- ]only|not extensible|Cannot assign|Cannot add property|Cannot delete|object is not extensible|Cannot define property/i

function isFrozenWrite(err: unknown): boolean {
  return err instanceof TypeError && FROZEN_WRITE.test(err.message)
}

function jsonNodeCount(g: GameState): { nodes: number; depth: number } {
  let nodes = 0
  let maxDepth = 0
  const stack: [unknown, number][] = [[g, 0]]
  while (stack.length) {
    const [item, depth] = stack.pop()!
    nodes++
    if (depth > maxDepth) maxDepth = depth
    if (item && typeof item === 'object') for (const c of Array.isArray(item) ? item : Object.values(item)) stack.push([c, depth + 1])
  }
  return { nodes, depth: maxDepth }
}

function checkInvariants(ctx: Ctx, g: GameState, where: string): boolean {
  let ok = true
  const fail = (msg: string) => {
    ok = false
    ctx.fail('invariant', new Error(msg), where)
  }
  const bad = deepScan(g)
  if (bad.length) fail(`non-JSON or non-finite state: ${bad.join('; ')}`)
  const c = g.character
  for (const k of STAT_KEYS) if (!(c.stats[k] >= 0 && c.stats[k] <= 100)) fail(`stat ${k} = ${c.stats[k]}`)
  for (const k of HIDDEN_KEYS) if (!(c.hidden[k] >= 0 && c.hidden[k] <= 100)) fail(`hidden ${k} = ${c.hidden[k]}`)
  if (!Number.isFinite(netWorth(g))) fail('net worth not finite')
  const ids = g.people.map((p) => p.id)
  if (new Set(ids).size !== ids.length) fail('duplicate person ids')
  const aids = g.assets.map((a) => a.id)
  if (new Set(aids).size !== aids.length) fail(`duplicate asset ids ${aids.filter((x, i) => aids.indexOf(x) !== i).join(',')}`)
  // The calendar and the character's age move together (a Time Machine trip restores both).
  const born = g.year - c.age
  const known = ctx.born.get(g.lifeId)
  if (known === undefined) ctx.born.set(g.lifeId, born)
  else if (known !== born) fail(`year ${g.year} and age ${c.age} no longer agree (born ${known})`)
  for (const p of g.people) {
    if (!(p.age >= 0)) fail(`person ${p.relation} age ${p.age}`)
    if (p.alive && p.age > 125) fail(`person ${p.relation} still alive at ${p.age}`)
    if (!(p.relationship >= 0 && p.relationship <= 100)) fail(`person ${p.relation} relationship ${p.relationship}`)
    for (const k of STAT_KEYS) if (!(p.stats[k] >= 0 && p.stats[k] <= 100)) fail(`person ${p.relation} ${k} = ${p.stats[k]}`)
  }
  for (const a of g.assets) {
    if (!Number.isFinite(a.value) || a.value < 0) fail(`asset ${a.kind} ${a.name} value ${a.value}`)
    if (a.mortgage && !(a.mortgage.balance >= 0)) fail(`asset ${a.name} mortgage balance ${a.mortgage.balance}`)
  }
  for (const l of c.loans) if (!(Number.isFinite(l.balance) && l.balance >= -0.01)) fail(`loan ${l.kind} balance ${l.balance}`)
  // The books: every account whole, the sum equal to mint less burn, every flow row netting to zero, every cap kept (R2-L5).
  for (const p of ledgerProblems(g)) fail(`ledger: ${p}`)
  return ok
}

/**
 * Not necessarily a bug: a single action that multiplied the player's net worth. Recorded as a
 * 'note-' kind for a human to review (exploits such as a negative amount that pays you).
 */
function noteWindfall(ctx: Ctx, before: number, after: GameState, where: string): void {
  const now = netWorth(after)
  if (now - before > Math.max(5e6, 2 * Math.abs(before))) {
    ctx.fail('note-windfall', new Error(`net worth ${Math.round(before)} -> ${Math.round(now)}`), where)
  }
}

// ---------------------------------------------------------------------------
// Queue

/** Resolve the whole modal queue the way the store does (follow-ups jump to the front). */
function drain(ctx: Ctx, g: GameState, d: Driver): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    // The store finds popups by id and scripts are one-shot per id: two with one id is a lost popup.
    if (guard === 0 || g.queue.length > 1) {
      const qids = g.queue.map((m) => m.id)
      if (new Set(qids).size !== qids.length) ctx.fail('modal-dup-id', new Error(`two queued popups share an id: ${qids.filter((x, i) => qids.indexOf(x) !== i).join(',')}`), 'queue')
    }
    if (guard > 400) {
      ctx.fail('stuck-queue', new Error(`queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 200)}`), 'drain')
      g.queue = []
      return
    }
    const m = g.queue.shift()!
    const before = g.queue.length
    try {
      resolveModal(ctx, g, m, d)
    } catch (err) {
      // The store drops a popup whose handler throws (on its draft; here the state may be half
      // updated, so later failures in the same life can be follow-ons of this one).
      ctx.fail('modal-throw', err, `${m.kind} ${'scriptId' in m ? m.scriptId : m.kind === 'aiTask' ? m.task.type : ''} "${'title' in m ? m.title : ''}"`)
    }
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function resolveModal(ctx: Ctx, g: GameState, m: ModalItem, d: Driver): void {
  switch (m.kind) {
    case 'notice':
      checkText(ctx, m.title, `notice title`)
      checkText(ctx, m.text, `notice "${m.title}"`)
      return
    case 'choice': {
      checkText(ctx, m.text, `choice "${m.title}"`)
      if (!m.choices.length) {
        ctx.fail('modal-shape', new Error('choice with no options'), `choice "${m.title}"`)
        return
      }
      const cids = m.choices.map((c) => c.id)
      if (new Set(cids).size !== cids.length) ctx.fail('modal-shape', new Error(`duplicate choice ids ${cids.join(',')}`), `choice ${m.scriptId} "${m.title}"`)
      for (const c of m.choices) {
        checkText(ctx, c.label, `choice option ${m.scriptId}`)
        if (c.hint) checkText(ctx, c.hint, `choice hint ${m.scriptId}`)
      }
      const choice = d.pick(m.choices)
      ctx.trail.push(`choice ${m.scriptId ?? 'ai'} "${m.title}" -> ${choice.id}`)
      if (m.source === 'script') {
        if (!hasScript(m.scriptId!)) {
          ctx.fail('modal-shape', new Error(`missing script handler ${m.scriptId}`), `choice "${m.title}"`)
          return
        }
        runScript(g, m.scriptId!, choice.id, m.data, m)
      } else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
      return
    }
    case 'input': {
      checkText(ctx, m.text, `input "${m.title}"`)
      if (!hasScript(m.scriptId)) {
        ctx.fail('modal-shape', new Error(`missing script handler ${m.scriptId}`), `input "${m.title}"`)
        return
      }
      const v = modalInputValue(m, d)
      if (v === null) {
        ctx.fail('modal-stuck', new Error(`input can never be answered: min ${m.min} > max ${m.max}`), `input ${m.scriptId} "${m.title}"`)
        return
      }
      ctx.trail.push(`input ${m.scriptId} "${m.title}" = ${v.slice(0, 40)}`)
      runScript(g, m.scriptId, v, m.data, m)
      return
    }
    case 'minigame': {
      if (!hasScript(m.scriptId)) {
        ctx.fail('modal-shape', new Error(`missing script handler ${m.scriptId}`), `minigame ${m.game}`)
        return
      }
      if (m.game === 'annualReport') {
        const r = m.data as unknown as AnnualReportData
        for (const k of ['price', 'minPrice', 'maxPrice', 'suggestedPrice', 'production', 'maxProduction', 'expectedDemand', 'unitCost', 'inventory'] as const) {
          if (!Number.isFinite(r[k])) ctx.fail('invariant', new Error(`annual report ${k} = ${r[k]}`), `annualReport ${r.industryLabel}`)
        }
        if (r.minPrice > r.maxPrice) ctx.fail('invariant', new Error(`annual report minPrice ${r.minPrice} > maxPrice ${r.maxPrice}`), `annualReport ${r.industryLabel}`)
        for (const line of r.lines ?? []) checkText(ctx, `${line.label} ${line.value}`, `annualReport line ${r.industryLabel}`)
        checkText(ctx, r.marketNote, `annualReport note ${r.industryLabel}`)
      }
      const res = minigameResult(m, d)
      ctx.trail.push(`minigame ${m.game} -> ${res.slice(0, 60)}`)
      runScript(g, m.scriptId, res, m.data, m)
      return
    }
    case 'aiTask':
      ctx.trail.push(`task ${m.task.type}`)
      applyFallback(g, m.task)
      return
  }
}

// ---------------------------------------------------------------------------
// Storage shim (save.ts uses localStorage)

export function installStorageShim(): void {
  const G = globalThis as unknown as { localStorage?: Storage }
  if (G.localStorage) return
  const data = new Map<string, string>()
  G.localStorage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  } as Storage
}

function checkSaveLoad(ctx: Ctx, g: GameState): void {
  const size = jsonNodeCount(g)
  if (size.nodes > 400_000) ctx.fail('save-size', new Error(`state has ${size.nodes} JSON nodes (load limit 500,000)`), 'save')
  if (size.depth > 100) ctx.fail('save-size', new Error(`state nests ${size.depth} deep (load limit 128)`), 'save')
  try {
    if (!saveGame(g)) {
      ctx.fail('save', new Error('saveGame returned false'), 'save')
      return
    }
    const back = loadGame()
    if (!back) ctx.fail('save', new Error('a fresh save does not load (loadGame returned null)'), 'load')
    else {
      const a = JSON.stringify(g)
      const b = JSON.stringify(back)
      if (a !== b) ctx.fail('save-diff', new Error(`a reloaded save differs: ${diffSummary(a, b)}`), 'load')
    }
  } catch (err) {
    ctx.fail('save-throw', err, 'save/load')
  }
}

// ---------------------------------------------------------------------------
// One life

export interface FuzzOptions {
  /** Random actions per year (upper bound). */
  actionsPerYear: number
  /** Full menu walk every N years (1 = every year). */
  walkEvery: number
  maxDepth: number
  /** Stop a life (and its heirs) after this many simulated years. */
  maxYears: number
  /** Save/load check every N years. */
  saveEvery: number
  /** Continue as a child for up to this many generations. */
  heirs: number
  /** Time budget per seed in ms (0 = none). */
  budgetMs: number
  /**
   * Every N years (0 = never), try up to `sweepMax` of the enabled actions found by the full
   * walk, each on its own throwaway draft (drained and checked): broad coverage of run().
   */
  sweepEvery: number
  sweepMax: number
  /** Take Time Machine snapshots, reload them and sometimes travel back (save.ts memory backend). */
  timeMachine: boolean
}

export const DEFAULT_OPTIONS: FuzzOptions = { actionsPerYear: 6, walkEvery: 1, maxDepth: 6, maxYears: 160, saveEvery: 10, heirs: 1, budgetMs: 0, sweepEvery: 3, sweepMax: 150, timeMachine: true }

export const BIRTH_YEARS = [1900, 1925, 1950, 1975, 1990, 2010, 2026]

export interface LifeStats {
  seed: number
  years: number
  actions: number
  menuNodes: number
  swept: number
  businesses: number
  industries: string[]
  generations: number
  ms: number
  /** The books of a life, from fuzzLife (R2-L5). Absent when the life could not be created. */
  ledger?: LedgerStats
}

// ---------------------------------------------------------------------------
// The books of a life (R2-L5): what the conservation probe reads. The ledger's own invariants run in checkInvariants after every
// step; this part measures what the ledger cannot see by itself, a write to the player's cash that nothing booked.

export interface LedgerStats {
  /** The sum of every account at the end (it equals the cumulative mint less the cumulative burn). */
  sum: number
  /** Cumulative mint and burn by name at the end, every generation together. */
  mint: Record<string, number>
  burn: Record<string, number>
  accounts: number
  flowRows: number
  /** Bookings since the ledger began. */
  bookings: number
  /** The largest mint per name between two year ends: one year of play (the year change falls inside ageUp, so a window can reach a little into the next ledger year). */
  maxYearMint: Record<string, number>
  /** Every reason that had a flow row at some year end, sorted. */
  reasons: string[]
  /** Total unbooked change of the player's cash over all generations, absolute (0 when every write was booked). */
  drift: number
  /** The first year drift appeared, how a surviving raw writer is found. */
  firstDrift: { year: number; age: number; delta: number } | null
}

/** Where fuzzLife is when it looks at the books: a first look, a new player (an heir, a restored snapshot), or the end of a year. */
export type LedgerLook = 'start' | 'heir' | 'rebase' | 'year'

export interface LedgerWatch {
  /** The player's cash and account at the last look, or null before the first. */
  last: { cash: number; acct: number } | null
  /** Cumulative mint at the last year end. */
  mint: Record<string, number>
  maxYearMint: Record<string, number>
  reasons: Set<string>
  drift: number
  firstDrift: { year: number; age: number; delta: number } | null
}

export function newLedgerWatch(): LedgerWatch {
  return { last: null, mint: {}, maxYearMint: {}, reasons: new Set(), drift: 0, firstDrift: null }
}

/**
 * One look at the books. Drift is the change of the player's cash less the change of the player's account since the last look:
 * zero when every change was booked. A gap under a dollar is the rounding the wrappers close at their next call, so it is not
 * counted. An heir or a restored snapshot is another player (another account, another opening balance, which is not a flow), so
 * 'heir' and 'rebase' only move the baseline. A 'year' look also reads the mint since the last year end (one year of play, the
 * year ends being the ends of ageUp) and the reasons of the flow rows. It reads the game and never writes it.
 */
export function watchLedger(w: LedgerWatch, g: GameState, look: LedgerLook): void {
  const cash = g.character.money
  const acct = acctBalance(g, playerAcct(g))
  if (look === 'year' && w.last) {
    const delta = cash - w.last.cash - (acct - w.last.acct)
    if (Number.isFinite(delta) && Math.abs(delta) >= 1) {
      w.drift += Math.abs(delta)
      w.firstDrift ??= { year: g.year, age: g.character.age, delta: Math.round(delta) }
    }
  }
  w.last = { cash, acct }
  const L = peekLedger(g)
  if (look === 'year') {
    for (const [name, total] of Object.entries(L.m)) {
      const made = total - (w.mint[name] ?? 0)
      if (made > (w.maxYearMint[name] ?? 0)) w.maxYearMint[name] = made
      w.mint[name] = total
    }
    for (const row of flowsOf(g)) w.reasons.add(row.reason)
  } else if (look !== 'heir') w.mint = { ...L.m } // an heir carries on the same calendar year: its window stays open
}

/** The stats of a life from its watch and the books as they stand. */
export function ledgerStatsOf(w: LedgerWatch, g: GameState): LedgerStats {
  const L = peekLedger(g)
  let accounts = 0
  let total = 0
  for (const v of Object.values(L.a)) {
    accounts++
    total += v
  }
  return {
    sum: total,
    mint: { ...L.m },
    burn: { ...L.b },
    accounts,
    flowRows: Object.keys(L.f).length,
    bookings: L.k,
    maxYearMint: { ...w.maxYearMint },
    reasons: [...w.reasons].sort(),
    drift: Math.round(w.drift),
    firstDrift: w.firstDrift,
  }
}

function chooseAction(ctx: Ctx, g: GameState, d: Driver, walked: Found[] | null): Found | undefined {
  const opt: WalkOptions = { maxDepth: 6, full: false, maxNodes: 4000 }
  // Fresh list from the committed state, from one root the player would open.
  const biz = businessAssets(g)
  const roll = d.next()
  let pool: Found[] = []
  if (walked && d.chance(0.3)) pool = walked
  else if (biz.length && roll < 0.35) {
    const a = d.pick(biz)
    walkRoot(ctx, g, { name: `biz:${String(a.details.industry)}`, nodes: () => businessAssetView(g, a) }, opt, pool)
  } else if (roll < 0.55) {
    const living = g.people.filter((p) => p.alive)
    if (living.length) {
      const p = d.pick(living)
      walkRoot(ctx, g, { name: `person:${p.relation}`, nodes: () => personActions(g, p) }, opt, pool)
    }
  } else {
    const menu: MenuGroup = d.pick([activitiesMenu, activitiesMenu, occupationMenu, assetsMenu, assetsMenu])
    walkRoot(ctx, g, { name: menu.id, nodes: () => menu.children(g) }, opt, pool)
  }
  // A random player shouldn't simply give up: Surrender ends the life on the spot.
  pool = pool.filter((f) => f.action.id !== 'surrenderLife' && !/suicide/i.test(f.action.id))
  return pool.length ? d.pick(pool) : undefined
}

/** Run one menu action the way store.runMenuAction does (on a clone); returns the new state. */
function runAction(ctx: Ctx, g: GameState, f: Found, d: Driver): GameState {
  const a = f.action
  let input: string | undefined
  if (a.input) {
    const v = menuInputValue(g, a.input, d, ctx, f.path)
    if (v === null) return g
    input = v
  }
  ctx.trail.push(`action ${f.path}${input !== undefined ? ` = ${input.slice(0, 40)}` : ''}`)
  // store.runMenuAction: the menu was built from the committed (frozen) state; run() gets a
  // draft. A closure that writes to an object it captured from the committed state throws here.
  if (!Object.isFrozen(g)) deepFreeze(g)
  const draft = structuredClone(g)
  bindMoneyContext(draft)
  try {
    if (!draft.character.alive || draft.queue.length > 0) return g
    if (a.visible && !a.visible(draft)) return g
    if (a.disabledReason?.(draft)) return g
    a.run(draft, input)
  } catch (err) {
    ctx.fail(isFrozenWrite(err) ? 'action-stale-throw' : 'action-throw', err, `run ${f.path}`)
    bindMoneyContext(g)
    return g
  }
  return draft
}

/** Try many enabled actions, each on a throwaway draft of the committed state. */
function sweep(ctx: Ctx, g: GameState, found: Found[], d: Driver, max: number): number {
  const pool = found.filter((f) => f.action.id !== 'surrenderLife' && !/suicide/i.test(f.action.id))
  // A random sample, without repeats.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(d.next() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const mark = ctx.trail.length
  let n = 0
  for (const f of pool.slice(0, max)) {
    ctx.trail.length = mark
    ctx.trail.push('(sweep: each action on its own copy of this state)')
    const nw = netWorth(g)
    const draft = runAction(ctx, g, f, d)
    n++
    if (draft === g) continue
    ctx.g = draft
    drain(ctx, draft, d)
    checkInvariants(ctx, draft, `sweep ${f.path}`)
    noteWindfall(ctx, nw, draft, `sweep ${f.path}`)
    ctx.g = g
  }
  ctx.trail.length = mark
  bindMoneyContext(g)
  return n
}

/**
 * Probe a crafted state: run every enabled action of `roots` (all menus when omitted) on its
 * own throwaway draft of a frozen copy, drain and check each, and for `depth` 2 do the same again
 * from a sample of the resulting states (states two steps away). Failures go to `log`; returns
 * how many actions ran. For targeted, deterministic probes of rare states (a will feud, a board).
 */
export function probeActions(g0: GameState, log: FailureLog, seed = 1, opts: { depth?: number; max?: number; roots?: (g: GameState) => MenuNode[] } = {}): number {
  installStorageShim()
  const d = driver(seed)
  const g = structuredClone(g0)
  const ctx = makeCtx(seed, g.year - g.character.age, g, log)
  const collect = (s: GameState): Found[] => {
    const out: Found[] = []
    const list = opts.roots ? [{ name: 'probe', nodes: () => opts.roots!(s) }] : roots(s)
    for (const r of list) walkRoot(ctx, s, r, { maxDepth: 7, full: true, maxNodes: 20000 }, out)
    return out
  }
  deepFreeze(g)
  bindMoneyContext(g)
  let n = 0
  const level = (s: GameState, depth: number) => {
    const found = collect(s).filter((f) => f.action.id !== 'surrenderLife' && !/suicide/i.test(f.action.id))
    for (const f of found.slice(0, opts.max ?? 400)) {
      const mark = ctx.trail.length
      const draft = runAction(ctx, s, f, d)
      n++
      if (draft !== s) {
        ctx.g = draft
        drain(ctx, draft, d)
        checkInvariants(ctx, draft, `probe ${f.path}`)
        if (depth > 1 && d.chance(0.25)) {
          deepFreeze(draft)
          bindMoneyContext(draft)
          level(draft, depth - 1)
          bindMoneyContext(s)
        }
        ctx.g = s
      }
      ctx.trail.length = mark
    }
  }
  level(g, opts.depth ?? 1)
  bindMoneyContext(null)
  return n
}

const INDUSTRY_PREFIX = 'biz.start.'

/** Found a company through the real Start a Business rows (the founding popups follow). */
function maybeFound(ctx: Ctx, g: GameState, d: Driver): GameState {
  const pool: Found[] = []
  walkRoot(ctx, g, { name: 'found', nodes: () => [businessesStart(g), businessesBuy(g)].filter((x): x is MenuGroup => !!x) }, { maxDepth: 3, full: false, maxNodes: 400 }, pool)
  const rows = pool.filter((f) => f.action.id.startsWith(INDUSTRY_PREFIX) || f.action.id.startsWith('biz.buy.'))
  if (!rows.length) return g
  return runAction(ctx, g, d.pick(rows), d)
}

function businessesStart(g: GameState): MenuGroup | undefined {
  const m = assetsMenu.children(g).find((n): n is MenuGroup => n.type === 'menu' && n.id === 'businesses')
  return m?.children(g).find((n): n is MenuGroup => n.type === 'menu' && n.id === 'biz.start')
}
function businessesBuy(g: GameState): MenuGroup | undefined {
  const m = assetsMenu.children(g).find((n): n is MenuGroup => n.type === 'menu' && n.id === 'businesses')
  return m?.children(g).find((n): n is MenuGroup => n.type === 'menu' && n.id === 'biz.buy')
}

/** Time Machine: snapshots taken at the start of a year (popups done), keyed by age. */
interface Stops {
  lifeId: string
  taken: Map<number, string>
}

async function timeMachineStep(ctx: Ctx, g: GameState, d: Driver, stops: Stops): Promise<GameState> {
  if (stops.lifeId !== g.lifeId) {
    startTimeline(g.lifeId, null)
    stops.lifeId = g.lifeId
    stops.taken.clear()
  }
  if (!g.character.alive || g.queue.length) return g
  if (d.chance(0.2)) {
    const ok = await takeSnapshot(g)
    await snapshotWritesSettled()
    if (ok) {
      stops.taken.set(g.character.age, JSON.stringify(g))
      // The Time Machine keeps the newest few stops; so do we (bounded memory on long lives).
      while (stops.taken.size > 6) stops.taken.delete(stops.taken.keys().next().value!)
      ctx.trail.push(`snapshot at ${g.character.age}`)
    } else ctx.fail('snapshot', new Error('takeSnapshot returned false'), `snapshot at age ${g.character.age}`)
  }
  const older = [...stops.taken.keys()].filter((age) => age < g.character.age)
  if (!older.length || !d.chance(0.08) || jumpsUsed(g) >= TIME_MACHINE_JUMPS) return g
  const age = d.pick(older)
  let back: GameState | null = null
  try {
    back = await loadSnapshot(g.lifeId, age)
  } catch (err) {
    ctx.fail('snapshot-throw', err, `loadSnapshot ${age}`)
    return g
  }
  if (!back) {
    ctx.fail('snapshot', new Error(`the snapshot taken at age ${age} does not load`), `loadSnapshot ${age}`)
    return g
  }
  const was = stops.taken.get(age)!
  const now = JSON.stringify(back)
  if (now !== was) ctx.fail('snapshot-diff', new Error(`snapshot at age ${age} came back different: ${diffSummary(was, now)}`), `loadSnapshot ${age}`)
  if (!d.chance(0.6)) return g
  ctx.trail.push(`time machine: ${g.character.age} -> ${age}`)
  try {
    const arrived = arriveInPast(g, back)
    forgetFuture(g.lifeId, age)
    for (const k of [...stops.taken.keys()]) if (k > age) stops.taken.delete(k)
    return arrived
  } catch (err) {
    ctx.fail('timeMachine-throw', err, 'arriveInPast')
    return g
  }
}

export async function fuzzLife(seed: number, log: FailureLog, opts: FuzzOptions = DEFAULT_OPTIONS): Promise<LifeStats> {
  installStorageShim()
  if (opts.timeMachine) setSnapshotBackend(memorySnapshotBackend())
  const stops: Stops = { lifeId: '', taken: new Map() }
  const t0 = Date.now()
  const d = driver(seed)
  const birthYear = BIRTH_YEARS[seed % BIRTH_YEARS.length]
  let country = d.chance(0.25) ? 'us' : d.pick(COUNTRIES).id
  // Some lives are born royal (in a country that has a monarchy that year).
  const monarchies = Object.keys(ROYAL_RULES).filter((id) => royalRule(id, birthYear))
  const royal = monarchies.length > 0 && d.chance(0.1)
  if (royal) country = d.pick(monarchies)
  const talents = d.chance(0.6) ? Array.from(new Set([d.pick(ALL_TALENT_IDS), d.pick(ALL_TALENT_IDS), ...(d.chance(0.1) ? [MAIN_CHARACTER] : [])])).slice(0, 3) : []
  const rich = d.chance(0.6)
  const richAt = d.int(18, 30)
  const richAmount = d.pick([2e5, 2e6, 5e7, 1e9, 2e10])
  const bizMinded = rich || d.chance(0.3)

  let g: GameState
  const stats: LifeStats = { seed, years: 0, actions: 0, menuNodes: 0, swept: 0, businesses: 0, industries: [], generations: 1, ms: 0 }
  const industries = new Set<string>()
  try {
    g = createNewLife({ seed, year: birthYear, countryId: country, talents, ...(royal ? { royalty: 'royal' as const } : {}) })
  } catch (err) {
    const dummy = makeCtx(seed, birthYear, { character: { countryId: country, age: 0 }, year: birthYear } as unknown as GameState, log)
    dummy.fail('create-throw', err, `createNewLife ${country} ${birthYear}`)
    return stats
  }
  const ctx = makeCtx(seed, birthYear, g, log)
  ctx.trail.push(`new life seed ${seed} ${country} ${birthYear}${royal ? ' royal' : ''} talents ${talents.join(',')} rich ${rich ? `${richAmount}@${richAt}` : 'no'}`)
  bindMoneyContext(g)
  drain(ctx, g, d)
  checkInvariants(ctx, g, 'birth')
  const books = newLedgerWatch()
  watchLedger(books, g, 'start')
  deepFreeze(g)

  let gen = 0
  let madeRich = false
  for (let year = 0; year < opts.maxYears; year++) {
    if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) break
    ctx.g = g
    if (!g.character.alive) {
      // Continue as a child, like the death screen offers.
      if (gen >= opts.heirs) break
      let kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild'))
      if (!kids.length) {
        // Random play doesn't always leave a child: give this life one (a minor or a grown-up) so
        // the hand-over is still exercised, like test/simulate.test.ts does.
        g = structuredClone(g)
        createPerson(g, { relation: 'child', age: d.pick([4, 12, 17, 30, 55]), lastName: g.character.lastName, relationship: 70 })
        ctx.trail.push('(gave the late player a child to continue as)')
        kids = g.people.filter((p) => p.alive && p.relation === 'child')
      }
      const heir = d.pick(kids)
      ctx.trail.push(`continueAsChild ${heir.relation} age ${heir.age}`)
      try {
        const next = continueAsChild(g, heir.id)
        if (next === g || !next.character.alive) {
          ctx.fail('heir', new Error('continueAsChild did not hand over to a living heir'), 'continueAsChild')
          break
        }
        g = next
      } catch (err) {
        ctx.fail('heir-throw', err, 'continueAsChild')
        break
      }
      gen++
      stats.generations++
      madeRich = false
      ctx.g = g
      bindMoneyContext(g)
      drain(ctx, g, d)
      checkInvariants(ctx, g, 'heir')
      watchLedger(books, g, 'heir')
      deepFreeze(g)
    }
    if (g.character.age > 130) {
      ctx.fail('invariant', new Error('character never dies'), 'age')
      break
    }
    if (rich && !madeRich && g.character.age >= richAt && !g.character.prison) {
      g = structuredClone(g)
      addMoney(g, richAmount, 'prize')
      deepFreeze(g)
      madeRich = true
      ctx.trail.push(`+$${richAmount}`)
    }
    const c = g.character
    // The yearly render: every menu, with the purity check.
    let walked: Found[] | null = null
    if (year % opts.walkEvery === 0) {
      bindMoneyContext(g)
      walked = fullWalk(ctx, g, { maxDepth: opts.maxDepth, full: true, maxNodes: 20000 })
      stats.menuNodes += walked.length
      if (opts.sweepEvery && year % opts.sweepEvery === 0) stats.swept += sweep(ctx, g, walked, d, opts.sweepMax)
      // Now and then, render the same life with an extreme bank balance (deep debt, nothing, a
      // fortune): every row must still render without throwing or printing NaN/1e+21.
      if (d.chance(0.15)) {
        const odd = structuredClone(g)
        odd.character.money = d.pick([-25_000_000, -1, 0, 0.4, 3e12, 9e15])
        ctx.trail.push(`(render only: money set to ${odd.character.money})`)
        deepFreeze(odd)
        bindMoneyContext(odd)
        fullWalk(ctx, odd, { maxDepth: Math.min(4, opts.maxDepth), full: true, maxNodes: 8000 })
        ctx.trail.pop()
        bindMoneyContext(g)
      }
    }
    // Start companies.
    if (bizMinded && c.age >= 18 && !c.prison && businessAssets(g).length < 6 && d.chance(rich ? 0.45 : 0.15)) {
      const next = maybeFound(ctx, g, d)
      if (next !== g) {
        g = next
        ctx.g = g
        drain(ctx, g, d)
        checkInvariants(ctx, g, 'found')
        deepFreeze(g)
      }
    }
    const n = d.int(1, opts.actionsPerYear)
    for (let i = 0; i < n && g.character.alive; i++) {
      bindMoneyContext(g)
      const f = chooseAction(ctx, g, d, walked)
      walked = null
      if (!f) continue
      const nw = netWorth(g)
      const next = runAction(ctx, g, f, d)
      stats.actions++
      if (next === g) continue
      g = next
      ctx.g = g
      drain(ctx, g, d)
      checkInvariants(ctx, g, `after ${f.path}`)
      noteWindfall(ctx, nw, g, `after ${f.path}`)
      deepFreeze(g)
    }
    for (const a of businessAssets(g)) industries.add(String(a.details.industry))
    if (!g.character.alive) continue
    ctx.trail.push(`ageUp -> ${g.character.age + 1} (${g.year + 1})`)
    // store.ageUpAction: act(ageUp) on a draft.
    const draft = structuredClone(g)
    bindMoneyContext(draft)
    try {
      ageUp(draft)
    } catch (err) {
      ctx.fail(isFrozenWrite(err) ? 'ageUp-stale-throw' : 'ageUp-throw', err, 'ageUp')
      break
    }
    g = draft
    ctx.g = g
    stats.years++
    drain(ctx, g, d)
    checkInvariants(ctx, g, 'year end')
    watchLedger(books, g, 'year')
    if (g.character.alive && g.queue.length) ctx.fail('stuck-queue', new Error('queue left after drain'), 'year end')
    if (year % opts.saveEvery === 0 || !g.character.alive) checkSaveLoad(ctx, g)
    if (!g.character.alive && !g.obituary) ctx.fail('invariant', new Error('dead without an obituary'), 'death')
    if (opts.timeMachine) {
      const next = await timeMachineStep(ctx, g, d, stops)
      if (next !== g) {
        g = next
        ctx.g = g
        bindMoneyContext(g)
        drain(ctx, g, d)
        checkInvariants(ctx, g, 'time machine')
        watchLedger(books, g, 'rebase')
      }
    }
    deepFreeze(g)
  }
  stats.businesses = industries.size
  stats.industries = [...industries]
  stats.ledger = ledgerStatsOf(books, g)
  stats.ms = Date.now() - t0
  return stats
}

// ---------------------------------------------------------------------------
// Business mode: one industry, founded by a rich adult, run for many years

export const BUSINESS_YEARS = [1925, 1955, 1975, 1995, 2010, 2026, 2040]

/**
 * Found `industry` through the real Start a Business row (random funding/city/capital answers),
 * then run it for `years` years: every year render the company's screen (purity + text checks),
 * take several random actions on its screen and the Business menus, sweep a sample of its rows
 * on throwaway drafts, then age up. Founds again if the company is gone.
 */
export async function fuzzBusiness(industry: string, seed: number, log: FailureLog, years: number, budgetMs = 0): Promise<LifeStats> {
  installStorageShim()
  const t0 = Date.now()
  const d = driver(seed * 977 + industry.length)
  const country = d.chance(0.3) ? 'us' : d.pick(COUNTRIES).id
  const year = d.pick(BUSINESS_YEARS)
  const stats: LifeStats = { seed, years: 0, actions: 0, menuNodes: 0, swept: 0, businesses: 0, industries: [industry], generations: 1, ms: 0 }
  let g: GameState
  try {
    g = createNewLife({ seed, year, countryId: country, talents: d.chance(0.5) ? [d.pick(ALL_TALENT_IDS)] : [] })
  } catch (err) {
    makeCtx(seed, year, { character: { countryId: country, age: 0 }, year } as unknown as GameState, log).fail('create-throw', err, 'createNewLife')
    return stats
  }
  const ctx = makeCtx(seed, year, g, log)
  ctx.trail.push(`business mode: ${industry} in ${country}, ${year}`)
  // Grow up instantly (like the business tests do): an adult with money, smarts and a licence.
  g.queue = []
  g.character.age = 30
  g.log.push({ age: 30, year, entries: [] })
  g.character.money = d.pick([3e5, 5e6, 2e8, 1e10])
  g.character.stats.smarts = 75
  g.character.city = getCountry(country).cities[0]
  g.character.licenses = ['driver']
  g.character.residence = { status: 'renting', rent: 0 }
  bindMoneyContext(g)
  checkInvariants(ctx, g, 'setup')
  deepFreeze(g)
  const rowId = `${INDUSTRY_PREFIX}${industry}`
  for (let y = 0; y < years && g.character.alive; y++) {
    if (budgetMs && Date.now() - t0 > budgetMs) break
    ctx.g = g
    bindMoneyContext(g)
    if (!businessAssets(g).some((a) => a.details.industry === industry) && !g.character.prison) {
      const start = businessesStart(g)
      const row = start ? safe(ctx, 'start rows', () => start.children(g), [] as MenuNode[]).find((n): n is MenuAction => n.type === 'action' && n.id === rowId) : undefined
      if (row && !safe(ctx, `disabledReason ${rowId}`, () => row.disabledReason?.(g), null)) {
        const next = runAction(ctx, g, { action: row, path: `found/${rowId}` }, d)
        if (next !== g) {
          g = next
          ctx.g = g
          drain(ctx, g, d)
          checkInvariants(ctx, g, `found ${industry}`)
          deepFreeze(g)
        }
      }
    }
    // Render every company screen with the full checks; collect its rows.
    const found: Found[] = []
    for (const a of businessAssets(g)) walkRoot(ctx, g, { name: `biz:${String(a.details.industry)}`, nodes: () => businessAssetView(g, a) }, { maxDepth: 7, full: true, maxNodes: 20000 }, found)
    walkRoot(ctx, g, { name: 'occupation', nodes: () => occupationMenu.children(g) }, { maxDepth: 6, full: true, maxNodes: 20000 }, found)
    stats.menuNodes += found.length
    if (y % 3 === 0) stats.swept += sweep(ctx, g, found, d, 80)
    const n = d.int(2, 8)
    let pool = found.filter((f) => f.path.startsWith('biz:') || f.path.includes('/business/'))
    for (let i = 0; i < n && g.character.alive; i++) {
      bindMoneyContext(g)
      if (i > 0) {
        // The rows on screen now: built from the latest committed state, like the UI re-renders.
        pool = []
        for (const a of businessAssets(g)) walkRoot(ctx, g, { name: `biz:${String(a.details.industry)}`, nodes: () => businessAssetView(g, a) }, { maxDepth: 7, full: false, maxNodes: 20000 }, pool)
      }
      if (!pool.length) break
      const f = d.pick(pool)
      const nw = netWorth(g)
      const next = runAction(ctx, g, f, d)
      stats.actions++
      if (next === g) continue
      g = next
      ctx.g = g
      drain(ctx, g, d)
      checkInvariants(ctx, g, `after ${f.path}`)
      noteWindfall(ctx, nw, g, `after ${f.path}`)
      deepFreeze(g)
    }
    if (!g.character.alive) break
    ctx.trail.push(`ageUp -> ${g.character.age + 1} (${g.year + 1})`)
    const draft = structuredClone(g)
    bindMoneyContext(draft)
    try {
      ageUp(draft)
    } catch (err) {
      ctx.fail(isFrozenWrite(err) ? 'ageUp-stale-throw' : 'ageUp-throw', err, 'ageUp')
      break
    }
    g = draft
    ctx.g = g
    stats.years++
    drain(ctx, g, d)
    checkInvariants(ctx, g, 'year end')
    if (y % 10 === 0) checkSaveLoad(ctx, g)
    deepFreeze(g)
  }
  stats.businesses = businessAssets(g).length
  stats.ms = Date.now() - t0
  return stats
}

/** Politics mode: countries, years and offices for seeded politicians. */
export const POLITICS_PLACES: [string, number][] = [['us', 1995], ['gb', 1975], ['br', 1990], ['ng', 2005], ['ru', 2000], ['se', 2010], ['in', 1985], ['jp', 1960], ['ve', 2020], ['de', 2030], ['fr', 1950], ['mx', 2015]]

/**
 * A seeded politician (mayor, governor or legislator, head of government) driven by random menu
 * actions: every year render the Occupation menu with the full checks (purity, text, money), take
 * several random actions among the politics rows (Govern, Abuse of Power, the dashboard, the
 * career's own rows), sweep a sample on throwaway drafts, answer popups at random, age up.
 */
export async function fuzzPolitics(seed: number, log: FailureLog, years: number, budgetMs = 0): Promise<LifeStats> {
  installStorageShim()
  const t0 = Date.now()
  const d = driver(seed * 7919 + 13)
  const [country, year] = POLITICS_PLACES[seed % POLITICS_PLACES.length]
  const office = d.pick(['mayor', 'governor', 'leader', 'leader'] as const)
  const stats: LifeStats = { seed, years: 0, actions: 0, menuNodes: 0, swept: 0, businesses: 0, industries: [`politics:${office}`], generations: 1, ms: 0 }
  let g: GameState
  try {
    g = createNewLife({ seed, year: year - 45, countryId: country })
  } catch (err) {
    makeCtx(seed, year, { character: { countryId: country, age: 0 }, year } as unknown as GameState, log).fail('create-throw', err, 'createNewLife')
    return stats
  }
  const ctx = makeCtx(seed, year - 45, g, log)
  ctx.trail.push(`politics mode: ${office} in ${country}, ${year}`)
  g.queue = []
  g.character.age = 45
  g.year = year
  g.log.push({ age: 45, year, entries: [] })
  g.character.money = d.pick([2e5, 3e6, 5e7])
  g.character.stats.smarts = 70
  g.character.residence = { status: 'renting', rent: 0 }
  g.character.job = { defId: 'politician', title: office === 'leader' ? 'President' : office === 'governor' ? 'Governor' : 'Mayor', company: getCountry(country).name, category: 'special', salary: 150_000, level: { mayor: 1, governor: 2, leader: 3 }[office], performance: 55, yearsInRole: 0, yearsAtCompany: 0,
    data: { office, party: d.pick(['progressive', 'conservative', 'centrist', 'green', 'libertarian']), approval: 55, termLeft: 4, terms: 1, hot: [], newsAge: -1, bills: [], warChest: 0, favors: 0, scandals: 0, termOver: false, startAge: 45, roleStartAge: 45 } }
  bindMoneyContext(g)
  checkInvariants(ctx, g, 'setup')
  deepFreeze(g)
  const political = (f: Found) => /nation\.|pol\.|special\.politics/.test(f.action.id) || /Govern|Abuse|Dashboard|Pockets|Keep Power|Dirty/.test(f.path)
  // Resigning ends the run's point, so it is a rare pick (it is still swept on drafts).
  const pickable = (f: Found) => political(f) && (!/resign/.test(f.action.id) || d.chance(.03))
  for (let y = 0; y < years && g.character.alive; y++) {
    if (budgetMs && Date.now() - t0 > budgetMs) break
    ctx.g = g
    bindMoneyContext(g)
    const found: Found[] = []
    walkRoot(ctx, g, { name: 'occupation', nodes: () => occupationMenu.children(g) }, { maxDepth: 7, full: true, maxNodes: 20000 }, found)
    stats.menuNodes += found.length
    if (y % 3 === 0) stats.swept += sweep(ctx, g, found.filter(political), d, 80)
    const n = d.int(2, 7)
    let pool = found.filter(pickable)
    for (let i = 0; i < n && g.character.alive; i++) {
      bindMoneyContext(g)
      if (i > 0) {
        pool = []
        walkRoot(ctx, g, { name: 'occupation', nodes: () => occupationMenu.children(g) }, { maxDepth: 7, full: false, maxNodes: 20000 }, pool)
        pool = pool.filter(pickable)
      }
      if (!pool.length) break
      const f = d.pick(pool)
      const nw = netWorth(g)
      const next = runAction(ctx, g, f, d)
      stats.actions++
      if (next === g) continue
      g = next
      ctx.g = g
      drain(ctx, g, d)
      checkInvariants(ctx, g, `after ${f.path}`)
      noteWindfall(ctx, nw, g, `after ${f.path}`)
      deepFreeze(g)
    }
    if (!g.character.alive) break
    ctx.trail.push(`ageUp -> ${g.character.age + 1} (${g.year + 1})`)
    const draft = structuredClone(g)
    bindMoneyContext(draft)
    try {
      ageUp(draft)
    } catch (err) {
      ctx.fail(isFrozenWrite(err) ? 'ageUp-stale-throw' : 'ageUp-throw', err, 'ageUp')
      break
    }
    g = draft
    ctx.g = g
    stats.years++
    drain(ctx, g, d)
    checkInvariants(ctx, g, 'year end')
    if (y % 5 === 0) checkSaveLoad(ctx, g)
    deepFreeze(g)
  }
  stats.ms = Date.now() - t0
  return stats
}

/** Every industry id, for business mode. */
export const ALL_INDUSTRIES: readonly string[] = INDUSTRY_IDS

export function formatFailures(log: FailureLog): string {
  const out: string[] = []
  for (const { first: f, count } of log.list().sort((a, b) => a.first.kind.localeCompare(b.first.kind))) {
    out.push(
      `=== [${f.kind}] x${count} seed ${f.seed} (${f.countryId}, born ${f.birthYear}, age ${f.age}, ${f.year})\n${f.message}\n${f.stack
        .split('\n')
        .slice(0, 6)
        .join('\n')}\n  trail:\n    ${f.trail.slice(-14).join('\n    ')}`,
    )
  }
  return out.join('\n\n')
}
