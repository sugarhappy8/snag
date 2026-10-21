// ci: fast
// R1-A9 (G.14, D.11 item 12): the bundle budget. scripts/bundle-budget.mjs sums the gzip size of what index.html loads
// before any dynamic import, compares it with scripts/bundle-baseline.json and fails when it grew by more than the
// allowance (60,000 bytes). No build is needed here: the helpers are pure, and the CLI runs against a small fake dist
// folder under os.tmpdir(). Whether the chart kit and the palette really sit in their own files is read off the lazy
// list the script prints on a real build (the PR report), and test/lazy-zones.test.ts guards the imports that make it so.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import { checkBudget, initialAssets } from '../scripts/bundle-budget.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts', 'bundle-budget.mjs')
const LIMIT = 60_000

const scratch: string[] = []
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

/** Bytes that gzip cannot shrink (a small seeded generator, so every run builds the same files). */
function noise(seed: number, length: number): Buffer {
  const out = Buffer.alloc(length)
  let s = seed >>> 0
  for (let i = 0; i < length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    out[i] = s >>> 24
  }
  return out
}

/** Text that gzip shrinks a lot, and whose size differs between level 6 and level 9. */
function words(seed: number, count: number): Buffer {
  const dictionary = Array.from({ length: 400 }, (_, i) => `word${(i * 7919) % 1000}x${i % 13}`)
  let s = seed >>> 0
  const parts: string[] = []
  for (let i = 0; i < count; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    parts.push(dictionary[(s >>> 16) % dictionary.length])
  }
  return Buffer.from(parts.join(' '))
}

const gz = (buf: Buffer): number => gzipSync(buf, { level: 9 }).length
const fmt = (n: number): string => n.toLocaleString('en-US')

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <title>AnotherLife</title>
    <script type="module" crossorigin src="./assets/index-AAA111.js"></script>
    <link rel="modulepreload" crossorigin href="./assets/react-BBB222.js">
    <link rel="modulepreload" crossorigin href="./assets/game-DDD444.js">
    <link rel="stylesheet" crossorigin href="./assets/index-CCC333.css">
  </head>
  <body><div id="root"></div></body>
