#!/usr/bin/env node
// r1-screenshots.mjs - photographs the Annual Report book on a phone, light and dark (R1-C16, the exit gate "the owner opens
// the Annual Report on a phone-width window"). It needs Playwright and a Chromium that the lead installed beforehand; it
// downloads nothing and it adds nothing to the repo.
//
//   node scripts/r1-screenshots.mjs --playwright <dir> [--chromium <path>] [--url http://localhost:5173/ | --serve]
//        [--out <dir>] [--seed 7] [--years 30] [--companies 3] [--width 390 --height 844] [--narrow 360]
//
// --playwright  the folder that has node_modules/playwright (or playwright-core), or the package folder itself.
// --chromium    a Chromium binary (default: the PW_CHROMIUM environment variable, then Playwright's own).
// --url         a running dev server or preview. --serve starts node_modules/.bin/vite on a free port instead and stops it
//               at the end. Both need a port to bind, so a sandboxed shell has to run this script outside the sandbox.
// --seed, --years, --companies  the life the state maker plays (scripts/r1-screenshot-state.ts).
//
// How it works. No production code path can open a chosen state, but localStorage can: saveGame stores exactly
// JSON.stringify(state) under 'anotherlife.save.v1', and the Home screen's "Continue Life" runs processQueue, so a queued
// Annual Report is the first thing on screen. The state is made by the real engine (esbuild bundles the state maker and node
// runs it, as scripts/save-size.ts does). The page opens with ?flags=annualReport2,chartKit because the Year-End strip and
// the chart rows read the flags in the browser; the book itself is driven by data.chart in the saved queue.
//
// For each of light and dark it opens a 390 x 844 phone (scale 2), taps "Continue Life", waits for the book and photographs
// every tab: r1-<scheme>-<tab>.png is the top of the tab, and a tab taller than one screen gets r1-<scheme>-<tab>-2.png and
// so on as the panel is scrolled down in steps. A second pass at --narrow (360 x 740) photographs P&L and Cash in light.
// One JSON line per photo reports the checks, then a summary line:
//   - no horizontal overflow on the page or in the popup's scroller
//   - the tab row scrolls sideways when it must (overflow-x is auto or scroll)
//   - every tab button is at least 44 px tall
//   - no console error, no page error, and no request that leaves the page's own origin
// Exit codes: 0 all checks passed, 1 a check failed or a run failed, 2 bad usage. The PNG paths are printed last.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '')
const STATE_ENTRY = join(ROOT, 'scripts', 'r1-screenshot-state.ts')
const SAVE_KEY = 'anotherlife.save.v1'
const FLAGS_QUERY = '?flags=annualReport2,chartKit'
const NARROW_HEIGHT = 740
const SCALE = 2
const MIN_TARGET = 44
const MAX_STEPS = 6
const SETTLE_MS = 250
const STEP_MS = 150
const WAIT_MS = 30_000
const SERVE_WAIT_MS = 60_000

/** The tabs of the book, by what a screen reader (and so Playwright's role query) calls them. */
const TABS = [
  { id: 'summary', name: 'Summary' },
  { id: 'pl', name: 'Profit and loss' },
  { id: 'cash', name: 'Cash' },
  { id: 'market', name: 'Market' },
  { id: 'plan', name: 'Plan' },
]
const NARROW_TABS = TABS.filter((t) => t.id === 'pl' || t.id === 'cash')

export const DEFAULTS = {
  url: 'http://localhost:5173/',
  out: join(tmpdir(), 'r1-screenshots'),
  seed: 7,
  years: 30,
  companies: 3,
  width: 390,
  height: 844,
  narrow: 360,
}

export const USAGE = `usage: node scripts/r1-screenshots.mjs --playwright <dir> [--chromium <path>] [--url <url> | --serve] [--out <dir>]
         [--seed 7] [--years 30] [--companies 3] [--width 390] [--height 844] [--narrow 360]`

export class UsageError extends Error {}

// ---------------------------------------------------------------------------------------------- arguments

function wholeNumber(values, name, fallback, min, max) {
  const raw = values[name]
  if (raw === undefined) return fallback
  const n = /^\d{1,7}$/.test(raw) ? Number(raw) : Number.NaN
  if (!(n >= min && n <= max)) throw new UsageError(`--${name} needs a whole number from ${min} to ${max}`)
  return n
}

/**
 * The options as a plain object, with the defaults filled in; throws a UsageError for anything it cannot use. `env` is where
 * PW_CHROMIUM is read from.
 */
