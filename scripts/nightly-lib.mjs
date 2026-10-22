// nightly-lib.mjs - the pure functions behind scripts/nightly.mjs (R2-P5, K.7b f): what size each nightly job runs at, how the
// shards' metric files merge, the rules a night is held to, and the diff against the previous night. No file or process access
// here, so test/nightly-lib.test.ts can pin every rule on small numbers. Types are in nightly-lib.d.mts.
//
// A metrics file is what test/nightly-metrics.ts writes: { v: 1, job, shard, metrics, samples? }. A name is dotted words; its last
// word says how shards combine (.sum adds, .max takes the biggest), and a `samples` list is pooled across shards and expanded to
// n, p10, p50, p90, p95, p99 and max, so a percentile is always a percentile of the whole pool and never an average of shards.
//
// Dependency-free Node ESM.

// ---------------------------------------------------------------------------------------------- the sizes

/** What each nightly job runs at. Full is the roadmap's list; smoke is the same workflow in a few minutes (pull request runs). */
export function nightlySizes(scale) {
  if (scale === 'full') {
    return {
      // 8 shards of 5 seeds is 40 lives of 160 years, each capped at 600 s (a slow night shows as fewer years, never as a hang).
      fuzz: { shards: 8, seedsPerShard: 5, years: 160, budgetSeconds: 600 },
      // 4 shards of 50 is the 200 lives of lifeSpecs(200, 40): odd seeds birth lives, even seeds founders for 40 years.
      balance: { shards: 4, lives: 50, years: 40 },
      // 4 shards of 6 founders with 3 to 12 companies, a hundred times the money, 20 years.
      ceiling: { shards: 4, lives: 6, years: 20, scale: 100 },
      anachronism: { lives: 400, slices: 8 },
      // The strict ledger drift check (test/world-acceptance.test.ts, LEDGER_STRICT): all 40 lives of the ledger probe, a hundred years
      // each. 879 s on one worker locally, so 4 slices of 10 lives keep every job to a few minutes, far under its 20 minute limit.
      ledgerStrict: { lives: 40, slices: 4 },
      oldSaves: { years: 20, reseeds: 8 },
    }
  }
  if (scale === 'smoke') {
    // The shape (shards, slices, the 100x scale) stays, so the whole matrix runs; every size shrinks.
    return {
      fuzz: { shards: 8, seedsPerShard: 1, years: 3, budgetSeconds: 60 },
      balance: { shards: 4, lives: 2, years: 2 },
      ceiling: { shards: 4, lives: 2, years: 2, scale: 100 },
      anachronism: { lives: 16, slices: 8 },
      ledgerStrict: { lives: 4, slices: 4 },
      oldSaves: { years: 3, reseeds: 2 },
    }
  }
  throw new Error(`nightlySizes: the scale must be "full" or "smoke", got "${String(scale)}"`)
}

/** `i/n` of --shard: 1 <= i <= n, and n is the shard count of a job (or the anachronism slices) at these sizes. */
export function parseShard(text, scale = 'full') {
  const m = /^(\d{1,3})\/(\d{1,3})$/.exec(String(text))
  if (!m) throw new Error(`the shard must look like 2/8 (shard i of n), got "${String(text)}"`)
  const i = Number(m[1])
  const n = Number(m[2])
  if (i < 1 || i > n) throw new Error(`the shard ${i}/${n} is out of range: i must be from 1 to n`)
  const s = nightlySizes(scale)
  const counts = [s.fuzz.shards, s.balance.shards, s.ceiling.shards, s.anachronism.slices]
  if (!counts.includes(n)) throw new Error(`no nightly job has ${n} shards (the counts are ${[...new Set(counts)].join(', ')}): the shard count must match the job's matrix`)
  return { i, n }
}

/**
 * The KEY=VALUE pairs the workflow adds to $GITHUB_ENV, in a fixed order. Without a shard: the sizes every job shares. With a
 * shard {i, n}: also, for each sharded job that has an i-th shard, where its run of seeds starts (shard i takes the seeds
 * (i - 1) * per + 1 up), so the shards neither overlap nor leave a gap.
 */
