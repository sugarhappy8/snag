// R4-E1 (D.3, D.12; X2, X4, X30): the social parity kit. R4 puts every change to Person.relationship behind one door
// (addRelationship in core.ts, R4-E5), mirrors it into the Edge (R4-E7) and adds the social acts. Its first promise is that the
// numbers a v5.2.0 life gets do not move: R4-E2 to R4-E4 and R4-L1 record those numbers on the unmodified engine with this kit, and
// R4-E5 onwards compares against them. The recording holds no text, so a rewritten line does not move it, and no float beyond
// nine significant digits, so Mac and Linux agree.
//
//   scene(tuple, spec)        a test game (makeTestGame) with a cast made by createPerson, every field given, so building it
//                             draws nothing: g.rng is still the seed and g.nextId counts the cast. `tuple` is [seed, year]
//                             (X30: a constant tuple, never `seed: <digits>`; the year is g.year, which moves tiers and eras)
//   scene.step(label, fn)     runs fn(g), then records one row: { label, rel[] (every person's relationship, in g.people order),
//   step(label, fn)           rng, nextId, queue (kind or kind:scriptId, no text), money (the player's cash), x (what an area
//                             also pins, from the third argument) }. `step` is the same call on the scene made last
//   runAction(g, p, id)       runs a person's menu action by id, the way the Relationships screen would; throws when the action
//                             is missing or disabled, so a path a change closes fails loudly (a proposal at 67 was refused once)
//   applyDelta(g, p, d, kind?) the ONE place an oracle file calls addRelationship (the ratchet, test/relationship-ratchet.test.ts,
//                             counts every other). It was written against the two-argument addRelationship(p, delta) of v5.2.0;
//                             R4-E5 changed the one call in its body and no oracle file
//   compareRows(old, new)     the rows that moved, the first one named; expectRows(oracle, rows) throws that report
//   oracle(area, file?)       where an area is recorded: test/fixtures/social-parity-<area>.json unless a file is given
//   isRecording / recordRows  the recorder (below); readRows reads a recording and refuses one edited by hand
//   frozenGame, trapRng       the purity tools of test/effort-kit.ts, so a menu or a view is read under deepFreeze with a trapped
//                             g.rng and the kit's rows prove it drew nothing
//   referenceRows()           the kit's own small scene: a table of deltas at the bounds and non-finite values, and four real
//                             actions of relationships.ts. The kit self-test and the mutation test (test/social-mutation.test.ts)
//                             use it, so both see an engine change the way an oracle file would
//   withStamped(fn)           (R4-E7) runs fn with every scene stamped (stampSocial, the mark X6 puts on a new life) and with the
//                             Edge mirror checked at every change: after each call that moves a number, the edge person > player
//                             holds that number (cut to 0..100) or is not there (a map full of bound edges). The same oracle rows
//                             are expected: the mirror follows the numbers and never moves one, never draws, never makes an id.
//                             `SceneSpec.stamped` stamps one scene by itself; stampLife(g) stamps a game that a life made (the
//                             lives and the nepo worlds) when the mode is on; stampStats() says how many games were stamped and how
//                             many changes were checked, so a replay that stamped nothing cannot pass for one
//
// An area's test plays its scenes, then either records or compares:
//
//   const ORACLE = oracle('relationships')
//   it('the rows are the recorded ones', () => {
//     const rows = playAll()
//     if (isRecording(ORACLE.area)) recordRows(ORACLE, rows)
//     else expectRows(ORACLE, rows)
//   })
//
// The recorder writes only when asked: RECORD_SOCIAL_PARITY=<area[,area...]|all> and a RECORD_REASON that checkReason
// (test/golden-cli.ts) accepts, under the Node major CI uses (22; wt/bin/vt22), on a tree whose src/ equals HEAD. The file's header
// names the node, the commit (head), the tree of src/ at that commit (src), the reason and a hash of the step labels (gridHash), so
// an oracle can be traced to the engine that made it and a re-ordered or renamed step reads as "not the recorded one". Record
// twice and diff: the files are byte-identical. Nobody merges a recording by hand (X2): the integrator re-records.
//
// The kit draws no random number of its own and books no dollar.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { addRelationship } from '../src/game/core'
import { personEntity } from '../src/game/kernel/person-ref'
import { bindMirror, type MirrorHook, type RelKind } from '../src/game/kernel/relations'
import { createPerson } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import { fnv1a } from '../src/game/text/hash'
import type { Character, GameState, Gender, Json, MenuAction, ModalItem, Person, RelationKind, StatKey } from '../src/game/types'
import { mirrorChange } from '../src/game/world/edge-mirror'
import { readEdge } from '../src/game/world/edges'
import { playerRef } from '../src/game/world/people'
import { socialOn, stampSocial } from '../src/game/world/social'
import { frozenGame, roundSig, trapRng } from './effort-kit'
import { checkReason } from './golden-cli'
import { makeTestGame } from './helpers'
import { ROOT } from './scan-kit'

