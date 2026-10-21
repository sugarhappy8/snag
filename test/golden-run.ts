// R2-P2 (K.7b b): the golden runner. A plan is a list of seeded lives and the years at which to take a digest; playGolden plays
// one life through the real yearly loop (test/play-kit.ts for a birth life, test/probe-life.ts for a founder) and digests it
// with sliceDigests (test/golden-kit.ts) at each checkpoint and at the end. test/fixtures/golden-digests.json holds the recorded
// digests of every plan; test/golden-digest.test.ts compares a played plan with it, and scripts/golden.mjs (test/golden-cli.ts)
// is the one way to change it, with a written reason.
//
// Two plans. 'pr' is small enough for the fast tier (3 lives, 20 to 32 years). 'deep' is the nightly one: eight birth lives to
// age 90 and four founders for 60 years, with 12, 6, 3 and 1 companies.
//
// Seeds are given to `life(...)` as an argument, never as an object member with a number after the key, so the seed-pin
// ratchet (test/seed-pins.test.ts) has nothing to count. A plan plays fixed specs; it never looks for a life with a property.
//
// No vitest imports here: the same module runs under vitest and inside the bundle scripts/golden.mjs makes. Under vitest the
// repo root is the parent of this folder; the bundle has no such folder, so the launcher passes GOLDEN_ROOT.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GameState } from '../src/game/types'
import { SLICES, sliceDigests, type SliceDigests, type SliceName } from './golden-kit'
import { playLife } from './play-kit'
import { probeLife } from './probe-life'

export type PlanName = 'pr' | 'deep'
export const PLAN_NAMES: readonly PlanName[] = ['pr', 'deep']

export interface GoldenLife {
  id: string
  kind: 'birth' | 'founder'
  seed: number
  birthYear: number
  /** A birth life: play until the character is this old (playLife's untilAge). A founder: years lived from 30 on. */
  years: number
  /** A birth life: money set to 60,000,000 at 25 (playLife's `rich`). */
  rich?: boolean
  /** A founder: companies owned at 30. */
  businesses?: number
  /** A founder: probeLife's keepAlive (health put back to 100 every year), so a long business life is not cut short by a death. */
  keepAlive?: boolean
}

export interface GoldenPlan {
  checkpoints: readonly number[]
  lives: readonly GoldenLife[]
}

/** The digests of one life: String(years played) for each checkpoint it reached, and 'end' (death or the last year). */
export type LifeDigests = Record<string, SliceDigests>

export interface GoldenHistory {
  /** Where it was recorded: a short hash, or --at's label, or 'working tree'. */
  at: string
  plan: PlanName | 'all'
  reason: string
  /** The slices that changed in any life or checkpoint, in SLICES order. */
  moved: SliceName[]
}

export interface GoldenFile {
  v: 1
  /** The Node major the digests were recorded under. */
  node: number
  hash: string
  plans: Record<PlanName, { checkpoints: number[]; lives: GoldenLife[] }>
  /** plan -> life id -> digests */
  digests: Record<PlanName, Record<string, LifeDigests>>
  /** At most 40 entries, newest last. */
  history: GoldenHistory[]
}

/** What the digests are made of; recorded in the file so a change of kit is visible there. */
export const GOLDEN_HASH = 'canonical-json,fnv1a-32x2'
export const HISTORY_LIMIT = 40

// ---------------------------------------------------------------------------------------------- the plans

/** One life of a plan. The seed is an argument, so no `seed: <digits>` literal is written (the pin ratchet counts those). */
export function life(
  id: string,
  kind: GoldenLife['kind'],
  seed: number,
  birthYear: number,
  years: number,
  extra: { rich?: boolean; businesses?: number; keepAlive?: boolean } = {},
): GoldenLife {
  return { id, kind, seed, birthYear, years, ...extra }
}

