// R2-P2 (K.7b c): the golden CLI. `node scripts/golden.mjs check|update|show` is the one way the committed digests change, and
// `update` takes a written reason. These tests drive runCli with injected dependencies, so no life is played: what they pin is
// the rules (the reason, the history, the Node major, the one-line-per-checkpoint file, what a move prints), not the digests.
// The last two cases go through the real launcher once (it bundles the CLI with esbuild, a few seconds).
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkReason, runCli, type CliDeps } from './golden-cli'
import { SLICES, fnv, type SliceDigests, type SliceName } from './golden-kit'
import { GOLDEN_PLANS, serializeGolden, type GoldenFile, type GoldenHistory, type LifeDigests, type PlanName } from './golden-run'

const ROOT = join(__dirname, '..')
const REASON = 'text moved because the picker now draws from the text stream'
const DASH_EM = String.fromCharCode(0x2014)
const DASH_EN = String.fromCharCode(0x2013)
const PLANS: readonly PlanName[] = ['pr', 'deep']

/** A reason of exactly n characters made of plain words. */
function reasonOf(n: number): string {
  let s = ''
  while (s.length < n) s += 'alpha '
  return s.slice(0, n).replace(/ $/, 'a')
}

describe('checkReason', () => {
  it('accepts a real reason and trims it', () => {
    expect(checkReason(REASON)).toBeNull()
    expect(checkReason(`   ${REASON}   `)).toBeNull()
    expect(checkReason('first golden digests, recorded on the wave 0 base before the R2 tracks merge')).toBeNull()
    expect(checkReason('rebaseline after the text stream moved the text slice')).toBeNull()
  })

  it('wants 20 to 200 characters after trimming', () => {
    expect(reasonOf(19)).toHaveLength(19)
    expect(checkReason(reasonOf(19))).toMatch(/20 to 200/)
    expect(checkReason(reasonOf(20))).toBeNull()
    expect(checkReason(reasonOf(200))).toBeNull()
    expect(checkReason(reasonOf(201))).toMatch(/20 to 200/)
    expect(checkReason(`        ${reasonOf(10)}        `)).toMatch(/20 to 200/)
  })

  it('wants at least four words', () => {
    expect(checkReason('extraordinarilylongword another third')).toMatch(/four words/)
    expect(checkReason('four words are the least needed here')).toBeNull()
  })

  it('refuses a missing or empty reason, a line break and either long dash', () => {
    expect(checkReason(undefined)).toMatch(/required/)
    expect(checkReason('')).not.toBeNull()
    expect(checkReason(`${REASON}\nand a second line`)).toMatch(/one line/)
    expect(checkReason(`text moved ${DASH_EM} the picker draws elsewhere now`)).toMatch(/dash/)
    expect(checkReason(`text moved ${DASH_EN} the picker draws elsewhere now`)).toMatch(/dash/)
  })

  it('refuses a stock phrase, alone or repeated', () => {
    expect(checkReason('rebaseline')).not.toBeNull()
    expect(checkReason('Rebaseline rebaseline rebaseline rebaseline.')).toMatch(/stock/)
    expect(checkReason('update golden digests, regenerate, fix tests')).toMatch(/stock/)
    expect(checkReason('fix tests')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------- the harness

type Tweak = (life: string, at: string, slice: SliceName) => string

/** What a run of `plan` would give: one digest per slice for every life and checkpoint of the plan, plus 'end'. */
function fake(plan: PlanName, tweak: Tweak = () => ''): Record<string, LifeDigests> {
  const out: Record<string, LifeDigests> = {}
  for (const l of GOLDEN_PLANS[plan].lives) {
    const digests: LifeDigests = {}
    for (const at of [...GOLDEN_PLANS[plan].checkpoints.map(String), 'end']) {
      const one = {} as SliceDigests
      for (const s of SLICES) one[s] = fnv([plan, l.id, at, s, tweak(l.id, at, s)].join('|'))
      digests[at] = one
    }
    out[l.id] = digests
  }
  return out
}

function fileOf(tweaks: Partial<Record<PlanName, Tweak>> = {}, history: GoldenHistory[] = [], node = 22): GoldenFile {
  return {
    v: 1,
    node,
    hash: 'canonical-json,fnv1a-32x2',
    plans: {
      pr: { checkpoints: [...GOLDEN_PLANS.pr.checkpoints], lives: GOLDEN_PLANS.pr.lives.map((l) => ({ ...l })) },
      deep: { checkpoints: [...GOLDEN_PLANS.deep.checkpoints], lives: GOLDEN_PLANS.deep.lives.map((l) => ({ ...l })) },
    },
    digests: { pr: fake('pr', tweaks.pr), deep: fake('deep', tweaks.deep) },
    history,
  }
}

function entry(n: number): GoldenHistory {
  return { at: `r${n}`, plan: 'all', reason: `an older reason number ${n} for the history`, moved: ['rng'] }
}

interface Rig {
  deps: CliDeps
  lines: string[]
  writes: GoldenFile[]
  ran: PlanName[]
  file(): GoldenFile | null
}

/** Injected dependencies: `file` is what is on disk, `now` what the plans play out to. */
function rig(file: GoldenFile | null, now: Partial<Record<PlanName, Tweak>> = {}, node = 22): Rig {
  const lines: string[] = []
  const writes: GoldenFile[] = []
  const ran: PlanName[] = []
  let disk = file
  const deps: CliDeps = {
    run: (plan) => {
      ran.push(plan)
      return fake(plan, now[plan])
    },
    read: () => disk,
    write: (f) => {
      writes.push(f)
      disk = f
    },
    node,
    at: () => 'abc1234',
    out: (line) => lines.push(line),
  }
  return { deps, lines, writes, ran, file: () => disk }
}

const said = (r: Rig): string => r.lines.join('\n')

describe('update', () => {
  it('on a missing file writes every digest and records all nine slices as moved', () => {
    const r = rig(null)
    expect(runCli(['update', '--reason', REASON], r.deps)).toBe(0)
    expect(r.writes).toHaveLength(1)
    const f = r.writes[0]
    expect(f.v).toBe(1)
    expect(f.node).toBe(22)
    expect(f.hash).toBe('canonical-json,fnv1a-32x2')
    expect(f.plans.pr.lives.map((l) => l.id)).toEqual(GOLDEN_PLANS.pr.lives.map((l) => l.id))
    expect(f.plans.deep.checkpoints).toEqual([...GOLDEN_PLANS.deep.checkpoints])
    expect(f.digests).toEqual({ pr: fake('pr'), deep: fake('deep') })
    expect(f.history).toEqual([{ at: 'abc1234', plan: 'all', reason: REASON, moved: [...SLICES] }])
    expect(said(r)).toContain(`Golden: moved ${SLICES.join(', ')}: ${REASON}`)
  })

  it('writes nothing when no digest moved, and does not record the reason', () => {
    const r = rig(fileOf())
    expect(runCli(['update', '--reason', REASON], r.deps)).toBe(0)
    expect(r.writes).toHaveLength(0)
    expect(said(r)).toContain('no digest moved, file unchanged')
    expect(r.file()!.history).toHaveLength(0)
  })

  it('a changed text digest records moved: [text] and nothing else', () => {
    const r = rig(fileOf(), { pr: (_l, _at, s) => (s === 'text' ? 'later' : '') })
    expect(runCli(['update', '--reason', REASON], r.deps)).toBe(0)
    expect(r.writes).toHaveLength(1)
    expect(r.writes[0].history).toEqual([{ at: 'abc1234', plan: 'all', reason: REASON, moved: ['text'] }])
    expect(r.writes[0].digests.pr['birth-1950']['5'].text).toBe(fake('pr', (_l, _at, s) => (s === 'text' ? 'later' : ''))['birth-1950']['5'].text)
    expect(r.writes[0].digests.pr['birth-1950']['5'].rng).toBe(fake('pr')['birth-1950']['5'].rng)
    expect(said(r)).toContain(`Golden: moved text: ${REASON}`)
  })

  it('lists the moved slices in SLICES order, whichever order they moved in', () => {
    const r = rig(fileOf(), { deep: (_l, _at, s) => (s === 'people' || s === 'rng' ? 'x' : '') })
    expect(runCli(['update', '--reason', REASON, '--at', 'v5-test'], r.deps)).toBe(0)
    expect(r.writes[0].history[0].moved).toEqual(['rng', 'people'])
    expect(r.writes[0].history[0].at).toBe('v5-test')
  })

  it('--plan pr plays only the pr plan and keeps the deep digests', () => {
    const old = fileOf({ deep: () => 'recorded earlier' })
    const r = rig(old, { pr: (_l, _at, s) => (s === 'assets' ? 'x' : '') })
    expect(runCli(['update', '--plan', 'pr', '--reason', REASON], r.deps)).toBe(0)
    expect(r.ran).toEqual(['pr'])
    expect(r.writes[0].digests.deep).toEqual(old.digests.deep)
    expect(r.writes[0].history[0]).toMatchObject({ plan: 'pr', moved: ['assets'] })
  })

  it('--plan pr on a missing file leaves the deep plan unrecorded', () => {
    const r = rig(null)
    expect(runCli(['update', '--plan', 'pr', '--reason', REASON], r.deps)).toBe(0)
    expect(r.writes[0].digests.deep).toEqual({})
    expect(r.writes[0].plans.deep).toEqual({ checkpoints: [], lives: [] })
    expect(r.writes[0].digests.pr).toEqual(fake('pr'))
  })

  it('keeps the newest 40 history entries', () => {
    const history = Array.from({ length: 40 }, (_, i) => entry(i))
    const r = rig(fileOf({}, history), { pr: (_l, _at, s) => (s === 'rng' ? 'x' : '') })
    expect(runCli(['update', '--reason', REASON], r.deps)).toBe(0)
    const kept = r.writes[0].history
    expect(kept).toHaveLength(40)
    expect(kept[0]).toEqual(entry(1))
    expect(kept[39]).toMatchObject({ reason: REASON, moved: ['rng'] })
  })

  it('writes when only the plan changed (a life dropped from the file), with nothing moved', () => {
    const old = fileOf()
    old.plans.pr.lives[0] = { ...old.plans.pr.lives[0], years: old.plans.pr.lives[0].years + 1 }
    const r = rig(old)
    expect(runCli(['update', '--reason', REASON], r.deps)).toBe(0)
    expect(r.writes).toHaveLength(1)
    expect(r.writes[0].plans.pr.lives[0].years).toBe(GOLDEN_PLANS.pr.lives[0].years)
    expect(r.writes[0].history[0].moved).toEqual([])
  })

  it('refuses another Node major without --allow-node, and records the new one with it', () => {
    const refused = rig(fileOf(), { pr: (_l, _at, s) => (s === 'text' ? 'x' : '') }, 24)
    expect(runCli(['update', '--reason', REASON], refused.deps)).toBe(2)
    expect(refused.writes).toHaveLength(0)
    expect(refused.ran).toEqual([])
    expect(said(refused)).toMatch(/Node 22/)
    expect(said(refused)).toMatch(/--allow-node/)

    const allowed = rig(fileOf(), { pr: (_l, _at, s) => (s === 'text' ? 'x' : '') }, 24)
    expect(runCli(['update', '--reason', REASON, '--allow-node'], allowed.deps)).toBe(0)
    expect(allowed.writes[0].node).toBe(24)
  })

  it('checks the reason before it plays anything', () => {
    const r = rig(null)
    expect(runCli(['update', '--reason', 'rebaseline'], r.deps)).toBe(2)
    expect(r.ran).toEqual([])
    expect(r.writes).toHaveLength(0)
    expect(said(r)).toMatch(/reason/)
  })
})

describe('check', () => {
  it('exits 0 and says so when nothing moved', () => {
    const r = rig(fileOf())
    expect(runCli(['check'], r.deps)).toBe(0)
    expect(r.ran).toEqual(['pr'])
    expect(said(r)).toMatch(/no digest moved/)
    expect(said(r)).not.toContain('update --reason')
  })

  it('names the first moved checkpoint, the lives it moved in, and the way to regenerate; exits 1', () => {
    const from = (life: string, at: string, s: SliceName): string => (s === 'text' && life !== GOLDEN_PLANS.pr.lives[0].id && at !== '5' ? 'x' : '')
    const r = rig(fileOf(), { pr: from })
    expect(runCli(['check'], r.deps)).toBe(1)
    const text = said(r)
    // The first life that moved is the second (the first one is untouched), at its checkpoint 10 (5 is untouched).
    expect(text).toContain(`slice text moved`)
    expect(text).toContain(`first at ${GOLDEN_PLANS.pr.lives[1].id} year 10`)
    expect(text).toMatch(/2 of 3 lives/)
    expect(text).not.toMatch(/slice rng/)
    expect(text).toContain('If this is intended: node scripts/golden.mjs update --reason "<why>"')
  })

  it('reports the golden and the current digest of the first move', () => {
    const r = rig(fileOf(), { pr: (_l, _at, s) => (s === 'rng' ? 'x' : '') })
    expect(runCli(['check'], r.deps)).toBe(1)
    const was = fake('pr')[GOLDEN_PLANS.pr.lives[0].id]['5'].rng
    const now = fake('pr', (_l, _at, s) => (s === 'rng' ? 'x' : ''))[GOLDEN_PLANS.pr.lives[0].id]['5'].rng
    expect(said(r)).toContain(was)
    expect(said(r)).toContain(now)
  })

  it('a missing file is a problem (exit 1) that says how to make it', () => {
    const r = rig(null)
    expect(runCli(['check'], r.deps)).toBe(1)
    expect(r.ran).toEqual([])
    expect(said(r)).toMatch(/update --reason/)
  })

  it('--plan all plays both plans; a plan that changed is reported as such', () => {
    const old = fileOf()
    old.plans.deep.lives = old.plans.deep.lives.slice(1)
    const r = rig(old)
    expect(runCli(['check', '--plan', 'all'], r.deps)).toBe(1)
    expect(r.ran).toEqual(['pr', 'deep'])
    expect(said(r)).toMatch(/plan deep: the plan changed/)
  })

  it('a life the run lost counts as a move of every slice', () => {
    const r = rig(fileOf())
    const run = r.deps.run
    r.deps.run = (plan) => {
      const out = run(plan)
      delete out[GOLDEN_PLANS.pr.lives[2].id]
      return out
    }
    expect(runCli(['check'], r.deps)).toBe(1)
    for (const s of SLICES) expect(said(r)).toContain(`slice ${s} moved`)
  })

  it('notes a Node major that is not the file\'s', () => {
    const r = rig(fileOf(), {}, 24)
    expect(runCli(['check'], r.deps)).toBe(0)
    expect(said(r)).toMatch(/recorded under Node 22.*Node 24/)
  })
})

describe('show', () => {
  it('prints a table of the committed digests and plays nothing', () => {
    const r = rig(fileOf())
    expect(runCli(['show'], r.deps)).toBe(0)
    expect(r.ran).toEqual([])
    const text = said(r)
    for (const s of SLICES) expect(text).toContain(s)
    for (const l of GOLDEN_PLANS.pr.lives) expect(text).toContain(l.id)
    expect(text).toContain(fake('pr')[GOLDEN_PLANS.pr.lives[0].id]['5'].rng.slice(0, 8))
  })

  it('--plan limits it to one plan', () => {
    const r = rig(fileOf())
    expect(runCli(['show', '--plan', 'pr'], r.deps)).toBe(0)
    for (const l of GOLDEN_PLANS.pr.lives) expect(said(r)).toContain(l.id)
    expect(said(r)).not.toContain(GOLDEN_PLANS.deep.lives[GOLDEN_PLANS.deep.lives.length - 1].id)
  })

  it('a missing file exits 1', () => {
    const r = rig(null)
    expect(runCli(['show'], r.deps)).toBe(1)
  })
})

const BAD: ReadonlyArray<readonly [argv: string[], why: string]> = [
  [[], 'no command'],
  [['bogus'], 'unknown command'],
  [['update'], 'update without --reason'],
  [['update', '--reason'], '--reason without a value'],
  [['update', '--reason', REASON, '--plan', 'weekly'], 'a bad --plan'],
  [['check', '--plan', 'nope'], 'a bad --plan on check'],
  [['check', '--bogus'], 'an unknown option'],
  [['check', '--reason', REASON], 'an option the command does not take'],
  [['check', 'now'], 'an extra argument'],
  [['update', '--reason', REASON, '--at', ''], 'an empty --at'],
]

describe('usage', () => {
  it.each(BAD)('%j exits 2 (%s) and plays nothing', (argv) => {
    const r = rig(fileOf())
    expect(runCli(argv, r.deps)).toBe(2)
    expect(r.ran).toEqual([])
    expect(r.writes).toHaveLength(0)
  })

  it('help prints the commands and exits 0', () => {
    const r = rig(fileOf())
    expect(runCli(['help'], r.deps)).toBe(0)
    for (const word of ['check', 'update', 'show', '--reason']) expect(said(r)).toContain(word)
  })
})

describe('serializeGolden', () => {
  const f = fileOf({}, [entry(1), entry(2)])

  it('round trips through JSON.parse', () => {
    expect(JSON.parse(serializeGolden(f))).toEqual(f)
  })

  it('has one line per (life, checkpoint), a final newline and no trailing space', () => {
    const text = serializeGolden(f)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
    expect(text.split('\n').some((line) => /\s$/.test(line))).toBe(false)
    let expected = 0
    for (const plan of PLANS) for (const life of Object.values(f.digests[plan])) expected += Object.keys(life).length
    expect(text.split('\n').filter((line) => line.includes('"rng":')).length).toBe(expected)
    // And no line holds two of them.
    expect(text.split('\n').every((line) => (line.match(/"rng":/g) ?? []).length <= 1)).toBe(true)
  })

  it('writes the checkpoints in order and end last, one per line', () => {
    const lines = serializeGolden(f).split('\n')
    const start = lines.findIndex((line) => line.includes('"birth-1950": {') && !line.includes('"id"'))
    const keys = lines.slice(start + 1, start + 5).map((line) => /"(\w+)":/.exec(line)![1])
    expect(keys).toEqual(['5', '10', '20', 'end'])
  })

  it('a change to one life at one checkpoint changes exactly one line', () => {
    const before = serializeGolden(fileOf()).split('\n')
    const after = serializeGolden(fileOf({ pr: (l, at, s) => (l === 'founder-1975' && at === '10' && s === 'people' ? 'x' : '') })).split('\n')
    expect(after).toHaveLength(before.length)
    expect(after.filter((line, i) => line !== before[i])).toHaveLength(1)
  })
})

describe('the launcher', () => {
  const launch = (...args: string[]) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'golden.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' })

  it('show exits 0 and prints the nine slice names of the committed file', () => {
    const run = launch('show')
    expect(run.status, run.stderr).toBe(0)
    for (const s of SLICES) expect(run.stdout).toContain(s)
  }, 60_000)

  it('an unknown command exits 2', () => {
    const run = launch('bogus')
    expect(run.status, run.stderr).toBe(2)
  }, 60_000)
})