export { frozenGame, roundSig, trapRng }

// ---------------------------------------------------------------------------------------------------------------------
// Cells and rows

/** What a recording holds: JSON, with a non-finite number written as the text 'NaN', 'Infinity' or '-Infinity'. */
export type Cell = number | string | boolean | null | Cell[] | { [key: string]: Cell }

/**
 * A value as the recording keeps it: a float cut to nine significant digits, -0 written 0, a non-finite number written as text
 * (JSON has none), undefined as null, object keys sorted. A step and the file go through the same cut, so they compare equal.
 */
export function cut(v: unknown): Cell {
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : roundSig(v)
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.map(cut)
  if (typeof v === 'object') {
    const out: { [key: string]: Cell } = {}
    for (const k of Object.keys(v).sort()) {
      const c = (v as Record<string, unknown>)[k]
      if (c !== undefined) out[k] = cut(c)
    }
    return out
  }
  return String(v)
}

/** One step of a scene, as recorded. No text: a notice, a log line or a name never appears. */
export interface ParityRow {
  label: string
  /** Every person's relationship in g.people order. */
  rel: Cell[]
  rng: Cell
  nextId: Cell
  /** The queue in order: the modal's kind, or kind:scriptId when it has one. */
  queue: string[]
  /** The player's cash. */
  money: Cell
  /** What the area also pins (a purse, a record's field), under names it chooses. */
  x?: { [key: string]: Cell }
}

export type Extra = (g: GameState) => Record<string, unknown>

/** The queue as the rows keep it. */
export function queueKinds(g: GameState): string[] {
  return g.queue.map((m: ModalItem) => {
    const id = (m as { scriptId?: unknown }).scriptId
    return typeof id === 'string' && id !== '' ? `${m.kind}:${id}` : m.kind
  })
}

/** The row for the state as it stands. */
export function snapshot(label: string, g: GameState, extra?: Extra): ParityRow {
  const row: ParityRow = { label, rel: g.people.map((p) => cut(p.relationship)), rng: cut(g.rng), nextId: cut(g.nextId), queue: queueKinds(g), money: cut(g.character.money) }
  const x = extra?.(g)
  if (x !== undefined) row.x = cut(x) as { [key: string]: Cell }
  return row
}

// ---------------------------------------------------------------------------------------------------------------------
// Stamped replays (R4-E7)

/** What a stamped replay did: the games it stamped and the changes of a number whose edge it checked. */
export interface StampStats {
  stamped: number
  checked: number
}

let stampedMode = false
const stats: StampStats = { stamped: 0, checked: 0 }

/** The numbers of the replay in progress or of the last one. */
export function stampStats(): Readonly<StampStats> {
  return { ...stats }
}

/** True inside withStamped. */
export function isStampedMode(): boolean {
  return stampedMode
}

/**
 * Stamps a game when the mode is on (or `force` says so) and returns it. A scene does this for its own game; a life that createNewLife
 * or a builder made is passed through here by the test that plays it. Idempotent.
 */
export function stampLife<T extends GameState>(g: T, force?: boolean): T {
  if (force ?? stampedMode) {
    stampSocial(g)
    stats.stamped++
  }
  return g
}

const clampRel = (n: number): number => Math.max(0, Math.min(100, n))

/** The mirror, then a check of what it wrote: the edge person > player holds the new number, cut to 0..100, or there is no edge. */
const checkedMirror: MirrorHook = (g, p, change) => {
  mirrorChange(g, p, change)
  if (!socialOn(g) || p.relation === 'pet' || !Number.isFinite(change.after) || change.after === change.before) return
  stats.checked++
  const e = readEdge(g, personEntity(p), playerRef(g))
  if (e !== null && e.f !== clampRel(change.after)) {
    throw new Error(`the mirror: ${p.relation} ${p.firstName} is now at ${String(change.after)} (${change.kind}) but the edge holds f ${e.f}`)
  }
}