</html>
`

interface Fake {
  dist: string
  baseline: string
  /** gzip level 9 bytes of the initial JS and CSS together. */
  measured: number
  initialJs: number
  initialCss: number
  lazy: Record<string, number>
}

/** A dist folder shaped like a Vite build: four initial assets, two lazy chunks, one picture, one source map. */
function fakeDist(): Fake {
  const root = mkdtempSync(join(tmpdir(), 'bundle-budget-'))
  scratch.push(root)
  const dist = join(root, 'dist')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  const files: Record<string, Buffer> = {
    'index.html': Buffer.from(INDEX_HTML),
    'favicon.svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    'assets/index-AAA111.js': Buffer.concat([words(1, 60_000), noise(2, 20_000)]),
    'assets/react-BBB222.js': noise(3, 30_000),
    'assets/game-DDD444.js': noise(4, 25_000),
    'assets/index-CCC333.css': words(5, 3_000),
    'assets/ChartView-EEE555.js': noise(6, 12_000),
    'assets/Palette-FFF666.js': noise(7, 9_000),
    'assets/picture-GGG777.svg': noise(8, 4_000),
    'assets/index-AAA111.js.map': noise(9, 5_000),
  }
  for (const [rel, buf] of Object.entries(files)) writeFileSync(join(dist, rel), buf)
  const initialJs = gz(files['assets/index-AAA111.js']) + gz(files['assets/react-BBB222.js']) + gz(files['assets/game-DDD444.js'])
  const initialCss = gz(files['assets/index-CCC333.css'])
  return {
    dist,
    baseline: join(root, 'baseline.json'),
    measured: initialJs + initialCss,
    initialJs,
    initialCss,
    lazy: { 'assets/ChartView-EEE555.js': gz(files['assets/ChartView-EEE555.js']), 'assets/Palette-FFF666.js': gz(files['assets/Palette-FFF666.js']) },
  }
}

function writeBaseline(file: string, initialGzBytes: number, extra: Record<string, unknown> = {}): void {
  writeFileSync(file, JSON.stringify({ measuredAt: 'v4.0.3', initialGzBytes, allowGrowthBytes: LIMIT, ...extra }, null, 2) + '\n')
}

function cli(args: string[]): { code: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

describe('initialAssets', () => {
  it('returns the four initial assets of a Vite index.html, without the leading ./', () => {
    expect(initialAssets(INDEX_HTML)).toEqual([
      'assets/index-AAA111.js',
      'assets/react-BBB222.js',
      'assets/game-DDD444.js',
      'assets/index-CCC333.css',
    ])
  })

  it('has the fixture shape the CLI tests rely on (the icon is not an asset)', () => {
    expect(INDEX_HTML).toContain('rel="icon"')
    expect(initialAssets(INDEX_HTML)).not.toContain('favicon.svg')
  })

  it('keeps document order, drops repeats, query strings, hashes and a leading slash', () => {
    const html = `<head>
      <link rel="stylesheet" href="/assets/a.css?v=3">
      <script type="module" src='/assets/b.js#x'></script>
      <link rel="modulepreload" href=./assets/c.js>
      <link rel="stylesheet" href="./assets/a.css">
      <link rel="modulepreload" href="assets/b.js">
    </head>`
    expect(initialAssets(html)).toEqual(['assets/a.css', 'assets/b.js', 'assets/c.js'])
  })

  it('reads a rel with several words, in any case, and a self-closing tag', () => {
    const html = '<LINK REL="Stylesheet alternate" HREF="./assets/x.css" />\n<link rel="MODULEPRELOAD" href="./assets/y.js"/>'
    expect(initialAssets(html)).toEqual(['assets/x.css', 'assets/y.js'])
  })

  it('leaves out remote URLs, inline scripts, comments and links that load nothing up front', () => {
    const html = `<head>
      <!-- <script type="module" src="./assets/commented.js"></script> -->
      <script>window.boot = 1</script>
      <script src="https://cdn.example.com/lib.js"></script>
      <script src="//cdn.example.com/lib2.js"></script>
      <link rel="stylesheet" href="https://fonts.example.com/css">
      <link rel="icon" href="./favicon.svg">
      <link rel="preload" href="./assets/font.woff2" as="font">
      <link rel="prefetch" href="./assets/later.js">
      <link rel="manifest" href="./manifest.json">
      <link rel="stylesheet">
      <script type="module" src="./assets/real.js"></script>
    </head>`
    expect(initialAssets(html)).toEqual(['assets/real.js'])
  })

  it('answers an empty list for a page with no assets', () => {
    expect(initialAssets('')).toEqual([])
    expect(initialAssets('<html><body>hello</body></html>')).toEqual([])
  })
})

describe('checkBudget', () => {
  const base = 2_500_000

  it('passes at exactly the allowance', () => {
    expect(checkBudget({ initialGzBytes: base + LIMIT, baselineGzBytes: base, allowGrowthBytes: LIMIT })).toEqual({ ok: true, delta: LIMIT, limit: LIMIT })
  })

  it('fails one byte over the allowance', () => {
    expect(checkBudget({ initialGzBytes: base + LIMIT + 1, baselineGzBytes: base, allowGrowthBytes: LIMIT })).toEqual({ ok: false, delta: LIMIT + 1, limit: LIMIT })
  })

  it('passes under the allowance and when nothing changed', () => {
    expect(checkBudget({ initialGzBytes: base + LIMIT - 1, baselineGzBytes: base, allowGrowthBytes: LIMIT })).toEqual({ ok: true, delta: LIMIT - 1, limit: LIMIT })
    expect(checkBudget({ initialGzBytes: base, baselineGzBytes: base, allowGrowthBytes: LIMIT })).toEqual({ ok: true, delta: 0, limit: LIMIT })
  })

  it('passes a bundle that got smaller, with a negative delta', () => {
    expect(checkBudget({ initialGzBytes: base - 120_000, baselineGzBytes: base, allowGrowthBytes: LIMIT })).toEqual({ ok: true, delta: -120_000, limit: LIMIT })
  })

  it('takes a zero allowance literally', () => {
    expect(checkBudget({ initialGzBytes: base + 1, baselineGzBytes: base, allowGrowthBytes: 0 }).ok).toBe(false)
    expect(checkBudget({ initialGzBytes: base, baselineGzBytes: base, allowGrowthBytes: 0 }).ok).toBe(true)
  })

  it('never passes a number that is not a number', () => {
    expect(checkBudget({ initialGzBytes: Number.NaN, baselineGzBytes: base, allowGrowthBytes: LIMIT }).ok).toBe(false)
  })
})

describe('the CLI', () => {
  it('uses a fixture where gzip level 9 and the default level disagree, so the level is pinned', () => {
    const entry = words(1, 60_000)
    expect(gz(entry)).not.toBe(gzipSync(entry).length)
    expect(fakeDist().measured).toBeGreaterThan(LIMIT + 1_000)
  })

  it('exits 0 under budget and prints the initial sizes, the delta and every other JS file as a lazy chunk', () => {
    const f = fakeDist()
    writeBaseline(f.baseline, f.measured - 1_500)
    const r = cli(['--dist', f.dist, '--baseline', f.baseline])
    expect(r.code).toBe(0)
    expect(r.out).toContain(fmt(f.initialJs))
    expect(r.out).toContain(fmt(f.initialCss))
    expect(r.out).toContain(fmt(f.measured))
    expect(r.out).toContain('+1,500')
    expect(r.out).toContain('v4.0.3')
    expect(r.out).toMatch(/lazy chunk/i)
    for (const [name, size] of Object.entries(f.lazy)) {
      const line = r.out.split('\n').find((l) => l.includes(name))
      expect(line, name).toBeDefined()
      expect(line).toContain(fmt(size))
    }
    // The initial files, the picture and the source map are not lazy chunks.
    for (const name of ['assets/index-AAA111.js', 'assets/react-BBB222.js', 'assets/game-DDD444.js', 'picture-GGG777', '.js.map']) {
      const lazyPart = r.out.slice(r.out.search(/lazy chunk/i))
      expect(lazyPart, name).not.toContain(name)
    }
  })

  it('lists the biggest lazy chunk first', () => {
    const f = fakeDist()
    writeBaseline(f.baseline, f.measured)
    const out = cli(['--dist', f.dist, '--baseline', f.baseline]).out
    expect(out.indexOf('ChartView-EEE555.js')).toBeGreaterThan(-1)
    expect(out.indexOf('ChartView-EEE555.js')).toBeLessThan(out.indexOf('Palette-FFF666.js'))
  })

  it('passes at exactly the allowance and fails one byte over', () => {
    const f = fakeDist()
    writeBaseline(f.baseline, f.measured - LIMIT)
    const atLimit = cli(['--dist', f.dist, '--baseline', f.baseline])
    expect(atLimit.code).toBe(0)
    expect(atLimit.out).toContain('+60,000')

    writeBaseline(f.baseline, f.measured - LIMIT - 1)
    const over = cli(['--dist', f.dist, '--baseline', f.baseline])
    expect(over.code).toBe(1)
    expect(over.out + over.err).toContain('+60,001')
    expect(over.out + over.err).toMatch(/over budget/i)
  })

  it('passes a build that shrank', () => {
    const f = fakeDist()
    writeBaseline(f.baseline, f.measured + 25_000)
    const r = cli(['--dist', f.dist, '--baseline', f.baseline])
    expect(r.code).toBe(0)
    expect(r.out).toContain('-25,000')
  })

  it('reads the allowance from the baseline file, not from a constant', () => {
    const f = fakeDist()
    writeBaseline(f.baseline, f.measured - 2_000, { allowGrowthBytes: 1_999 })
    expect(cli(['--dist', f.dist, '--baseline', f.baseline]).code).toBe(1)
    writeBaseline(f.baseline, f.measured - 2_000, { allowGrowthBytes: 2_000 })
    expect(cli(['--dist', f.dist, '--baseline', f.baseline]).code).toBe(0)
  })

  it('--update writes the measured size, keeps the label and the allowance, then the check is green', () => {
    const f = fakeDist()
    writeBaseline(f.baseline, 1_234, { measuredAt: 'v4.0.2' })
    const up = cli(['--dist', f.dist, '--baseline', f.baseline, '--update'])
    expect(up.code).toBe(0)
    const text = readFileSync(f.baseline, 'utf8')
    expect(text).toBe(JSON.stringify({ measuredAt: 'v4.0.2', initialGzBytes: f.measured, allowGrowthBytes: LIMIT }, null, 2) + '\n')
    const again = cli(['--dist', f.dist, '--baseline', f.baseline])
    expect(again.code).toBe(0)
    expect(again.out).toMatch(/Delta\s+\+0\b/)
  })

  it('--update makes a missing baseline file, with the standard allowance', () => {
    const f = fakeDist()
    expect(existsSync(f.baseline)).toBe(false)
    expect(cli(['--dist', f.dist, '--baseline', f.baseline, '--update']).code).toBe(0)
    const written = JSON.parse(readFileSync(f.baseline, 'utf8')) as Record<string, unknown>
    expect(written.initialGzBytes).toBe(f.measured)
    expect(written.allowGrowthBytes).toBe(LIMIT)
    expect(typeof written.measuredAt).toBe('string')
  })

  it('--update will not overwrite a baseline it cannot read', () => {
    const f = fakeDist()
    writeFileSync(f.baseline, '{ not json')
    const r = cli(['--dist', f.dist, '--baseline', f.baseline, '--update'])
    expect(r.code).toBe(1)
    expect(readFileSync(f.baseline, 'utf8')).toBe('{ not json')
  })

  it('refuses a baseline of 0 (not captured yet) and says how to capture it, without calling it a budget miss', () => {
    const f = fakeDist()
    writeBaseline(f.baseline, 0, { measuredAt: 'not captured' })
    const r = cli(['--dist', f.dist, '--baseline', f.baseline])
    expect(r.code).toBe(1)
    expect(r.err).toContain('--update')
    expect(r.err).toMatch(/baseline/i)
    expect(r.out + r.err).not.toMatch(/over budget/i)
    // --update is the way out of it.
    expect(cli(['--dist', f.dist, '--baseline', f.baseline, '--update']).code).toBe(0)
    expect(cli(['--dist', f.dist, '--baseline', f.baseline]).code).toBe(0)
  })

  it('fails with a message when there is no build', () => {
    const f = fakeDist()
    writeBaseline(f.baseline, f.measured)
    const empty = join(dirname(f.dist), 'empty')
    mkdirSync(empty)
    const r = cli(['--dist', empty, '--baseline', f.baseline])
    expect(r.code).toBe(1)
    expect(r.err).toContain('index.html')
    expect(r.err).toContain('vite build')
  })

  it('fails when index.html names a file that is not in dist, instead of measuring a smaller bundle', () => {
    const f = fakeDist()
    writeBaseline(f.baseline, f.measured)
    rmSync(join(f.dist, 'assets', 'react-BBB222.js'))
    const r = cli(['--dist', f.dist, '--baseline', f.baseline])
    expect(r.code).toBe(1)
    expect(r.err).toContain('assets/react-BBB222.js')
  })

  it('fails when the baseline is missing or the wrong shape', () => {
    const f = fakeDist()
    const missing = cli(['--dist', f.dist, '--baseline', f.baseline])
    expect(missing.code).toBe(1)
    expect(missing.err).toContain('baseline')
    for (const body of ['[]', '{}', '{"measuredAt":"v4.0.3","initialGzBytes":"2650000","allowGrowthBytes":60000}', '{"measuredAt":"v4.0.3","initialGzBytes":2650000,"allowGrowthBytes":-1}', '{"measuredAt":"v4.0.3","initialGzBytes":1.5,"allowGrowthBytes":60000}']) {
      writeFileSync(f.baseline, body)
      expect(cli(['--dist', f.dist, '--baseline', f.baseline]).code, body).toBe(1)
    }
  })

  it('answers an unknown flag, or a flag with no value, with usage and exit code 2', () => {
    const f = fakeDist()
    writeBaseline(f.baseline, f.measured)
    const unknown = cli(['--dist', f.dist, '--baseline', f.baseline, '--loose'])
    expect(unknown.code).toBe(2)
    expect(unknown.err).toContain('--dist')
    expect(cli(['--dist']).code).toBe(2)
    expect(cli(['stray']).code).toBe(2)
  })

  it('defaults to dist and scripts/bundle-baseline.json in the repo, wherever it is run from', () => {
    // The repo has no dist folder in a test run, so the default dist is missing; the message names that default path.
    if (existsSync(join(ROOT, 'dist', 'index.html'))) return
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: tmpdir(), encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain(join(ROOT, 'dist'))
  })
})

describe('the committed baseline and the wiring', () => {
  const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

  it('scripts/bundle-baseline.json has the agreed shape and the 60,000 byte allowance', () => {
    const b = JSON.parse(read('scripts/bundle-baseline.json')) as Record<string, unknown>
    expect(Object.keys(b)).toEqual(['measuredAt', 'initialGzBytes', 'allowGrowthBytes'])
    expect(typeof b.measuredAt).toBe('string')
    expect((b.measuredAt as string).length).toBeGreaterThan(0)
    expect(Number.isSafeInteger(b.initialGzBytes)).toBe(true)
    expect(b.initialGzBytes as number).toBeGreaterThanOrEqual(0)
    // 60 KB means 60,000 bytes. A change to the limit goes through the lead, so this number is pinned.
    expect(b.allowGrowthBytes).toBe(60_000)
    expect(read('scripts/bundle-baseline.json').endsWith('}\n')).toBe(true)
  })

  it('package.json has the size script', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
    expect(pkg.scripts.size).toBe('node scripts/bundle-budget.mjs')
  })

  it('the checks job runs the budget directly after vite build, once, and in no other job', () => {
    const yml = read('.github/workflows/ci.yml')
    const lines = yml.split('\n')
    const build = lines.findIndex((l) => l.trim() === '- run: npx vite build')
    expect(build).toBeGreaterThan(0)
    expect(lines[build + 1].trim()).toBe('- run: node scripts/bundle-budget.mjs')
    expect(lines[build + 1].match(/^\s*/)?.[0]).toBe(lines[build].match(/^\s*/)?.[0])
    expect(lines.filter((l) => l.includes('bundle-budget')).length).toBe(1)
    const checks = yml.slice(yml.indexOf('\n  checks:\n'), yml.indexOf('\n  fast:\n'))
    expect(checks).toContain('node scripts/bundle-budget.mjs')
  })

  it('has no em-dash or en-dash in the script, its types, the baseline or this test', () => {
    for (const rel of ['scripts/bundle-budget.mjs', 'scripts/bundle-budget.d.mts', 'scripts/bundle-baseline.json', 'test/bundle-budget.test.ts']) {
      expect(read(rel), rel).not.toMatch(new RegExp('[\\u2013\\u2014]'))
    }
  })
})