export function parseOptions(argv, env = process.env) {
  let values
  try {
    const str = { type: 'string' }
    values = parseArgs({
      args: [...argv],
      options: { playwright: str, chromium: str, url: str, serve: { type: 'boolean' }, out: str, seed: str, years: str, companies: str, width: str, height: str, narrow: str },
      allowPositionals: false,
      strict: true,
    }).values
  } catch (err) {
    throw new UsageError(err.message)
  }
  if (!values.playwright) throw new UsageError('--playwright is required (the folder that has node_modules/playwright)')
  if (values.serve && values.url !== undefined) throw new UsageError('use --serve or --url, not both')
  let url = DEFAULTS.url
  if (values.url !== undefined) {
    try {
      const parsed = new URL(values.url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('not http')
      url = values.url
    } catch {
      throw new UsageError('--url needs an http or https address')
    }
  }
  const chromium = values.chromium || env.PW_CHROMIUM || ''
  return {
    playwright: resolve(values.playwright),
    chromium: chromium ? resolve(chromium) : null,
    url,
    serve: values.serve === true,
    out: values.out ? resolve(values.out) : DEFAULTS.out,
    seed: wholeNumber(values, 'seed', DEFAULTS.seed, 0, 1_000_000),
    years: wholeNumber(values, 'years', DEFAULTS.years, 1, 200),
    companies: wholeNumber(values, 'companies', DEFAULTS.companies, 1, 12),
    width: wholeNumber(values, 'width', DEFAULTS.width, 240, 2000),
    height: wholeNumber(values, 'height', DEFAULTS.height, 400, 4000),
    narrow: wholeNumber(values, 'narrow', DEFAULTS.narrow, 240, 2000),
  }
}

// ---------------------------------------------------------------------------------------------- small pure helpers

/**
 * Where to scroll a panel of `scrollHeight` in a window of `clientHeight`: the top, then steps of a little less than a
 * screen so each photo overlaps the one before, ending at the bottom. At most `cap` positions (spread evenly when the panel is
 * longer); [0] when it fits or the measurement is nonsense.
 */
export function scrollPositions(scrollHeight, clientHeight, cap = MAX_STEPS) {
  if (!Number.isFinite(scrollHeight) || !Number.isFinite(clientHeight) || clientHeight <= 0) return [0]
  const max = Math.floor(scrollHeight - clientHeight)
  if (!(max > 0)) return [0]
  const step = Math.max(1, Math.floor(clientHeight * 0.85))
  const n = Math.min(Math.max(1, Math.floor(cap)), Math.ceil(max / step) + 1)
  if (n === 1) return [0]
  return Array.from({ length: n }, (_, i) => Math.round((i * max) / (n - 1)))
}

/** The file name of one photo: the top of a tab has no step suffix, the next views are -2, -3 and so on. */
export function shotName(scheme, tab, step = 0, narrow = false) {
  return `r1-${scheme}${narrow ? '-narrow' : ''}-${tab}${step > 0 ? `-${step + 1}` : ''}.png`
}

/** The Playwright module from a folder: its node_modules (playwright, then playwright-core), or the package folder itself. */
export function loadPlaywright(dir) {
  const root = resolve(dir)
  const tried = []
  const usable = (mod) => mod && mod.chromium && typeof mod.chromium.launch === 'function'
  const attempt = (from, spec) => {
    try {
      const mod = createRequire(join(from, 'x.cjs'))(spec)
      if (usable(mod)) return mod
      tried.push(`${spec} has no chromium`)
    } catch (err) {
      tried.push(`${spec}: ${String(err.message).split('\n')[0]}`)
    }
    return null
  }
  let name = ''
  try {
    name = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
  } catch {
    name = ''
  }
  if (name === 'playwright' || name === 'playwright-core') {
    const mod = attempt(root, root)
    if (mod) return mod
  }
  for (const spec of ['playwright', 'playwright-core']) {
    const mod = attempt(root, spec)
    if (mod) return mod
  }
  throw new UsageError(`no playwright or playwright-core under ${root} (${tried.join('; ')})`)
}

// ---------------------------------------------------------------------------------------------- the state

/**
 * The save the photos start from: esbuild bundles scripts/r1-screenshot-state.ts, node runs the bundle and its save.json is
 * read back. Resolves to { json, lifeId }; json is the text saveGame would have stored.
 */
export async function buildSave(o) {
  const work = mkdtempSync(join(tmpdir(), 'r1-screenshots-'))
  try {
    const { build } = await import('esbuild')
    const built = await build({ entryPoints: [STATE_ENTRY], bundle: true, platform: 'node', format: 'esm', target: 'es2022', write: false, logLevel: 'silent' })
    const bundle = join(work, 'state.mjs')
    writeFileSync(bundle, built.outputFiles[0].text)
    const file = join(work, 'save.json')
    const args = [bundle, '--out', file, '--seed', String(o.seed), '--years', String(o.years), '--companies', String(o.companies)]
    const run = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    if (run.status !== 0) throw new Error(`the state maker failed (exit ${run.status ?? run.signal}): ${String(run.stderr).trim()}`)
    const lines = String(run.stdout).trim().split('\n')
    const info = JSON.parse(lines[lines.length - 1])
    return { json: readFileSync(file, 'utf8'), lifeId: String(info.lifeId) }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------------------------- the dev server

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => done(port))
    })
  })
}

