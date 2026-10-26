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
//   social gzip(JSON.stringify(a 30-year life of a founder with a family)): the v5.2.0 social save (R4-E1,
//          test/fixtures/save-v5.2.0-social.json.gz), the one fixture that holds every record the People track of v5.3.0 reads or
//          mirrors, all written by the v5.2.0 engine: a spouse and two children, a family firm with both children on the payroll
//          (their data.nepo) and one named successor (the company's family record), a will that cuts one child out (that child's
//          data.wl), a loan to a friend (data.w, owes) and 22 live exes (the cap is 20, cleanupPeople in relationships.ts, so the
//          first year played drops 2). The exes are made last, after the last year, because cleanupPeople would cut them to 20 in it.
//          The family is kept warm while the 30 years are played (see oneYear), a measurement aid like keepAlive
//
// Never regenerate a fixture from a later engine: it would be a later save (the header of scripts/save-size.ts says the same of
// test/fixtures/save-v1.json.gz). A new release adds one fixture, written by that release's tag.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { ageUp } from '../src/game/aging'
import { designateSuccessor, hireRelative } from '../src/game/business/nepo-actions'
import { bizOf } from '../src/game/business/state'
import { cutFromWill } from '../src/game/events/wealth-kids'
import { wealthNodes } from '../src/game/events/wealth-menu'
import { breakUp, performWedding } from '../src/game/love'
import { createPerson } from '../src/game/people'
import { memorySnapshotBackend, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot } from '../src/game/save'
import { encodeSnapshotRecord } from '../src/game/snapshot-codec'
import type { GameState, MenuAction, MenuNode, Person } from '../src/game/types'
import { probeLife, type ProbeOptions } from '../test/probe-life'

/** The lives each mode plays. The seed, the birth year and the counts are part of the fixture's identity. */
const V402_LIFE: ProbeOptions = { seed: 11, birthYear: 1990, businesses: 3, years: 12 }
const HEAVY_LIFE: ProbeOptions = { seed: 7, birthYear: 1950, businesses: 4, years: 20, keepAlive: true }
const TM_LIFE: ProbeOptions = { seed: 11, birthYear: 1990, businesses: 2, years: 0 }
const TM_YEARS = 6
/** The first of the TM_YEARS after which a snapshot is taken: the last four. */
const TM_FIRST_SNAPSHOT = 3
/** The social life (R4-E1): a founder of 30 with one company in 1996, played for 30 years with a family. The years are played by socialLife, not by probeLife. */
const SOCIAL_LIFE: ProbeOptions = { seed: 3, birthYear: 1966, businesses: 1, years: 0 }
const SOCIAL_YEARS = 30
const SOCIAL_EXES = 22

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

/**
 * One year of the founder's life. Two measurement aids, as the heavy mode's keepAlive is one: health is put back to 100, and the
 * family is kept warm (a spouse's relationship is raised to 80 and a child's to 70 when it fell below, as a player who calls home
 * would), so the marriage and the children are still there at the end; the life is there to be loaded, not to end or to divorce.
 */
function oneYear(g: GameState): void {
  g.queue = []
  g.character.stats.health = 100
  g.character.conditions = []
  for (const p of g.people) {
    if (!p.alive) continue
    const floor = p.relation === 'spouse' ? 80 : p.relation === 'child' ? 70 : 0
    if (p.relationship < floor) p.relationship = floor
  }
  ageUp(g)
}

/** The menu row with this id, looking through the groups. */
function findAction(nodes: readonly MenuNode[], id: string, g: GameState): MenuAction | undefined {
  for (const n of nodes) {
    if (n.type === 'action' && n.id === id) return n
    if (n.type === 'menu') {
      const hit = findAction(n.children(g), id, g)
      if (hit) return hit
    }
  }
  return undefined
}

/**
 * The social life. Everything is made by the engine's own functions, in the order a life would: a wedding (performWedding), two
 * children as processPregnancies makes them, thirty years of ageUp, then in the last year a family firm (hireRelative,
 * designateSuccessor), a will that cuts a child out (cutFromWill), a loan to a friend (the Lend row of the Money menu), and last
 * of all the exes, each a partner who is then broken up with (breakUp), so there are more than the cleanup keeps.
 */
function socialLife(): GameState {
  const g = probeLife(SOCIAL_LIFE)
  const c = g.character
  const asset = g.assets.find((a) => a.kind === 'business')
  if (!asset) fail('the social life has no company')
  const partner = createPerson(g, { relation: 'partner', age: 29, relationship: 78, livesWithPlayer: true })
  performWedding(g, partner, { venue: 'eloped', prenup: false, honeymoon: null })
  for (const age of [3, 1]) {
    createPerson(g, {
      relation: 'child',
      age,
      lastName: c.lastName,
      relationship: 85,
      money: 0,
      otherParentId: partner.id,
      biological: true,
      livesWithPlayer: true,
    })
  }
  const friend = createPerson(g, { relation: 'friend', age: 33, relationship: 62 })
  for (let year = 1; year <= SOCIAL_YEARS; year++) {
    if (year === SOCIAL_YEARS) {
      // The last year: the records are in place when the engine runs its yearly steps over them once.
      g.queue = []
      const kids = g.people.filter((p) => p.alive && p.relation === 'child')
      const [elder, younger] = kids
      if (kids.length !== 2 || !elder || !younger || !partner.alive || partner.relation !== 'spouse') fail(`the family did not last: ${kids.length} children, the spouse is ${partner.alive ? partner.relation : 'dead'}: pick another seed`)
      const biz = bizOf(g, asset)
      for (const [kid, rank] of [[elder, 2], [younger, 1]] as const) {
        // A grown child asks for what they earn already: offer more until they take it.
        let hired = hireRelative(g, asset, biz, kid, { rank }, { quiet: true })
        for (const payMult of [1.25, 1.5, 2, 3]) {
          if (hired.ok || hired.reason?.includes('expectations') !== true) break
          hired = hireRelative(g, asset, biz, kid, { rank, payMult }, { quiet: true })
        }
        if (!hired.ok) fail(`${kid.firstName} was not hired: ${hired.reason ?? 'no reason'}: pick another seed`)
      }
      const named = designateSuccessor(g, asset, biz, elder, { quiet: true })
      if (!named.ok) fail(`no successor: ${named.reason ?? 'no reason'}: pick another seed`)
      cutFromWill(g, younger)
      const lend = findAction(wealthNodes(g, friend), 'wealth.lend', g)
      if (!lend) fail('the friend has no Lend row')
      lend.run(g, '25000')
      g.queue = []
    }
    oneYear(g)
    if (!g.character.alive) fail(`the life died in year ${year}`)
  }
  g.queue = []
  const ex = (i: number): Person => createPerson(g, { relation: 'partner', age: 24 + (i % 17), relationship: 40 + ((i * 7) % 35) })
  for (let i = 0; i < SOCIAL_EXES; i++) breakUp(g, ex(i), i % 2 === 0 ? 'them' : 'player')
  g.queue = []
  return g
}

async function main(): Promise<void> {
  const [mode, path] = process.argv.slice(2)
  if (path === undefined) fail('usage: save-fixtures <v402|heavy|tm|idb|social> <out.json.gz>')
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
  } else if (mode === 'social') {
    writeGz(path, JSON.stringify(socialLife()), 'social life')
  } else {
    fail(`unknown mode ${String(mode)}: v402, heavy, tm, idb or social`)
  }
}

void main()