// A founder that probeLife cannot build (fewer industries open than asked) gets fewer companies, never fewer years. The deep
// founders keep alive: without it seeds 31 to 34 die at 73, 74, 52 and 37, and the 1990 founder gives 7 years of business, not 60.
export const GOLDEN_PLANS: Readonly<Record<PlanName, GoldenPlan>> = {
  pr: {
    checkpoints: [5, 10, 20],
    lives: [life('birth-1950', 'birth', 1, 1950, 20), life('rich-1990', 'birth', 2, 1990, 32, { rich: true }), life('founder-1975', 'founder', 3, 1975, 20, { businesses: 2 })],
  },
  deep: {
    checkpoints: [10, 20, 40, 60, 90],
    lives: [
      // Seeds 1 to 4 are the four lives of test/text-kit.test.ts, 21 to 24 four more.
      life('birth-1950', 'birth', 1, 1950, 90),
      life('birth-1990', 'birth', 2, 1990, 90),
      life('birth-2005', 'birth', 3, 2005, 90),
      life('rich-1975', 'birth', 4, 1975, 90, { rich: true }),
      life('birth-1925', 'birth', 21, 1925, 90),
      life('rich-1935', 'birth', 22, 1935, 90, { rich: true }),
      life('birth-1962', 'birth', 23, 1962, 90),
      life('rich-2026', 'birth', 24, 2026, 90, { rich: true }),
      life('founder-1926-x12', 'founder', 31, 1926, 60, { businesses: 12, keepAlive: true }),
      life('founder-1950-x6', 'founder', 32, 1950, 60, { businesses: 6, keepAlive: true }),
      life('founder-1975-x3', 'founder', 33, 1975, 60, { businesses: 3, keepAlive: true }),
      life('founder-1990-x1', 'founder', 34, 1990, 60, { businesses: 1, keepAlive: true }),
    ],
  },
}

/** True when two plans have the same checkpoints and the same lives (key order and an absent flag against false do not matter). */
export function samePlan(a: { checkpoints: readonly number[]; lives: readonly GoldenLife[] }, b: { checkpoints: readonly number[]; lives: readonly GoldenLife[] }): boolean {
  const key = (l: GoldenLife): string => [l.id, l.kind, l.seed, l.birthYear, l.years, l.rich === true, l.businesses ?? 0, l.keepAlive === true].join('|')
  return a.checkpoints.join(',') === b.checkpoints.join(',') && a.lives.map(key).join(';') === b.lives.map(key).join(';')
}

// ---------------------------------------------------------------------------------------------- playing

/**
 * Plays one life and digests it after each checkpoint (years played) it reaches, and at the end. A birth life that dies before a
 * checkpoint has no key for it. `onYear` is the lives' own hook (0 before the first year, then 1, 2, ...); it runs after the
 * digests of that year were taken, so a test can perturb the life and see the next checkpoint move. The end digest is taken from
 * the state the play returns, so a perturbation in the last year shows in it.
 */
export function playGolden(l: GoldenLife, checkpoints: readonly number[], onYear?: (g: GameState, yearsPlayed: number) => void): LifeDigests {
  const want = new Set(checkpoints)
  const out: LifeDigests = {}
  const hook = (g: GameState, yearsPlayed: number): void => {
    if (want.has(yearsPlayed)) out[String(yearsPlayed)] = sliceDigests(g)
    onYear?.(g, yearsPlayed)
  }
  const g =
    l.kind === 'birth'
      ? playLife({ seed: l.seed, birthYear: l.birthYear, untilAge: l.years, rich: l.rich ?? false, onYear: hook }).g
      : probeLife({ seed: l.seed, birthYear: l.birthYear, businesses: l.businesses ?? 1, years: l.years, keepAlive: l.keepAlive ?? false, onYear: hook })
  out.end = sliceDigests(g)
  return out
}

/** Plays a plan (or only the lives whose ids are in `only`): life id -> digests, in plan order. */
export function runPlan(name: PlanName, only?: readonly string[]): Record<string, LifeDigests> {
  const plan = GOLDEN_PLANS[name]
  if (only) for (const id of only) if (!plan.lives.some((l) => l.id === id)) throw new Error(`runPlan: the ${name} plan has no life "${id}"`)
  const out: Record<string, LifeDigests> = {}
  for (const l of plan.lives) {
    if (only && !only.includes(l.id)) continue
    out[l.id] = playGolden(l, plan.checkpoints)
  }
  return out
}

// ---------------------------------------------------------------------------------------------- comparing

const NONE = '(none)'

/** One digest that differs: which slice, in which life, at which checkpoint ('end' or the year), and both digests. */
export interface Moved {
  slice: SliceName
  life: string
  at: string
  golden: string
  now: string
}

