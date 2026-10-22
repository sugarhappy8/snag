// R2-P2 (K.7b c): the golden CLI, `node scripts/golden.mjs <command>`. The launcher bundles this file with esbuild and runs it
// with GOLDEN_CLI=1; under vitest it is only imported, and runCli takes its dependencies as an argument so a test can drive it
// without playing a life.
//
//   check  [--plan pr|deep|all]     play, compare with test/fixtures/golden-digests.json, one line per moved slice, exit 1 if any moved
//   update --reason "text" [--plan pr|deep|all] [--at LABEL] [--allow-node]
//                                   play, write the file and a history entry; the reason is the written list the R2 exit gate asks for
//   show   [--plan pr|deep|all]     print the committed digests (plays nothing)
//
// Exit codes: 0 ok, 1 a digest moved or a problem (no file, a malformed file), 2 bad usage.
//
// No vitest imports here: the same module runs under vitest and as a bundled node script.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { SLICES, type SliceName } from './golden-kit'
import {
  GOLDEN_FILE,
  GOLDEN_HASH,
  GOLDEN_PLANS,
  HISTORY_LIMIT,
  PLAN_NAMES,
  compareGolden,
  orderCheckpoints,
  readGolden,
  runPlan,
  samePlan,
  serializeGolden,
  type GoldenFile,
  type GoldenHistory,
  type LifeDigests,
  type PlanName,
} from './golden-run'

const FILE_NAME = 'test/fixtures/golden-digests.json'
const REASON_MIN = 20
const REASON_MAX = 200
const WORDS_MIN = 4 // the message below says "four"
const AT_MAX = 60

/** An em dash or an en dash, written as code points so this file carries neither character. */
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)

/** Words a reason may not be made of alone. */
const STOCK = new Set(['rebaseline', 'rebaselined', 'rebaselines', 'update', 'updated', 'updates', 'golden', 'digest', 'digests', 'regenerate', 'regenerated', 'regenerates', 'fix', 'fixes', 'fixed', 'test', 'tests'])

/** Null when the reason will do, else why not: 20 to 200 characters trimmed, one line, four words, no long dash, not a stock phrase. */
export function checkReason(reason: string | undefined): string | null {
  if (reason === undefined) return 'a reason is required: --reason "why the digests moved"'
  const text = reason.trim()
  if (text.length < REASON_MIN || text.length > REASON_MAX) return `the reason is ${text.length} characters; it needs ${REASON_MIN} to ${REASON_MAX}`
  if (/[\r\n]/.test(text)) return 'the reason must be one line'
  if (LONG_DASH.test(text)) return 'the reason has a long dash; use a plain hyphen'
  const words = text.split(/\s+/)
  if (words.length < WORDS_MIN) return 'the reason needs at least four words'
  const tokens = words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter((w) => w !== '')
  if (tokens.every((w) => STOCK.has(w))) return 'the reason is only a stock phrase; say why the digests moved'
  return null
}

export interface CliDeps {
  /** Plays a plan: life id -> digests. */
  run(plan: PlanName): Record<string, LifeDigests>
  /** The committed file, null when there is none; throws when it is malformed. */
  read(): GoldenFile | null
  write(f: GoldenFile): void
  /** The Node major this process runs under. */
  node: number
  /** Where the digests are recorded: a short git hash, or 'working tree'. */
  at(): string
  out(line: string): void
}

function nodeMajor(): number {
  return Number(process.versions.node.split('.')[0])
}

function shortHash(): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: dirname(GOLDEN_FILE), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return out === '' ? 'working tree' : out
  } catch {
    return 'working tree'
  }
}

function realDeps(): CliDeps {
  return {
    run: (plan) => runPlan(plan),
    read: () => readGolden(),
    write: (f) => writeFileSync(GOLDEN_FILE, serializeGolden(f)),
    node: nodeMajor(),
    at: shortHash,
    out: (line) => console.log(line),
  }
}

const USAGE = [
  'usage: node scripts/golden.mjs <command> [options]',
  '  check  [--plan pr|deep|all]   play and compare with the committed digests; exit 1 if any moved (default plan: pr)',
  '  update --reason "why" [--plan pr|deep|all] [--at LABEL] [--allow-node]',
  '                                play, rewrite the file and add a history entry (default plan: all)',
  '  show   [--plan pr|deep|all]   print the committed digests as a table; plays nothing',
  '  help',
  `The file is ${FILE_NAME}. Regenerate it under Node 22 (the version CI runs), with a written reason. Never merge it by hand: rebase, then run update.`,
]

