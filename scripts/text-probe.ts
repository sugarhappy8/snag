// The 13-life repeat probe as a standalone node script (R2-P7, E.T3 a). The kit is test/text-probe.ts; this is only the entry.
// Run it by hand while converting lines, to see which lines repeat most (the worklist of R2-P9 and R2-P10).
//
//   node_modules/.bin/esbuild scripts/text-probe.ts --bundle --platform=node --format=esm --outfile=/tmp/text-probe.mjs
//   node /tmp/text-probe.mjs [--lives 13] [--top 40] [--json out.json] [--quiet]
//
// Run it from the repo root. It plays the first `--lives` probe lives (seed 101 on, to age 85, every second life rich), then
// prints the pooled repeated-line share, the ratio to R1's record (test/fixtures/text-baseline-13.json), each life's share and
// the `--top` heaviest families as `extra total lives text`. `--json` also writes the numbers and the whole family list.
// It never writes the baseline: that file was recorded once, on v4.1.1, and only ever read.
import { writeFileSync } from 'node:fs'
import { formatProbe, playProbeLife, probeLives, ratioToR1, summarize } from '../test/text-probe'

const args = process.argv.slice(2)

function count(name: string, def: number): number {
  const i = args.indexOf(name)
  if (i < 0) return def
  const n = Number(args[i + 1])
  if (!Number.isInteger(n) || n < 0) usage(`${name} wants a whole number, got "${args[i + 1] ?? ''}"`)
  return n
}

function text(name: string): string | null {
  const i = args.indexOf(name)
  if (i < 0) return null
  const v = args[i + 1]
  if (v === undefined || v.startsWith('--')) usage(`${name} wants a value`)
  return v
}

function usage(why: string): never {
  console.error(`text-probe: ${why}\nusage: node text-probe.mjs [--lives 13] [--top 40] [--json out.json] [--quiet]`)
  process.exit(2)
}

const lives = count('--lives', 13)
const top = count('--top', 40)
const json = text('--json')
if (lives < 1) usage('--lives must be at least 1')
// Engine code logs warnings for some recoverable situations; keep the output readable.
if (args.includes('--quiet')) console.warn = () => {}

const traces = probeLives(lives).map((spec, i) => {
  const t0 = Date.now()
  const { trace } = playProbeLife(spec)
  console.error(`life ${i + 1}/${lives} (seed ${spec.seed}, born ${spec.birthYear}${spec.rich ? ', rich' : ''}): ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  return trace
})

const result = summarize(traces)
console.log(formatProbe(result, top))
if (json) {
  writeFileSync(json, `${JSON.stringify({ ratioToR1: ratioToR1(result), repeated: result.repeated, merged: result.merged, lives: result.lives, families: result.families }, null, 2)}\n`)
  console.error(`wrote ${json}`)
}