/** Checkpoint keys in reading order: the years ascending, then 'end' (and anything else) after. */
export function orderCheckpoints(keys: Iterable<string>): string[] {
  const num = (k: string): number => (/^\d+$/.test(k) ? Number(k) : Infinity)
  return [...new Set(keys)].sort((a, b) => num(a) - num(b) || (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Every (life, checkpoint, slice) whose digest differs, in life, checkpoint and SLICES order (the lives of `now` first). A life or
 * checkpoint only one side has counts as a move of every slice, with '(none)' on the side that lacks it.
 */
export function compareGolden(golden: Record<string, LifeDigests>, now: Record<string, LifeDigests>): Moved[] {
  const out: Moved[] = []
  for (const id of new Set([...Object.keys(now), ...Object.keys(golden)])) {
    const was = golden[id] ?? {}
    const is = now[id] ?? {}
    for (const at of orderCheckpoints([...Object.keys(is), ...Object.keys(was)])) {
      for (const slice of SLICES) {
        const a = was[at]?.[slice] ?? NONE
        const b = is[at]?.[slice] ?? NONE
        if (a !== b) out.push({ slice, life: id, at, golden: a, now: b })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------- the file

function repoRoot(): string {
  if (process.env.GOLDEN_ROOT) return process.env.GOLDEN_ROOT
  return typeof __dirname === 'string' ? join(__dirname, '..') : process.cwd()
}

/** The absolute path of test/fixtures/golden-digests.json. */
export const GOLDEN_FILE: string = join(repoRoot(), 'test', 'fixtures', 'golden-digests.json')

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

function fail(file: string, what: string): never {
  throw new Error(`${file}: ${what} (regenerate it under Node 22: node scripts/golden.mjs update --plan all --reason "<why>")`)
}

function readLife(file: string, v: unknown, where: string): GoldenLife {
  if (!isObj(v)) return fail(file, `${where} is not an object`)
  const { id, kind, seed, birthYear, years, rich, businesses, keepAlive } = v
  if (typeof id !== 'string' || id === '') return fail(file, `${where} has no id`)
  if (kind !== 'birth' && kind !== 'founder') return fail(file, `${where} has kind ${String(kind)}`)
  if (!isInt(seed) || !isInt(birthYear) || !isInt(years) || years < 1) return fail(file, `${where} has a bad seed, birthYear or years`)
  if (rich !== undefined && typeof rich !== 'boolean') return fail(file, `${where} has a bad rich`)
  if (businesses !== undefined && !isInt(businesses)) return fail(file, `${where} has bad businesses`)
  if (keepAlive !== undefined && typeof keepAlive !== 'boolean') return fail(file, `${where} has a bad keepAlive`)
  return { id, kind, seed, birthYear, years, ...(rich === undefined ? {} : { rich }), ...(businesses === undefined ? {} : { businesses }), ...(keepAlive === undefined ? {} : { keepAlive }) }
}

/** Parses the text of a golden file, or throws a message that names the problem. */
export function parseGolden(text: string, file = 'golden file'): GoldenFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return fail(file, `is not JSON (${(err as Error).message})`)
  }
  if (!isObj(raw) || raw.v !== 1) return fail(file, 'is not a version 1 golden file')
  if (!isInt(raw.node) || typeof raw.hash !== 'string') return fail(file, 'has no node or hash')
  const plans = {} as GoldenFile['plans']
  const digests = {} as GoldenFile['digests']
  if (!isObj(raw.plans) || !isObj(raw.digests)) return fail(file, 'has no plans or digests')
  for (const name of PLAN_NAMES) {
    const p = raw.plans[name]
    if (!isObj(p) || !Array.isArray(p.checkpoints) || !p.checkpoints.every(isInt) || !Array.isArray(p.lives)) return fail(file, `plan ${name} is malformed`)
    plans[name] = { checkpoints: [...(p.checkpoints as number[])], lives: p.lives.map((l, i) => readLife(file, l, `plan ${name} life ${i}`)) }
    const d = raw.digests[name]
    if (!isObj(d)) return fail(file, `digests of plan ${name} are missing`)
    digests[name] = {}
    for (const [id, rows] of Object.entries(d)) {
      if (!isObj(rows)) return fail(file, `${name}/${id} is not an object`)
      const life: LifeDigests = {}
      for (const [at, one] of Object.entries(rows)) {
        if (!isObj(one) || !Object.values(one).every((x) => typeof x === 'string')) return fail(file, `${name}/${id} at ${at} is not a set of digests`)
        life[at] = one as unknown as SliceDigests
      }
      digests[name][id] = life
    }
  }
  if (!Array.isArray(raw.history)) return fail(file, 'has no history')
  const history = raw.history.map((h, i): GoldenHistory => {
    if (!isObj(h) || typeof h.at !== 'string' || typeof h.reason !== 'string' || !Array.isArray(h.moved) || !h.moved.every((s) => typeof s === 'string')) return fail(file, `history entry ${i} is malformed`)
    if (h.plan !== 'pr' && h.plan !== 'deep' && h.plan !== 'all') return fail(file, `history entry ${i} has plan ${String(h.plan)}`)
    return { at: h.at, plan: h.plan, reason: h.reason, moved: h.moved as SliceName[] }
  })
  return { v: 1, node: raw.node, hash: raw.hash, plans, digests, history }
}

/** The committed file, or null when there is none. A file that is there but malformed throws. */
export function readGolden(file: string = GOLDEN_FILE): GoldenFile | null {
  if (!existsSync(file)) return null
  return parseGolden(readFileSync(file, 'utf8'), file)
}

const q = (v: unknown): string => JSON.stringify(v)
const pad = (depth: number): string => ' '.repeat(depth)

/** A JSON object whose members (each already written, possibly over several lines) start one level in. */
function objectOf(members: readonly [key: string, value: string][], depth: number): string {
  if (members.length === 0) return '{}'
  return `{\n${members.map(([k, v]) => `${pad(depth + 1)}${q(k)}: ${v}`).join(',\n')}\n${pad(depth)}}`
}

function arrayOf(rows: readonly string[], depth: number): string {
  if (rows.length === 0) return '[]'
  return `[\n${rows.map((r) => pad(depth + 1) + r).join(',\n')}\n${pad(depth)}]`
}

const oneLine = (d: SliceDigests): string => `{${SLICES.filter((s) => typeof d[s] === 'string').map((s) => `${q(s)}:${q(d[s])}`).join(',')}}`

function lifeLine(l: GoldenLife): string {
  const parts = [`"id":${q(l.id)}`, `"kind":${q(l.kind)}`, `"seed":${l.seed}`, `"birthYear":${l.birthYear}`, `"years":${l.years}`]
  if (l.rich !== undefined) parts.push(`"rich":${l.rich}`)
  if (l.businesses !== undefined) parts.push(`"businesses":${l.businesses}`)
  if (l.keepAlive !== undefined) parts.push(`"keepAlive":${l.keepAlive}`)
  return `{${parts.join(',')}}`
}

/**
 * The file's text. Each (life, checkpoint) digest set is one line, the keys are in a fixed order (checkpoints by year, then end)
 * and there is a final newline, so two branches that move different lives change different lines. Nobody merges this file by
 * hand: rebase, then regenerate (docs/CI.md).
 */
export function serializeGolden(f: GoldenFile): string {
  const plans = PLAN_NAMES.map((name): [string, string] => {
    const p = f.plans[name]
    return [name, objectOf([['checkpoints', `[${p.checkpoints.join(',')}]`], ['lives', arrayOf(p.lives.map(lifeLine), 3)]], 2)]
  })
  const digests = PLAN_NAMES.map((name): [string, string] => [
    name,
    objectOf(
      Object.entries(f.digests[name]).map(([id, rows]): [string, string] => [
        id,
        objectOf(orderCheckpoints(Object.keys(rows)).map((at): [string, string] => [at, oneLine(rows[at])]), 3),
      ]),
      2,
    ),
  ])
  const history = f.history.map((h) => `{"at":${q(h.at)},"plan":${q(h.plan)},"reason":${q(h.reason)},"moved":${q(h.moved)}}`)
  const text = objectOf(
    [
      ['v', '1'],
      ['node', String(f.node)],
      ['hash', q(f.hash)],
      ['plans', objectOf(plans, 1)],
      ['digests', objectOf(digests, 1)],
      ['history', arrayOf(history, 1)],
    ],
    0,
  )
  return `${text}\n`
}