/**
 * Runs fn with every scene (and every life passed through stampLife) stamped and the Edge mirror checked at every change. The oracle
 * rows are the ones of the unstamped recording: a stamped life must play the same numbers, draws, ids and popups. Resets the counts.
 */
export function withStamped<T>(fn: () => T): T {
  if (stampedMode) throw new Error('withStamped: already inside a stamped replay')
  stampedMode = true
  stats.stamped = 0
  stats.checked = 0
  bindMirror(checkedMirror)
  try {
    return fn()
  } finally {
    bindMirror(mirrorChange)
    stampedMode = false
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Scenes

/** [seed, year]: the dice and the calendar year of a scene. Searched once with findSeed at record time, constant after (X30). */
export type Tuple = readonly [seed: number, year: number]

/** One person of the cast. Whatever is left out is filled with a fixed value, never rolled. */
export interface CastSpec {
  /** The name the scene's `who` keeps them under. */
  key: string
  relation: RelationKind
  age: number
  gender?: Gender
  firstName?: string
  lastName?: string
  relationship?: number
  occupation?: string
  traits?: string[]
  stats?: Partial<Record<StatKey, number>>
  money?: number
  livesWithPlayer?: boolean
  species?: string
  data?: Record<string, Json>
}

export interface SceneSpec {
  /** Overrides for the player (the default is an adult of 30 in the US). */
  character?: Partial<Character>
  cast?: readonly CastSpec[]
  /** Stamp the scene's game with the social mark (R4-E7), whatever the mode. Absent: the mode of withStamped decides. */
  stamped?: boolean
}

export interface Scene {
  g: GameState
  /** The cast by key. */
  who: Record<string, Person>
  rows: ParityRow[]
  step(label: string, fn: (g: GameState) => void, extra?: Extra): ParityRow
}

let active: Scene | null = null

/** Where the game of the scene made last is also kept, so a vitest setup file (test/social-mutation.test.ts writes one) can reach it without importing the kit. */
export const GAME_SLOT = '__socialParityGame'

/** The state of the scene made last, or null before any. The mutation test draws its extra random number from it. */
export function currentGame(): GameState | null {
  return active?.g ?? null
}

/** A test game with the cast of `spec`. Building it draws no random number (a cast that rolled would move every later row). */
export function scene(tuple: Tuple, spec: SceneSpec = {}): Scene {
  const [seed, year] = tuple
  const g = makeTestGame(seed, { age: 30, ...spec.character })
  g.year = year
  const who: Record<string, Person> = {}
  ;(spec.cast ?? []).forEach((c, i) => {
    if (Object.hasOwn(who, c.key)) throw new Error(`scene: two people are called ${c.key}`)
    const pet = c.relation === 'pet'
    who[c.key] = createPerson(g, {
      relation: c.relation,
      age: c.age,
      gender: c.gender ?? (i % 2 === 0 ? 'female' : 'male'),
      firstName: c.firstName ?? `Kin${i}`,
      lastName: c.lastName ?? 'Test',
      relationship: c.relationship ?? 50,
      occupation: c.occupation ?? (pet ? 'Pet' : 'Clerk'),
      traits: c.traits ?? (pet ? ['calm'] : ['kind', 'calm']),
      stats: { happiness: 60, health: 70, smarts: 50, looks: 50, ...c.stats },
      money: c.money ?? 0,
      livesWithPlayer: c.livesWithPlayer ?? false,
      species: c.species,
      data: c.data,
    })
  })
  if (g.rng !== seed) throw new Error(`scene: building the cast drew from g.rng (${seed} -> ${g.rng}); give createPerson every field`)
  stampLife(g, spec.stamped)
  const rows: ParityRow[] = []
  const made: Scene = {
    g,
    who,
    rows,
    step(label, fn, extra) {
      fn(g)
      const row = snapshot(label, g, extra)
      rows.push(row)
      return row
    },
  }
  active = made
  ;(globalThis as Record<string, unknown>)[GAME_SLOT] = g
  return made
}

/** `scene.step` on the scene made last. */
export function step(label: string, fn: (g: GameState) => void, extra?: Extra): ParityRow {
  if (active === null) throw new Error('step: make a scene first')
  return active.step(label, fn, extra)
}

/** Runs a person's menu action by id. Throws when it is not there or is disabled: a closed path must be loud, not a quiet skip. */
export function runAction(g: GameState, p: Person, id: string, input?: string): void {
  const a = personActions(g, p).find((n): n is MenuAction => n.type === 'action' && n.id === id)
  if (a === undefined) throw new Error(`runAction: ${p.relation} ${p.firstName} has no action ${id}`)
  if (a.visible !== undefined && !a.visible(g)) throw new Error(`runAction: ${id} is not shown for ${p.relation} ${p.firstName}`)
  const why = a.disabledReason?.(g)
  if (why) throw new Error(`runAction: ${id} is disabled for ${p.relation} ${p.firstName}: ${why}`)
  a.run(g, input)
}

/** The three kinds a change of relationship can have (kernel/relations.ts, R4-E5). v5.2.0 has none and ignores the argument. */
export type RelKindName = RelKind

/**
 * The one place an oracle file calls addRelationship. v5.2.0 took (p, delta); since R4-E5 the call takes the game and an optional kind
 * (addRelationship(g, p, delta, kind?)), and `addRelationship(...a)` is the only line that knows the list. The social-mutation test finds
 * the delta and the person by their types, so it does not care which list the call takes.
 */
export const applyDelta = (...a: [g: GameState, p: Person, delta: number, kind?: RelKindName]): void => addRelationship(...a)

// ---------------------------------------------------------------------------------------------------------------------
// Comparing

export interface RowsReport {
  same: boolean
  moved: number
  /** The first row that moved, with what moved in it; null when none did. */
  first: string | null
  /** Up to the limit of rows that moved, in step order. */
  lines: string[]
}

const canon = (c: unknown): string => JSON.stringify(c)

/** What differs between the recorded row and the run's, as short phrases. */
function rowDiffs(a: ParityRow, b: ParityRow): string[] {
  const out: string[] = []
  if (a.label !== b.label) out.push(`the step is ${b.label}, the recording has ${a.label}`)
  const n = Math.max(a.rel.length, b.rel.length)
  for (let i = 0; i < n; i++) if (canon(a.rel[i]) !== canon(b.rel[i])) out.push(`rel[${i}] ${canon(a.rel[i])} -> ${canon(b.rel[i])}`)
  if (canon(a.rng) !== canon(b.rng)) out.push(`rng ${canon(a.rng)} -> ${canon(b.rng)}`)
  if (canon(a.nextId) !== canon(b.nextId)) out.push(`nextId ${canon(a.nextId)} -> ${canon(b.nextId)}`)
  if (canon(a.queue) !== canon(b.queue)) out.push(`queue ${canon(a.queue)} -> ${canon(b.queue)}`)
  if (canon(a.money) !== canon(b.money)) out.push(`money ${canon(a.money)} -> ${canon(b.money)}`)
  const ax = a.x ?? {}
  const bx = b.x ?? {}
  for (const k of new Set([...Object.keys(ax), ...Object.keys(bx)])) if (canon(ax[k]) !== canon(bx[k])) out.push(`x.${k} ${canon(ax[k])} -> ${canon(bx[k])}`)
  return out
}

/** The rows of a run against the recorded ones, by step order. A row that moved is named, and the first is `first`. */
export function compareRows(recorded: readonly ParityRow[], run: readonly ParityRow[], limit = 12): RowsReport {
  const lines: string[] = []
  let moved = 0
  for (let i = 0; i < Math.max(recorded.length, run.length); i++) {
    const a = recorded[i]
    const b = run[i]
    if (a === undefined || b === undefined) {
      moved++
      if (lines.length < limit) lines.push(a === undefined ? `#${i} ${b!.label}: not in the recording` : `#${i} ${a.label}: the run has no such step`)
      continue
    }
    const diffs = rowDiffs(a, b)
    if (diffs.length === 0) continue
    moved++
    if (lines.length < limit) lines.push(`#${i} ${a.label}: ${diffs.join('; ')}`)
  }
  return { same: moved === 0, moved, first: lines[0] ?? null, lines }
}

// ---------------------------------------------------------------------------------------------------------------------
// The recording

/** The Node major every recording is made under: the one CI runs. */
export const RECORD_NODE_MAJOR = 22
export const RECORD_DIGITS = 9

export interface Oracle {
  area: string
  /** Repo-relative (or absolute, for a test that records to a scratch directory). */
  file: string
}

export function oracle(area: string, file = `test/fixtures/social-parity-${area}.json`): Oracle {
  if (!/^[a-z][a-z0-9-]*$/.test(area)) throw new Error(`oracle: an area is lower-case words joined by hyphens, not ${area}`)
  return { area, file }
}

/** The command that records an area; the failure of a missing file names it. */
export const recordCommand = (o: Oracle): string => `RECORD_SOCIAL_PARITY=${o.area} RECORD_REASON="why the rows are recorded" wt/bin/vt22 <the area's test file>   (writes ${o.file})`

/** The header of a recording file. */
export interface Header {
  v: 1
  area: string
  /** process.version of the recorder. */
  node: string
  /** The short commit the recorder ran on. */
  head: string
  /** The tree of src/ at that commit: two commits with the same src/ made the same engine. */
  src: string
  /** Present and true only when RECORD_DIRTY=1 recorded over uncommitted changes in src/. */
  dirty?: true
  reason: string
  digits: number
  /** A hash of the step labels in order. */
  gridHash: string
  count: number
}

export interface Recording {
  header: Header
  rows: ParityRow[]
}

/** A hash of the step labels, in order. A step added, dropped, renamed or moved changes it. */
export function gridHash(rows: readonly ParityRow[]): string {
  return fnv1a(rows.map((r) => r.label).join('\n')).toString(16).padStart(8, '0')
}

const pack = (r: ParityRow): Cell => (r.x === undefined ? [r.label, r.rel, r.rng, r.nextId, r.queue, r.money] : [r.label, r.rel, r.rng, r.nextId, r.queue, r.money, r.x])

function unpack(raw: unknown, at: number): ParityRow {
  if (!Array.isArray(raw) || raw.length < 6 || raw.length > 7 || typeof raw[0] !== 'string' || !Array.isArray(raw[1]) || !Array.isArray(raw[4])) {
    throw new Error(`row ${at} is not a recorded step`)
  }
  const row: ParityRow = { label: raw[0], rel: raw[1] as Cell[], rng: raw[2] as Cell, nextId: raw[3] as Cell, queue: raw[4] as string[], money: raw[5] as Cell }
  if (raw.length === 7) row.x = raw[6] as { [key: string]: Cell }
  return row
}

/** The file's text: the header one field a line, then one row a line, so a diff reads one step at a time. */
export function serialize(h: Header, rows: readonly ParityRow[]): string {
  const head = (Object.keys(h) as (keyof Header)[]).map((k) => `${JSON.stringify(k)}: ${JSON.stringify(h[k])}`)
  return `{\n${head.join(',\n')},\n"rows": [\n${rows.map((r) => JSON.stringify(pack(r))).join(',\n')}\n]\n}\n`
}

/** The parsed file, or a throw that says what is wrong (a missing file names the command that records it). */
export function parseRecording(o: Oracle, text: string): Recording {
  let raw: { rows?: unknown } & Partial<Header>
  try {
    raw = JSON.parse(text) as typeof raw
  } catch {
    throw new Error(`${o.file} is not JSON`)
  }
  if (raw.v !== 1 || !Array.isArray(raw.rows) || typeof raw.gridHash !== 'string') throw new Error(`${o.file} is not a version 1 recording`)
  const rows = raw.rows.map(unpack)
  if (raw.gridHash !== gridHash(rows) || raw.count !== rows.length) throw new Error(`${o.file} was edited by hand (its steps are not the ones its header hashed): ${recordCommand(o)}`)
  const { rows: _rows, ...header } = raw
  return { header: header as Header, rows }
}

export function readRows(o: Oracle): Recording {
  const path = resolve(ROOT, o.file)
  if (!existsSync(path)) throw new Error(`${o.file} is missing: ${recordCommand(o)}`)
  return parseRecording(o, readFileSync(path, 'utf8'))
}

/** Throws the first rows that moved against the recording, naming the area. */
export function expectRows(o: Oracle, rows: readonly ParityRow[]): void {
  const { header, rows: recorded } = readRows(o)
  const report = compareRows(recorded, rows)
  if (report.same) return
  const grid = header.gridHash === gridHash(rows) ? '' : `\nthe steps are not the recorded ones (grid ${header.gridHash} against ${gridHash(rows)})`
  throw new Error(`${o.area}: ${report.moved} of ${recorded.length} rows moved (recorded at ${header.head}, src ${header.src.slice(0, 10)}); the first is ${report.first}${grid}\n${report.lines.join('\n')}`)
}

/** What the recorder reads from its surroundings; a test passes its own. */
export interface RecordDeps {
  env: Record<string, string | undefined>
  /** process.versions.node */
  node: string
  /** Runs git in the repository and returns its trimmed output. */
  git(args: readonly string[]): string
}

export function realDeps(): RecordDeps {
  return { env: process.env, node: process.versions.node, git: (args) => execFileSync('git', [...args], { cwd: ROOT, encoding: 'utf8' }).trim() }
}

/** True when RECORD_SOCIAL_PARITY names this area (a comma list) or is `all`. */
export function isRecording(area: string, env: Record<string, string | undefined> = process.env): boolean {
  const asked = (env.RECORD_SOCIAL_PARITY ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '')
  return asked.includes('all') || asked.includes(area)
}

/**
 * Writes the recording. Refuses unless the area is asked for, RECORD_REASON passes checkReason, the Node major is the one CI runs
 * and src/ equals HEAD (RECORD_DIRTY=1 records anyway and marks the header). Returns the text written.
 */
export function recordRows(o: Oracle, rows: readonly ParityRow[], deps: RecordDeps = realDeps()): string {
  if (!isRecording(o.area, deps.env)) throw new Error(`recordRows writes ${o.file} only when asked: ${recordCommand(o)}`)
  const bad = checkReason(deps.env.RECORD_REASON)
  if (bad !== null) throw new Error(`RECORD_REASON: ${bad}`)
  const major = Number(deps.node.split('.')[0])
  if (major !== RECORD_NODE_MAJOR) throw new Error(`record under Node ${RECORD_NODE_MAJOR}, the version CI runs, not ${deps.node} (wt/bin/vt22 does)`)
  const dirty = deps.git(['status', '--porcelain', '--', 'src'])
  if (dirty !== '' && deps.env.RECORD_DIRTY !== '1') throw new Error(`record on the committed engine: src/ has uncommitted changes (RECORD_DIRTY=1 records over them and marks the header):\n${dirty}`)
  const header: Header = {
    v: 1,
    area: o.area,
    node: `v${deps.node}`,
    head: deps.git(['rev-parse', '--short', 'HEAD']),
    src: deps.git(['rev-parse', 'HEAD:src']),
    ...(dirty !== '' ? { dirty: true as const } : {}),
    reason: (deps.env.RECORD_REASON ?? '').trim(),
    digits: RECORD_DIGITS,
    gridHash: gridHash(rows),
    count: rows.length,
  }
  const text = serialize(header, rows)
  const path = resolve(ROOT, o.file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  return text
}

// ---------------------------------------------------------------------------------------------------------------------
// The kit's own scene

/** The tuple of the reference scene. */
export const REFERENCE: Tuple = [11, 2026]

/** The (start, delta) pairs of the reference table: both bounds, the bound plus one, halves, a huge delta, and the values a save could carry. */
export const REFERENCE_TABLE: readonly (readonly [number, number])[] = [
  [0, -5],
  [1, 7],
  [49, 0.5],
  [50, -0.5],
  [99, 5],
  [100, 1],
  [100, -1000],
  [50, 1e9],
  [Number.NaN, 5],
  [50, Number.NaN],
  [50, Number.POSITIVE_INFINITY],
]

/** The kit's small scene, played on the engine as it is: the table through applyDelta, then four real actions of relationships.ts. */
export function referenceRows(): ParityRow[] {
  const s = scene(REFERENCE, {
    cast: [
      { key: 'mom', relation: 'parent', age: 55, relationship: 25, livesWithPlayer: true },
      { key: 'pal', relation: 'friend', age: 31, relationship: 80 },
      { key: 'dog', relation: 'pet', age: 3, species: 'Dog', firstName: 'Rex', relationship: 99 },
    ],
  })
  const { mom, pal, dog } = s.who
  for (const [start, d] of REFERENCE_TABLE) {
    s.step(`table|${start}|${d}`, (g) => {
      pal!.relationship = start
      applyDelta(g, pal!, d)
    })
  }
  s.step('hug|mom|25', (g) => runAction(g, mom!, 'hug'))
  s.step('hug|mom|again', (g) => runAction(g, mom!, 'hug'))
  s.step('time|pal|80', (g) => runAction(g, pal!, 'spendTime'))
  s.step('play|dog|99', (g) => runAction(g, dog!, 'play'))
  return s.rows
}