export function sizeEnv(scale, shard) {
  const s = nightlySizes(scale)
  const start = (shards, per) => (shard && shard.i <= shards ? String((shard.i - 1) * per + 1) : null)
  const rows = [
    ['FUZZ_START', start(s.fuzz.shards, s.fuzz.seedsPerShard)],
    ['FUZZ_SEEDS', String(s.fuzz.seedsPerShard)],
    ['FUZZ_YEARS', String(s.fuzz.years)],
    ['FUZZ_BUDGET', String(s.fuzz.budgetSeconds)],
    ['BALANCE_START', start(s.balance.shards, s.balance.lives)],
    ['BALANCE_COUNT', String(s.balance.lives)],
    ['BALANCE_YEARS', String(s.balance.years)],
    ['CEILING_START', start(s.ceiling.shards, s.ceiling.lives)],
    ['CEILING_COUNT', String(s.ceiling.lives)],
    ['CEILING_YEARS', String(s.ceiling.years)],
    ['CEILING_SCALE', String(s.ceiling.scale)],
    ['ANACHRONISM_LIVES', String(s.anachronism.lives)],
    ['ANACHRONISM_SLICES', String(s.anachronism.slices)],
    ['LEDGER_STRICT_LIVES', String(s.ledgerStrict.lives)],
    ['OLD_SAVES_YEARS', String(s.oldSaves.years)],
    ['OLD_SAVES_RESEEDS', String(s.oldSaves.reseeds)],
  ]
  return rows.filter(([, value]) => value !== null)
}

// ---------------------------------------------------------------------------------------------- merging

/** Nearest rank: sorted[ceil(p * n / 100) - 1], clamped to the list. NaN for an empty list. The list is not changed. */
export function percentile(xs, p) {
  const n = xs.length
  if (n === 0) return NaN
  const sorted = [...xs].sort((a, b) => a - b)
  // p is a whole number, so p * n is exact and the division by 100 cannot round a whole rank up.
  return sorted[Math.min(n, Math.max(1, Math.ceil((p * n) / 100))) - 1]
}

/** The names a sample list expands to, in order. */
const EXPANDED = [
  ['p10', 10],
  ['p50', 50],
  ['p90', 90],
  ['p95', 95],
  ['p99', 99],
]

// The same rule as NAME and JOB in test/nightly-metrics.ts (a file is checked again here because it came off a disk).
const JOB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const NAME = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*$/

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const finite = (x) => typeof x === 'number' && Number.isFinite(x)

/** Returns the file when it has the shape test/nightly-metrics.ts writes, else throws with `label` (its path) in the message. */
export function checkMetricsFile(x, label) {
  const bad = (why) => {
    throw new Error(`${label}: not a metrics file: ${why}`)
  }
  if (!isRecord(x)) return bad('it is not an object')
  if (x.v !== 1) return bad(`v is ${JSON.stringify(x.v)}, not 1`)
  if (typeof x.job !== 'string' || !JOB.test(x.job)) return bad('job is not lower-case words joined by hyphens')
  if (!Number.isInteger(x.shard) || x.shard < 0) return bad('shard is not a whole number')
  if (!isRecord(x.metrics)) return bad('metrics is not an object')
  for (const [name, value] of Object.entries(x.metrics)) {
    if (!NAME.test(name)) return bad(`metric name "${name}" is not dotted words that start with a lower-case letter`)
    if (!finite(value)) return bad(`metric ${name} is not a finite number`)
  }
  if (x.samples !== undefined) {
    if (!isRecord(x.samples)) return bad('samples is not an object')
    for (const [name, list] of Object.entries(x.samples)) {
      if (!NAME.test(name)) return bad(`sample name "${name}" is not dotted words that start with a lower-case letter`)
      if (!Array.isArray(list) || !list.every(finite)) return bad(`samples ${name} hold a value that is not a finite number`)
    }
  }
  return x
}

/**
 * One name to one number from the shards' files. .sum is added, .max is the biggest, a samples list is pooled and expanded
 * (n, p10, p50, p90, p95, p99, max; only n for a pool with no sample). Any other name that two files both write is an error: a
 * shard must not guess how to combine it. The names come back in sorted order.
 */