class Usage extends Error {}

type Command = 'check' | 'update' | 'show'
const ALLOWED: Record<Command, readonly string[]> = {
  check: ['plan'],
  update: ['plan', 'reason', 'at', 'allow-node'],
  show: ['plan'],
}

/** The plans a --plan value names; `fallback` when it is not given. */
function plansOf(value: string | undefined, fallback: PlanName[] | 'all'): PlanName[] {
  const v = value ?? (fallback === 'all' ? 'all' : fallback.join(','))
  if (v === 'all') return [...PLAN_NAMES]
  if (v === 'pr' || v === 'deep') return [v]
  throw new Usage(`--plan is pr, deep or all, not "${v}"`)
}

const label = (at: string): string => (at === 'end' ? 'the end' : `year ${at}`)

/** Runs one command. 0 ok, 1 a digest moved or a problem, 2 bad usage. */
export function runCli(argv: readonly string[], deps: CliDeps = realDeps()): number {
  const { out } = deps
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: { plan: { type: 'string' }, reason: { type: 'string' }, at: { type: 'string' }, 'allow-node': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
    })
    const [command, ...extra] = positionals
    if (command === 'help' || (command === undefined && values.help)) {
      for (const line of USAGE) out(line)
      return 0
    }
    if (command === undefined) throw new Usage('no command given')
    if (command !== 'check' && command !== 'update' && command !== 'show') throw new Usage(`unknown command: ${command}`)
    if (extra.length > 0) throw new Usage(`unexpected argument: ${extra[0]}`)
    for (const name of Object.keys(values)) if (!ALLOWED[command].includes(name)) throw new Usage(`--${name} is not an option of ${command}`)
    if (command === 'check') return check(plansOf(values.plan, ['pr']), deps)
    if (command === 'show') return show(plansOf(values.plan, 'all'), deps)
    return update({ plans: plansOf(values.plan, 'all'), planGiven: values.plan ?? 'all', reason: values.reason, at: values.at, allowNode: values['allow-node'] === true }, deps)
  } catch (err) {
    if (err instanceof Usage || (err as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
      out((err as Error).message)
      for (const line of USAGE) out(line)
      return 2
    }
    throw err
  }
}

/** The committed file, or null after saying why there is none to use. */
function committed(deps: CliDeps): GoldenFile | null {
  try {
    const f = deps.read()
    if (f) return f
    deps.out(`there is no ${FILE_NAME} yet: make it under Node 22 with node scripts/golden.mjs update --reason "<why>"`)
  } catch (err) {
    deps.out(`cannot use ${FILE_NAME}: ${(err as Error).message}`)
  }
  return null
}

// ---------------------------------------------------------------------------------------------- check

function check(plans: readonly PlanName[], deps: CliDeps): number {
  const golden = committed(deps)
  if (!golden) return 1
  const { out } = deps
  if (golden.node !== deps.node) out(`note: ${FILE_NAME} was recorded under Node ${golden.node}; this is Node ${deps.node}, and a different major can move a digest on its own`)
  let problems = 0
  for (const plan of plans) {
    const planChanged = !samePlan(golden.plans[plan], GOLDEN_PLANS[plan])
    if (planChanged) {
      problems++
      out(`plan ${plan}: the plan changed (its lives or checkpoints differ from the file)`)
    }
    const was = golden.digests[plan] ?? {}
    const now = deps.run(plan)
    const moved = compareGolden(was, now)
    const lives = new Set([...Object.keys(was), ...Object.keys(now)])
    for (const slice of SLICES) {
      const mine = moved.filter((m) => m.slice === slice)
      if (mine.length === 0) continue
      problems++
      const first = mine[0]
      out(`plan ${plan}: slice ${slice} moved: first at ${first.life} ${label(first.at)} (golden ${first.golden}, now ${first.now}), in ${new Set(mine.map((m) => m.life)).size} of ${lives.size} lives`)
    }
    if (moved.length === 0 && !planChanged) out(`plan ${plan}: no digest moved (${lives.size} lives)`)
  }
  if (problems === 0) return 0
  out('If this is intended: node scripts/golden.mjs update --reason "<why>"')
  return 1
}

// ---------------------------------------------------------------------------------------------- show

