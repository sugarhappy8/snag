#!/usr/bin/env node
// bundle-budget.mjs - the size budget for the initial bundle (G.14, D.11 item 12).
//
//   node scripts/bundle-budget.mjs [--dist dist] [--baseline scripts/bundle-baseline.json] [--update]
//
// Reads dist/index.html, takes the JS and CSS the page loads before any dynamic import (the module script, the
// stylesheets and the modulepreload links), and sums their gzip size at level 9. It prints the initial JS and CSS, the
// delta against scripts/bundle-baseline.json, and every other JS file in dist/assets as a lazy chunk with its gzip size,
// so you can see what moved out of the entry. It exits 1 when the initial bundle grew by more than allowGrowthBytes
// (60,000 bytes: 60 KB means 60,000, and a change to the limit goes through the lead).
//
//   --update   rewrites initialGzBytes in the baseline from the build in --dist (measuredAt and allowGrowthBytes stay).
//
// Capturing the baseline, once per release: build the base release (v4.0.3, never the branch with R1 code in it) with
// "npx vite build", run this script with --update there, and commit scripts/bundle-baseline.json. A baseline of 0 means
// "not captured yet" and fails the check.
//
// Exit codes: 0 ok, 1 over budget or a problem (no build, a bad baseline), 2 bad usage.
//
// Dependency-free Node ESM (Node builtins only). The tests import the two helpers; the CLI runs only when invoked directly.
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '')
const DEFAULT_DIST = join(ROOT, 'dist')
const DEFAULT_BASELINE = join(ROOT, 'scripts', 'bundle-baseline.json')
const DEFAULT_ALLOW_GROWTH_BYTES = 60_000

const USAGE = 'usage: node scripts/bundle-budget.mjs [--dist dist] [--baseline scripts/bundle-baseline.json] [--update]'

class Failure extends Error {}
class UsageError extends Error {}

const num = (n) => n.toLocaleString('en-US')
const signed = (n) => `${n < 0 ? '-' : '+'}${num(Math.abs(n))}`

/** The attributes of one tag, lower-cased by name, the first of a repeated name winning. */
function readAttributes(source) {
  const attrs = new Map()
  for (const m of source.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = m[1].toLowerCase()
    if (!attrs.has(name)) attrs.set(name, m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

/** A path inside dist for a URL in index.html, or null for a remote URL or an empty one. */
function localPath(url) {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) return null
  const path = url.split(/[?#]/)[0].replace(/^(?:\.?\/)+/, '')
  return path === '' ? null : path
}

/** The paths in index.html that load before any dynamic import: scripts, stylesheets and modulepreload links. */
export function initialAssets(html) {
  const found = []
  const text = String(html).replace(/<!--[\s\S]*?-->/g, '')
  for (const tag of text.matchAll(/<(script|link)\b([^>]*)>/gi)) {
    const attrs = readAttributes(tag[2])
    const isScript = tag[1].toLowerCase() === 'script'
    if (!isScript) {
      const rel = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/)
      if (!rel.includes('stylesheet') && !rel.includes('modulepreload')) continue
    }
    const path = localPath((isScript ? attrs.get('src') : attrs.get('href')) ?? '')
    if (path !== null && !found.includes(path)) found.push(path)
  }
  return found
}

/** delta is the growth over the baseline; limit is the most growth allowed. A delta that is not a number never passes. */
export function checkBudget({ initialGzBytes, baselineGzBytes, allowGrowthBytes }) {
  const delta = initialGzBytes - baselineGzBytes
  return { ok: delta <= allowGrowthBytes, delta, limit: allowGrowthBytes }
}

const gzipBytes = (file) => gzipSync(readFileSync(file), { level: 9 }).length

/** Every file under dir, as posix paths relative to base. */
function listFiles(dir, base) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full, base))
    else out.push(relative(base, full).split(sep).join('/'))
  }
  return out
}

/** What the build in dist weighs: the initial files by kind, and the other JS files in dist/assets. */
function measure(dist) {
  const indexFile = join(dist, 'index.html')
  if (!existsSync(indexFile)) throw new Failure(`${indexFile} is missing. Run "npx vite build" first.`)
  const initial = initialAssets(readFileSync(indexFile, 'utf8'))
  const js = { bytes: 0, files: 0 }
  const css = { bytes: 0, files: 0 }
  for (const asset of initial) {
    const file = join(dist, asset)
    if (!existsSync(file)) throw new Failure(`index.html loads ${asset}, which is not in ${dist}.`)
    const kind = /\.css$/i.test(asset) ? css : js
    kind.bytes += gzipBytes(file)
    kind.files += 1
  }
  const lazy = listFiles(join(dist, 'assets'), dist)
    .filter((path) => /\.m?js$/i.test(path) && !initial.includes(path))
    .map((path) => ({ path, bytes: gzipBytes(join(dist, path)) }))
    .sort((a, b) => b.bytes - a.bytes || (a.path < b.path ? -1 : 1))
  return { js, css, total: js.bytes + css.bytes, lazy }
}

