// Save fixtures: real old saves, written by the engine that made them, for the migration tests of every later release.
//
// A fixture is a save of an OLD build, so this script is never run against the tree it is committed in. To make one, unpack the
// release tag into a scratch directory outside the repo, link node_modules, copy this file into its scripts/ and bundle it there:
//
//   git archive v4.1.1 | tar -x -C <scratch>/v411
//   ln -s <worktree>/node_modules <scratch>/v411/node_modules
//   cp scripts/save-fixtures.ts <scratch>/v411/scripts/
//   cd <scratch>/v411 && node_modules/.bin/esbuild scripts/save-fixtures.ts --bundle --platform=node --format=esm \
//     --outfile=<scratch>/fx411.mjs
//   node <worktree>/../bin/slot.mjs heavy -- node <scratch>/fx411.mjs <mode> <out.json.gz>
//
// Modes (all gzipped JSON; the life is the one test/probe-life.ts makes, so the same options give the same life on the same engine):
//   v402   gzip(JSON.stringify(a 12-year life with three companies)): the v4.0.2 save (test/fixtures/save-v4.0.2.json.gz)
//   heavy  gzip(JSON.stringify(a 20-year life with four companies, health kept up)): a busy v4.1.1 save (save-v4.1.1-heavy.json.gz)
//   tm     { lifeId, index, entries, states }: a 6-year life with four Time Machine snapshots taken through takeSnapshot on a
//          memory store that calls itself 'idb' (the index of a page that lost its memory store would list no stops, and IndexedDB
//          is where a player's snapshots live). `index` is the text the engine wrote to localStorage['anotherlife.timemachine.v1'],
//          `entries` is every backend key and value (gz2 records included, exactly as stored), `states[age]` is JSON.stringify(g)
//          at that snapshot
//   idb    { saves, marker, state }: the 12-year life as IndexedDB held it, `saves['anotherlife.save.v1']` the gz2 record that
//          encodeSnapshotRecord(json, 1000) gives, `marker` the localStorage marker value and `state` the plain JSON text
//
// Never regenerate a fixture from a later engine: it would be a later save (the header of scripts/save-size.ts says the same of
// test/fixtures/save-v1.json.gz). A new release adds one fixture, written by that release's tag.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { ageUp } from '../src/game/aging'
import { memorySnapshotBackend, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot } from '../src/game/save'
import { encodeSnapshotRecord } from '../src/game/snapshot-codec'
import { probeLife, type ProbeOptions } from '../test/probe-life'

/** The lives each mode plays. The seed, the birth year and the counts are part of the fixture's identity. */
const V402_LIFE: ProbeOptions = { seed: 11, birthYear: 1990, businesses: 3, years: 12 }
const HEAVY_LIFE: ProbeOptions = { seed: 7, birthYear: 1950, businesses: 4, years: 20, keepAlive: true }
const TM_LIFE: ProbeOptions = { seed: 11, birthYear: 1990, businesses: 2, years: 0 }
const TM_YEARS = 6
/** The first of the TM_YEARS after which a snapshot is taken: the last four. */
const TM_FIRST_SNAPSHOT = 3

const INDEX_KEY = 'anotherlife.timemachine.v1'
const SAVE_KEY = 'anotherlife.save.v1'
const IDB_MARKER = '1'

// The engine keeps its Time Machine index in localStorage. A node script has none: this one lives in memory.
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => void store.set(k, String(v)),
    removeItem: (k: string): void => void store.delete(k),
    clear: (): void => store.clear(),
    key: (i: number): string | null => [...store.keys()][i] ?? null,
    get length(): number {
      return store.size
    },
  },
})

const commas = (n: number): string => n.toLocaleString('en-US')

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function writeGz(path: string, text: string, what: string): void {
  const gz = gzipSync(text)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, gz)
  console.log(`wrote ${path} (${what}): ${commas(text.length)} characters, ${commas(gz.length)} bytes gzipped`)
}

async function timeMachine(): Promise<string> {
  const backend = { ...memorySnapshotBackend(), name: 'idb' as const }
  setSnapshotBackend(backend)
  const g = probeLife(TM_LIFE)
  startTimeline(g.lifeId, null)
  const states: Record<string, string> = {}
  for (let year = 1; year <= TM_YEARS; year++) {
    g.queue = []
    ageUp(g)
    if (!g.character.alive) fail(`the life died in year ${year}: pick another seed`)
    if (year < TM_FIRST_SNAPSHOT) continue
    states[String(g.character.age)] = JSON.stringify(g)
    if (!(await takeSnapshot(g))) fail(`takeSnapshot refused the snapshot at age ${g.character.age}`)
  }
  await snapshotWritesSettled()
  const entries: Record<string, string> = {}
  for (const key of (await backend.keys()).sort()) {
    const [value] = await backend.get([key])
    if (value === null || value === undefined) fail(`the backend lists ${key} but holds no value for it`)
    entries[key] = value
  }
  const index = localStorage.getItem(INDEX_KEY)
  if (index === null) fail('the engine wrote no Time Machine index')
  return JSON.stringify({ lifeId: g.lifeId, index, entries, states })
}

async function main(): Promise<void> {
  const [mode, path] = process.argv.slice(2)
  if (path === undefined) fail('usage: save-fixtures <v402|heavy|tm|idb> <out.json.gz>')
  if (mode === 'v402') {
    writeGz(path, JSON.stringify(probeLife(V402_LIFE)), 'v402 life')
  } else if (mode === 'heavy') {
    writeGz(path, JSON.stringify(probeLife(HEAVY_LIFE)), 'heavy life')
  } else if (mode === 'tm') {
    writeGz(path, await timeMachine(), 'time machine')
  } else if (mode === 'idb') {
    const state = JSON.stringify(probeLife(V402_LIFE))
    const record = await encodeSnapshotRecord(state, 1000)
    if (!record.startsWith('gz2:')) fail('the record was not compressed: is CompressionStream missing?')
    writeGz(path, JSON.stringify({ saves: { [SAVE_KEY]: record }, marker: IDB_MARKER, state }), 'indexeddb record')
  } else {
    fail(`unknown mode ${String(mode)}: v402, heavy, tm or idb`)
  }
}

void main()