function show(plans: readonly PlanName[], deps: CliDeps): number {
  const golden = committed(deps)
  if (!golden) return 1
  const { out } = deps
  const last = golden.history[golden.history.length - 1]
  out(`${FILE_NAME}: Node ${golden.node}, ${golden.hash}, ${golden.history.length} history entries${last ? `, newest ${last.at}: ${last.reason}` : ''}`)
  for (const plan of plans) {
    const p = golden.plans[plan]
    out('')
    out(`plan ${plan}: checkpoints ${p.checkpoints.join(', ') || 'none'}, ${p.lives.length} lives (digests cut to 8 characters)`)
    const rows: string[][] = [['life', 'at', ...SLICES]]
    for (const [id, digests] of Object.entries(golden.digests[plan] ?? {})) {
      for (const at of orderCheckpoints(Object.keys(digests))) rows.push([id, at, ...SLICES.map((s) => (digests[at][s] ?? '').slice(0, 8))])
    }
    const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)))
    for (const r of rows) out(r.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd())
  }
  return 0
}

// ---------------------------------------------------------------------------------------------- update

interface UpdateOptions {
  plans: PlanName[]
  planGiven: string
  reason: string | undefined
  at: string | undefined
  allowNode: boolean
}

function copyPlan(plan: PlanName): GoldenFile['plans'][PlanName] {
  return { checkpoints: [...GOLDEN_PLANS[plan].checkpoints], lives: GOLDEN_PLANS[plan].lives.map((l) => ({ ...l })) }
}

function update(opts: UpdateOptions, deps: CliDeps): number {
  const { out } = deps
  const problem = checkReason(opts.reason)
  if (problem) throw new Usage(problem)
  const reason = (opts.reason as string).trim()
  const at = opts.at === undefined ? deps.at() : opts.at.trim()
  if (at === '' || at.length > AT_MAX) throw new Usage(`--at needs 1 to ${AT_MAX} characters`)

  let old: GoldenFile | null
  try {
    old = deps.read()
  } catch (err) {
    out(`cannot use ${FILE_NAME}: ${(err as Error).message}`)
    return 1
  }
  if (old && old.node !== deps.node && !opts.allowNode) {
    out(`${FILE_NAME} was recorded under Node ${old.node} and this is Node ${deps.node}: a different major can move a digest on its own.`)
    out('Run update under Node 22 (the version CI runs), or pass --allow-node to record this major on purpose.')
    return 2
  }

  const next: GoldenFile = {
    v: 1,
    node: deps.node,
    hash: GOLDEN_HASH,
    plans: { pr: old?.plans.pr ?? { checkpoints: [], lives: [] }, deep: old?.plans.deep ?? { checkpoints: [], lives: [] } },
    digests: { pr: old?.digests.pr ?? {}, deep: old?.digests.deep ?? {} },
    history: old ? [...old.history] : [],
  }
  const moved = new Set<SliceName>()
  let planChanged = false
  for (const plan of opts.plans) {
    const now = deps.run(plan)
    for (const m of compareGolden(old?.digests[plan] ?? {}, now)) moved.add(m.slice)
    if (!old || !samePlan(old.plans[plan], GOLDEN_PLANS[plan])) planChanged = true
    next.plans[plan] = copyPlan(plan)
    next.digests[plan] = now
  }
  if (moved.size === 0 && !planChanged && old && old.node === deps.node) {
    out('no digest moved, file unchanged')
    return 0
  }

  const list = SLICES.filter((s) => moved.has(s))
  const entry: GoldenHistory = { at, plan: opts.planGiven as GoldenHistory['plan'], reason, moved: list }
  next.history = [...next.history, entry].slice(-HISTORY_LIMIT)
  deps.write(next)
  out(`wrote ${FILE_NAME} (plan ${opts.planGiven}, Node ${deps.node}, recorded at ${at}); moved: ${list.length > 0 ? list.join(', ') : 'none'}`)
  out('Paste this into the commit message:')
  out(`Golden: ${list.length > 0 ? `moved ${list.join(', ')}` : 'plan or runtime changed, no digest moved'}: ${reason}`)
  out('Never merge this file by hand: after a rebase, run update again.')
  return 0
}

// The launcher (scripts/golden.mjs) bundles this file and runs it with GOLDEN_CLI=1.
if (process.env.GOLDEN_CLI === '1') process.exitCode = runCli(process.argv.slice(2))