/** Reads and checks a baseline file; throws a Failure that says what is wrong. */
function readBaseline(file) {
  let data
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Failure(`The baseline ${file} can't be read: ${e instanceof Error ? e.message : String(e)}`)
  }
  const wholeBytes = (v) => Number.isSafeInteger(v) && v >= 0
  if (
    data === null ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    typeof data.measuredAt !== 'string' ||
    !wholeBytes(data.initialGzBytes) ||
    !wholeBytes(data.allowGrowthBytes)
  ) {
    throw new Failure(`The baseline ${file} must be { "measuredAt": <text>, "initialGzBytes": <whole bytes>, "allowGrowthBytes": <whole bytes> }.`)
  }
  return data
}

function parseArgs(argv) {
  const opts = { dist: DEFAULT_DIST, baseline: DEFAULT_BASELINE, update: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--update') opts.update = true
    else if (arg === '--dist' || arg === '--baseline') {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a path.`)
      opts[arg.slice(2)] = resolve(value)
    } else throw new UsageError(`Unknown argument ${arg}.`)
  }
  return opts
}

function report(out, m, baseline) {
  const count = (k) => `${k.files} ${k.files === 1 ? 'file' : 'files'}`
  const rows = [
    ['Initial JS', num(m.js.bytes), count(m.js)],
    ['Initial CSS', num(m.css.bytes), count(m.css)],
    ['Initial total', num(m.total), ''],
  ]
  if (baseline) {
    const c = checkBudget({ initialGzBytes: m.total, baselineGzBytes: baseline.initialGzBytes, allowGrowthBytes: baseline.allowGrowthBytes })
    rows.push(['Baseline', num(baseline.initialGzBytes), baseline.measuredAt])
    rows.push(['Delta', signed(c.delta), `limit ${signed(c.limit)}  ${c.ok ? 'ok' : 'OVER'}`])
  }
  const width = Math.max(...rows.map((r) => r[1].length))
  out.write('Initial bundle (loaded before any dynamic import), gzip level 9, in bytes\n')
  for (const [label, value, note] of rows) out.write(`  ${label.padEnd(14)}${value.padStart(width)}  ${note}`.trimEnd() + '\n')
  const lazyTotal = m.lazy.reduce((a, l) => a + l.bytes, 0)
  out.write(`\nLazy chunks (loaded on demand): ${m.lazy.length} ${m.lazy.length === 1 ? 'file' : 'files'}, ${num(lazyTotal)} bytes\n`)
  const lazyWidth = Math.max(0, ...m.lazy.map((l) => num(l.bytes).length))
  for (const l of m.lazy) out.write(`  ${num(l.bytes).padStart(lazyWidth)}  ${l.path}\n`)
}

function run(argv, io) {
  try {
    const opts = parseArgs(argv)
    const m = measure(opts.dist)
    if (opts.update) {
      let base = { measuredAt: 'unknown', initialGzBytes: 0, allowGrowthBytes: DEFAULT_ALLOW_GROWTH_BYTES }
      if (existsSync(opts.baseline)) base = readBaseline(opts.baseline)
      const next = { ...base, initialGzBytes: m.total }
      writeFileSync(opts.baseline, JSON.stringify(next, null, 2) + '\n')
      report(io.out, m, next)
      io.out.write(`\nBaseline updated: ${num(m.total)} bytes. measuredAt stays "${next.measuredAt}"; edit it if this build is from another version.\n`)
      return 0
    }
    if (!existsSync(opts.baseline)) throw new Failure(`The baseline ${opts.baseline} is missing. Build the base release and run this script with --update there.`)
    const baseline = readBaseline(opts.baseline)
    if (baseline.initialGzBytes === 0) {
      report(io.out, m, null)
      throw new Failure(
        `The baseline in ${opts.baseline} isn't captured yet (initialGzBytes is 0). ` +
          'Build the base release (v4.0.3, not the branch with R1 code), run node scripts/bundle-budget.mjs --update there, and commit the file.',
      )
    }
    report(io.out, m, baseline)
    const c = checkBudget({ initialGzBytes: m.total, baselineGzBytes: baseline.initialGzBytes, allowGrowthBytes: baseline.allowGrowthBytes })
    if (!c.ok) {
      io.err.write(
        `Over budget: the initial bundle grew by ${num(c.delta)} bytes, ${num(c.delta - c.limit)} more than the ${num(c.limit)} allowed. ` +
          'Move code behind a lazy gate, or ask the lead to change the limit.\n',
      )
      return 1
    }
    return 0
  } catch (e) {
    if (e instanceof UsageError) {
      io.err.write(`${e.message}\n${USAGE}\n`)
      return 2
    }
    io.err.write(`${e instanceof Failure ? e.message : e instanceof Error ? e.stack : String(e)}\n`)
    return 1
  }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) process.exitCode = run(process.argv.slice(2), { out: process.stdout, err: process.stderr })
