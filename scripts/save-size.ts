// Save-size probe: how big a long, busy life is once saved, and where the bytes go.
//
//   node_modules/.bin/esbuild scripts/save-size.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/save-size.mjs
//   node /tmp/save-size.mjs                    (a markdown table of raw and gzip sizes by part)
//   node /tmp/save-size.mjs --fixture <path>   (write the small gzipped fixture save instead)
//
// The default run plays the probe lives of test/probe-life.ts (born 1926, twelve companies from age
// 30, seventy years on, so age 100 at the end) for seeds 1 to 60 and measures the first founder still
// alive at the end. Those lives use keepAlive, a measurement aid: the founder never sees a doctor, so
// without it nobody gets near 100 (the best of seeds 1 to 220 reached 93 on the v2.4.0 engine), and even
// with it most die first. When no seed reaches 100 it measures the founder who lived longest and says so.
// "Raw" is the characters of JSON.stringify, the string saveGame writes; "gzip" is node's gzip at level
// 6. Each part is measured on its own, so the parts don't add up exactly to the whole save.
//
// --fixture writes gzip(JSON.stringify(a 3-year life with two companies)), a save from the age of 33.
// test/fixtures/save-v1.json.gz was written by it on the unchanged v2.4.0 engine, as a real old save
// for the migration tests. Don't regenerate it: a later engine would write a later save.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import type { GameState, Json } from '../src/game/types'
import { probeLife, type ProbeOptions } from '../test/probe-life'

/** The life the table measures: adult at 30, so age 100 at the end. */
const LONG_LIFE: Omit<ProbeOptions, 'seed'> = { birthYear: 1926, businesses: 12, years: 70, keepAlive: true }
const SEEDS = 60
/** The life the fixture holds. */
const FIXTURE_LIFE: ProbeOptions = { seed: 7, birthYear: 1996, businesses: 2, years: 3 }

const args = process.argv.slice(2)

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const commas = (n: number): string => n.toLocaleString('en-US')

interface Run {
  seed: number
  g: GameState
}

/** The first seed whose founder is alive at the end, else the one who lived longest (lowest seed on a tie). */
function pickLife(): Run {
  let longest: Run | undefined
  for (let seed = 1; seed <= SEEDS; seed++) {
    const t0 = Date.now()
    const g = probeLife({ seed, ...LONG_LIFE })
    console.error(`seed ${seed}: ${g.character.alive ? 'alive' : 'died'} at ${g.character.age} (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
    if (g.character.alive) return { seed, g }
    if (!longest || g.character.age > longest.g.character.age) longest = { seed, g }
  }
  return longest ?? fail('no seeds were played')
}

function record(value: Json | undefined, what: string): Record<string, Json> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(`${what} is not an object`)
  return value
}

interface Row {
  label: string
  raw: number
  gzip: number
}

function measure(label: string, value: unknown): Row {
  const json = JSON.stringify(value)
  return { label, raw: json.length, gzip: gzipSync(json, { level: 6 }).length }
}

/** The whole save, the three world-economy frames, the life log and the assets, and what is left. */
function rowsOf(g: GameState): Row[] {
  const { countries, previous, history, ...worldRest } = record(g.flags.worldEconomy, 'flags.worldEconomy')
  const rest: Record<string, unknown> = { ...g, flags: { ...g.flags, worldEconomy: worldRest } }
  delete rest.log
  delete rest.assets
  return [
    measure('whole save', g),
    measure('flags.worldEconomy.countries', countries),
    measure('flags.worldEconomy.previous', previous),
    measure('flags.worldEconomy.history', history),
    measure('log', g.log),
    measure('assets', g.assets),
    measure('everything else', rest),
  ]
}

const fixtureAt = args.indexOf('--fixture')
if (fixtureAt >= 0) {
  const path = args[fixtureAt + 1] ?? fail('--fixture needs a path to write to')
  const json = JSON.stringify(probeLife(FIXTURE_LIFE))
  const gz = gzipSync(json)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, gz)
  console.log(`wrote ${path}: ${commas(json.length)} characters, ${commas(gz.length)} bytes gzipped`)
} else {
  const { seed, g } = pickLife()
  const c = g.character
  console.log(`Seed ${seed} (${c.countryId}): born ${LONG_LIFE.birthYear}, ${LONG_LIFE.businesses} companies from age 30, founder kept alive (keepAlive), ${c.alive ? 'alive' : 'died'} at ${c.age} (year ${g.year}).`)
  if (!c.alive) console.log(`No founder from seeds 1 to ${SEEDS} reached age 100 alive, so this is the one who lived longest.`)
  console.log()
  console.log('| Part | Raw characters | Gzip bytes (level 6) | Gzip % of raw |')
  console.log('| --- | ---: | ---: | ---: |')
  for (const r of rowsOf(g)) console.log(`| ${r.label} | ${commas(r.raw)} | ${commas(r.gzip)} | ${((r.gzip / r.raw) * 100).toFixed(2)}% |`)
}