export function mergeMetricFiles(files) {
  const tag = (f) => `${f.job}-${f.shard}`
  const out = new Map()
  const writers = new Map()
  const put = (name, value, f) => {
    if (writers.has(name)) throw new Error(`metric ${name} is written by ${writers.get(name).join(' and ')} and by ${tag(f)}: two files may write a name only when it ends .sum or .max, or is a samples list`)
    writers.set(name, [tag(f)])
    out.set(name, value)
  }
  const pooled = new Map()
  for (const f of files) {
    for (const [name, value] of Object.entries(f.metrics)) {
      if (name.endsWith('.sum') || name.endsWith('.max')) {
        const seen = writers.get(name)
        if (seen) {
          seen.push(tag(f))
          out.set(name, name.endsWith('.sum') ? out.get(name) + value : Math.max(out.get(name), value))
        } else {
          writers.set(name, [tag(f)])
          out.set(name, value)
        }
      } else {
        put(name, value, f)
      }
    }
    for (const [name, list] of Object.entries(f.samples ?? {})) {
      const p = pooled.get(name) ?? { values: [], from: [] }
      p.values.push(...list)
      p.from.push(tag(f))
      pooled.set(name, p)
    }
  }
  for (const [name, p] of pooled) {
    const fake = { job: p.from.join(' and '), shard: 0 }
    const expanded = [[`${name}.n`, p.values.length]]
    if (p.values.length > 0) {
      for (const [word, rank] of EXPANDED) expanded.push([`${name}.${word}`, percentile(p.values, rank)])
      expanded.push([`${name}.max`, percentile(p.values, 100)])
    }
    for (const [key, value] of expanded) {
      if (writers.has(key)) throw new Error(`the samples ${name} expand to ${key}, which ${writers.get(key).join(' and ')} also writes as a metric`)
      writers.set(key, [tag(fake)])
      out.set(key, value)
    }
  }
  return Object.fromEntries([...out].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
}

// ---------------------------------------------------------------------------------------------- the rules

/**
 * What a night is held to, the first matching row winning (`*` in `match` is any run of characters, dots too). A hard cap fails
 * the run; a relative rule only prints a WARN row. The caps are the F.1 budgets and the R2 repetition gate; each `why` says where
 * its number comes from, so the next person to move one knows what it protects.
 */
export const RULES = [
  { match: 'fuzz.failures.sum', kind: 'cap', limit: 0, hard: true, why: 'a fuzz failure is a bug' },
  { match: 'fuzz.nototal.sum', kind: 'cap', limit: 0, hard: true, why: 'a fuzz shard that printed no TOTAL line did not finish, so its failures were never counted' },
  { match: 'balance.*.max', kind: 'cap', limit: 1e13, hard: true, why: 'the richest person ever held about 5e11; this is 20 times that, and a runaway loop is far above it' },
  { match: 'ceiling.life.maxNetWorth.max', kind: 'cap', limit: 1e12, hard: true, why: 'measured 4.1e9 at 100x on 8 founder lives (R1 head); a founder with a hundred times the money must not pass 1e12' },
  { match: 'ceiling.life.growth.max', kind: 'cap', limit: 40, hard: true, why: 'measured 8.2 at 100x and 24.1 at 1x: growth must fall as inputs rise, never climb' },
  { match: 'balance.birth.msYear.p95', kind: 'cap', limit: 160, hard: true, why: 'F.1: a light-life year step is at most 160 ms on desktop (measured p95 25 ms)' },
  { match: 'text.repeatedShare', kind: 'cap', limit: 0.0415, hard: true, why: 'R2 acceptance: the repeated-line share is at most half of the 0.0831 R1 measured (R2-P10)' },
  { match: 'oldsaves.failures.sum', kind: 'cap', limit: 0, hard: true, why: 'an old save that cannot be migrated and played is a lost game' },
  { match: 'anachronism.findings.sum', kind: 'cap', limit: 0, hard: true, why: 'a line that names a thing before it existed is a bug' },
  { match: 'ledger.drift.sum', kind: 'cap', limit: 0, hard: true, why: 'a change of the cash the player holds that nothing booked is a raw writer the books cannot see' },
  { match: 'balance.*.p50', kind: 'rel', limit: 0.25, hard: false, why: 'a drift of a quarter in a median is worth a look' },
  { match: '*', kind: 'rel', limit: 0.5, hard: false, why: 'a move of half in any metric is worth a look' },
]

/** True when `name` matches `pattern`, where * is any run of characters. */
function matches(pattern, name) {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`).test(name)
}

const fmt = (x) => {
  if (x === null || x === undefined) return 'none'
  if (!Number.isFinite(x)) return String(x)
  if (Number.isInteger(x) && Math.abs(x) < 1e12) return String(x)
  return String(Number(x.toPrecision(4)))
}

/**
 * One row per metric of either night, in name order. A hard cap is judged on every night, with or without a previous one; a
 * relative rule needs the previous night, so with none (null) the metric is `new`. A metric missing tonight is `gone`, a warning
 * that fails nothing. A value that is not finite fails, whatever the rules say.
 */
export function diffMetrics(prev, cur, rules = RULES) {
  const names = [...new Set([...Object.keys(cur), ...Object.keys(prev ?? {})])].sort()
  const rows = []
  for (const name of names) {
    const was = prev && Object.prototype.hasOwnProperty.call(prev, name) ? prev[name] : null
    if (!Object.prototype.hasOwnProperty.call(cur, name)) {
      rows.push({ name, prev: was, cur: null, verdict: 'gone', why: 'the metric was not written tonight' })
      continue
    }
    const now = cur[name]
    if (!Number.isFinite(now)) {
      rows.push({ name, prev: was, cur: now, verdict: 'fail', why: `${fmt(now)} is not a finite number` })
      continue
    }
    const rule = rules.find((r) => matches(r.match, name))
    const bad = (why) => ({ name, prev: was, cur: now, verdict: rule.hard ? 'fail' : 'warn', why })
    if (rule && rule.kind === 'cap' && now > rule.limit) {
      rows.push(bad(`${fmt(now)} is over the cap of ${fmt(rule.limit)}: ${rule.why}`))
    } else if (was === null) {
      rows.push({ name, prev: null, cur: now, verdict: 'new', why: prev === null ? 'there is no previous night to compare with' : 'the metric is new tonight' })
    } else if (rule && rule.kind === 'rel') {
      const moved = was === 0 ? (now === 0 ? 0 : Infinity) : Math.abs(now - was) / Math.abs(was)
      if (moved > rule.limit) rows.push(bad(`${fmt(was)} to ${fmt(now)}${moved === Infinity ? '' : `, a move of ${Math.round(moved * 100)}%`}, over ${Math.round(rule.limit * 100)}%: ${rule.why}`))
      else rows.push({ name, prev: was, cur: now, verdict: 'ok', why: '' })
    } else {
      rows.push({ name, prev: was, cur: now, verdict: 'ok', why: '' })
    }
  }
  return rows
}

const LABEL = { fail: 'FAIL', warn: 'WARN', new: 'new', gone: 'gone', ok: 'ok' }

/**
 * Markdown for $GITHUB_STEP_SUMMARY: the failed jobs first, then the count of each verdict, a table of the failures and
 * warnings with their reasons, and every other metric folded away.
 */
export function diffMarkdown(rows, failedJobs) {
  const count = (v) => rows.filter((r) => r.verdict === v).length
  const lines = ['## Nightly metrics', '']
  lines.push(failedJobs.length > 0 ? `**Failed jobs:** ${failedJobs.join(', ')}` : 'All jobs passed.', '')
  const fails = count('fail')
  const warns = count('warn')
  lines.push(`${fails} failed, ${warns} ${warns === 1 ? 'warning' : 'warnings'}, ${count('new')} new, ${count('gone')} gone, ${count('ok')} unchanged.`, '')
  const row = (r) => `| ${LABEL[r.verdict]} | \`${r.name}\` | ${fmt(r.prev)} | ${fmt(r.cur)} | ${r.why} |`
  const short = (r) => `| ${LABEL[r.verdict]} | \`${r.name}\` | ${fmt(r.prev)} | ${fmt(r.cur)} |`
  const problems = rows.filter((r) => r.verdict === 'fail').concat(rows.filter((r) => r.verdict === 'warn'))
  if (problems.length > 0) lines.push('| Verdict | Metric | Before | Now | Why |', '|---|---|---:|---:|---|', ...problems.map(row), '')
  else if (failedJobs.length === 0) lines.push('No hard failure and nothing moved past its limit.', '')
  const rest = rows.filter((r) => r.verdict !== 'fail' && r.verdict !== 'warn')
  if (rest.length > 0) lines.push(`<details><summary>${rest.length} other metrics</summary>`, '', '| Verdict | Metric | Before | Now |', '|---|---|---:|---:|', ...rest.map(short), '', '</details>', '')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------------------------- the fuzzer

const TOTAL_LINE = /^TOTAL: (\d+) seeds, (\d+) life-years, (\d+) actions, (\d+) swept actions, (\d+) menu actions evaluated, (\d+) industries, (\d+)s, (\d+) distinct findings \((\d+) failures\)\s*$/

/**
 * The counts of the last TOTAL line scripts/fuzz-engine.ts prints (a forked run prints one per child, then its own). A log with
 * no such line gives zero counts and fuzz.nototal.sum of 1: the shard did not finish.
 */
export function parseFuzzTotal(log) {
  let found = null
  for (const line of String(log).split('\n')) {
    const m = TOTAL_LINE.exec(line)
    if (m) found = m.slice(1).map(Number)
  }
  const [seeds, years, actions, swept, menu, industries, seconds, findings, failures] = found ?? [0, 0, 0, 0, 0, 0, 0, 0, 0]
  return {
    'fuzz.seeds.sum': seeds,
    'fuzz.years.sum': years,
    'fuzz.actions.sum': actions,
    'fuzz.swept.sum': swept,
    'fuzz.menuActions.sum': menu,
    'fuzz.industries.max': industries,
    'fuzz.seconds.max': seconds,
    'fuzz.findings.sum': findings,
    'fuzz.failures.sum': failures,
    'fuzz.nototal.sum': found ? 0 : 1,
  }
}