/** Starts node_modules/.bin/vite on a free port and waits until it answers. Resolves to { url, stop }. */
async function startVite() {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  const child = spawn(join(ROOT, 'node_modules', '.bin', 'vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  const keep = (chunk) => {
    log = (log + chunk).slice(-4000)
  }
  child.stdout.on('data', keep)
  child.stderr.on('data', keep)
  let ended = null
  child.once('exit', (code, signal) => {
    ended = code ?? signal ?? 'unknown'
  })
  process.once('exit', () => child.kill('SIGKILL'))
  const stop = async () => {
    if (ended !== null) return
    child.kill('SIGTERM')
    for (let i = 0; i < 20 && ended === null; i++) await sleep(250)
    if (ended === null) child.kill('SIGKILL')
  }
  const deadline = Date.now() + SERVE_WAIT_MS
  while (Date.now() < deadline) {
    if (ended !== null) throw new Error(`vite stopped (${ended}) before it answered:\n${log}`)
    try {
      const reply = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (reply.ok) return { url, stop }
    } catch {
      // Not up yet.
    }
    await sleep(250)
  }
  await stop()
  throw new Error(`vite did not answer at ${url} within ${SERVE_WAIT_MS / 1000} s:\n${log}`)
}

// ---------------------------------------------------------------------------------------------- in the page

// These run inside the page, so they use nothing from this file.
const PAGE_CHECKS = () => {
  const doc = document.documentElement
  const scroller = document.querySelector('.popup-scroll')
  const row = document.querySelector('.rb-tabs')
  const overflowX = row ? getComputedStyle(row).overflowX : ''
  return {
    page: doc.scrollWidth <= window.innerWidth,
    popup: scroller ? scroller.scrollWidth <= scroller.clientWidth : false,
    tabRowScrolls: overflowX === 'auto' || overflowX === 'scroll',
    tabRowOverflows: row ? row.scrollWidth > row.clientWidth : false,
  }
}
const PAGE_MEASURE = () => {
  const scroller = document.querySelector('.popup-scroll')
  return scroller ? { height: scroller.scrollHeight, client: scroller.clientHeight } : { height: 0, client: 0 }
}
const PAGE_SCROLL = (top) => {
  const scroller = document.querySelector('.popup-scroll')
  if (scroller) scroller.scrollTop = top
}
const PAGE_TAB_IS = (name) => document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('aria-label') === name

/** Watches a page for the three things that must never happen: a console error, a page error, a request to another origin. */
function watch(page, origin, problems) {
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`)
  })
  page.on('request', (req) => {
    const target = req.url()
    if (target.startsWith('data:') || target.startsWith('blob:')) return
    let there = ''
    try {
      there = new URL(target).origin
    } catch {
      problems.push(`network: ${req.method()} ${target}`)
      return
    }
    if (there !== origin) problems.push(`network: ${req.method()} ${target}`)
  })
}

/**
 * One phone: a fresh browser context with the save seeded, "Continue Life", then every tab in `tabs` photographed. Returns
 * { lines, problems, files }: one result per photo, what the page complained about, and the PNG paths.
 */
async function photograph(browser, o) {
  const lines = []
  const files = []
  const problems = []
  const context = await browser.newContext({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: SCALE, colorScheme: o.scheme })
  try {
    const page = await context.newPage()
    watch(page, o.origin, problems)
    // Once per session: a reload (or the app's own navigation) must not put the old save back over a newer one.
    await page.addInitScript(
      ({ key, save }) => {
        try {
          if (sessionStorage.getItem('r1-seeded')) return
          sessionStorage.setItem('r1-seeded', '1')
          localStorage.setItem(key, save)
        } catch {
          // Storage is blocked: the Home screen will have no life to continue and the run will say so.
        }
      },
      { key: SAVE_KEY, save: o.save },
    )
    await page.goto(o.target, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'Continue Life' }).click({ timeout: WAIT_MS })
    await page.locator('.report-book').waitFor({ state: 'visible', timeout: WAIT_MS })

    for (const tab of o.tabs) {
      if (tab.id !== 'summary') await page.getByRole('tab', { name: tab.name, exact: true }).click({ timeout: WAIT_MS })
      await page.waitForFunction(PAGE_TAB_IS, tab.name, { timeout: WAIT_MS })
      await page.getByRole('tabpanel').waitFor({ state: 'visible', timeout: WAIT_MS })
      await page.evaluate(PAGE_SCROLL, 0)
      await page.waitForTimeout(SETTLE_MS)

      const heights = []
      for (const button of await page.getByRole('tab').all()) heights.push((await button.boundingBox())?.height ?? 0)
      const smallest = heights.length ? Math.min(...heights) : 0
      const measured = await page.evaluate(PAGE_MEASURE)
      const positions = scrollPositions(measured.height, measured.client)

      for (let step = 0; step < positions.length; step++) {
        await page.evaluate(PAGE_SCROLL, positions[step])
        await page.waitForTimeout(STEP_MS)
        const file = join(o.out, shotName(o.scheme, tab.id, step, o.narrow))
        await page.screenshot({ path: file, animations: 'disabled' })
        const checks = await page.evaluate(PAGE_CHECKS)
        const ok = checks.page && checks.popup && checks.tabRowScrolls && smallest >= MIN_TARGET - 0.01
        files.push(file)
        lines.push({
          shot: basename(file),
          scheme: o.scheme,
          tab: tab.id,
          step: step + 1,
          of: positions.length,
          viewport: `${o.width}x${o.height}`,
          noPageOverflow: checks.page,
          noPopupOverflow: checks.popup,
          tabRowScrolls: checks.tabRowScrolls,
          tabRowOverflows: checks.tabRowOverflows,
          smallestTab: Math.round(smallest * 10) / 10,
          ok,
        })
      }
    }
  } finally {
    await context.close()
  }
  return { lines, problems, files }
}

// ---------------------------------------------------------------------------------------------- main

async function run(opt) {
  const { chromium } = loadPlaywright(opt.playwright)
  mkdirSync(opt.out, { recursive: true })
  console.error(`playing the life (seed ${opt.seed}, ${opt.years} years, ${opt.companies} companies)...`)
  const { json: save, lifeId } = await buildSave(opt)
  console.error(`state ready: ${lifeId}, ${Math.round(save.length / 1024)} KB`)

  let server = null
  let base = opt.url
  if (opt.serve) {
    console.error('starting vite...')
    server = await startVite()
    base = server.url
  }
  const target = new URL(base)
  target.search = FLAGS_QUERY
  const origin = target.origin

  const lines = []
  const files = []
  const problems = []
  let browser = null
  try {
    browser = await chromium.launch(opt.chromium ? { executablePath: opt.chromium } : {})
    const passes = [
      ...['light', 'dark'].map((scheme) => ({ scheme, width: opt.width, height: opt.height, tabs: TABS, narrow: false })),
      { scheme: 'light', width: opt.narrow, height: NARROW_HEIGHT, tabs: NARROW_TABS, narrow: true },
    ]
    for (const pass of passes) {
      const done = await photograph(browser, { ...pass, out: opt.out, save, target: target.href, origin })
      for (const line of done.lines) console.log(JSON.stringify(line))
      lines.push(...done.lines)
      files.push(...done.files)
      problems.push(...done.problems.map((p) => `${pass.scheme}${pass.narrow ? ' narrow' : ''}: ${p}`))
    }
  } finally {
    if (browser) await browser.close()
    if (server) await server.stop()
  }

  const failed = lines.filter((l) => !l.ok).length
  const ok = failed === 0 && problems.length === 0 && lines.length > 0
  console.log(JSON.stringify({ summary: true, shots: lines.length, failedShots: failed, problems: problems.slice(0, 20), problemCount: problems.length, ok }))
  console.log(files.join('\n'))
  return ok ? 0 : 1
}

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    return 0
  }
  return run(parseOptions(argv))
}

function isMain() {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (err) => {
      if (err instanceof UsageError) {
        console.error(`${err.message}\n${USAGE}`)
        process.exitCode = 2
      } else {
        console.error(err?.stack ?? err)
        process.exitCode = 1
      }
    },
  )
}
