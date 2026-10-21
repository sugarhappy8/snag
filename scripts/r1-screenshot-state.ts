// R1-C16: the state behind the Annual Report screenshots. It plays a real life with the real engine, so the save has the
// 30 years of books the charts draw from, and ends with the player's own Annual Report waiting as the first popup.
//
// scripts/r1-screenshots.mjs bundles this file with esbuild and runs the bundle (the pattern of scripts/save-size.ts); the
// test imports makeReportState directly. As a bundle it is a small command:
//
//   node state.mjs --out save.json [--seed 7] [--birth-year 1964] [--years 30] [--companies 3]
//
// It writes the save (exactly what saveGame stores: JSON.stringify of the state) to --out and prints one JSON line.
import { realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { ageUp } from '../src/game/aging'
import { becomeCeo, installManager, managerCandidate } from '../src/game/business/career'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, industryProblem, newBiz } from '../src/game/business/founding'
import { industryDef } from '../src/game/business/industries'
import { bizOf } from '../src/game/business/state'
import { bindMoneyContext } from '../src/game/core'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { withFlags } from '../src/game/flags'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState, ModalItem } from '../src/game/types'

export interface ReportStateOptions {
  /** The first seed to try (default 7). A life that queues no report is dropped for the next seed, up to ten in all. */
  seed?: number
  /** Calendar year of birth (default 1964). The founder is made an adult at 30, in birthYear + 30. */
  birthYear?: number
  /** Years lived from 30 on, each one through ageUp (default 30). */
  years?: number
  /** Companies owned, from 1 to 12 (default 3): the first is run by the player, the others by hired CEOs. */
  companies?: number
}

const SEEDS_TRIED = 10
const MAX_COMPANIES = 12
/** A company name needs a face on a screenshot; these go in front of the industry's own label. */
const NAMES = ['Maple', 'Harbor', 'Summit', 'Ember', 'Juniper', 'Bluebird', 'Granite', 'Willow', 'Copper', 'Lantern', 'Meadow', 'Anchor']

function whole(name: string, value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`makeReportState: ${name} must be a whole number from ${min} to ${max}`)
  return value
}

const isReport = (m: ModalItem): boolean => m.kind === 'minigame' && m.game === 'annualReport'

/**
 * One life: an adult founder at 30 with money, smarts and a licence (as test/probe-life.ts makes one), `companies`
 * companies of the first open industries, the first run by the player and the rest by hired CEOs, then `years` years
 * through the real yearly loop with the popups cleared before each. The player takes the optimizer's plan every year
 * (what accepting the suggested plan does), because a company left on its opening plan runs dry and queues a Cash Crunch
 * instead of a report. Null when that life has no player-run report waiting at the end, or the founder died on the way.
 */
function playLife(seed: number, birthYear: number, years: number, companies: number): GameState | null {
  const g = createNewLife({ seed, year: birthYear })
  g.queue = []
  g.character.age = 30
  g.year = birthYear + 30
  g.character.money = 5e6
  g.character.stats.smarts = 75
  g.character.licenses = ['driver']
  bindMoneyContext(g)

  const { countryId, city } = g.character
  const made: Asset[] = []
  for (const industry of INDUSTRY_IDS) {
    if (made.length === companies) break
    if (industryProblem(g, industry) !== null) continue
    const opened = g.year - 6
    const b0 = newBiz(g, industry, countryId, city, { cash: 3_000_000, founded: opened, outlets: [{ countryId, city, count: 6, opened }] })
    const a = createBusinessAsset(g, `${NAMES[made.length % NAMES.length]} ${industryDef(industry).label}`, b0, 200_000)
    g.assets.push(a)
    const b = bizOf(g, a)
    if (made.length === 0) becomeCeo(g, a, b)
    else installManager(g, b, managerCandidate(g, b, 70))
    const plan = bestPlan(g, b)
    b.price = plan.price
    b.production = plan.production
    made.push(a)
  }
  if (made.length < companies) throw new Error(`makeReportState: only ${made.length} of ${companies} industries are open to a founder in ${countryId} in ${g.year}`)
  const mine = made[0]!

  for (let y = 0; y < years; y++) {
    g.queue = []
    g.character.stats.health = 100
    g.character.conditions = []
    const b = bizOf(g, mine)
    const plan = bestPlan(g, b)
    b.price = plan.price
    b.production = plan.production
    // The last year is the one that writes data.chart; every year before it only has to leave its books behind.
    if (y === years - 1) withFlags({ annualReport2: true, chartKit: true }, () => ageUp(g))
    else ageUp(g)
  }
  g.queue = g.queue.filter(isReport)
  return g.character.alive && g.queue.length > 0 ? g : null
}

/**
 * A save whose first popup is the player's Annual Report, with `data.chart` in it, after `years` years of a founder with
 * `companies` companies. The same options always give the same state. The build flags are put back as they were found.
 * Throws when none of ten seeds, starting at `seed`, queues a report.
 */
export function makeReportState(o: ReportStateOptions = {}): GameState {
  const seed = whole('seed', o.seed ?? 7, 0, 1_000_000)
  const birthYear = whole('birthYear', o.birthYear ?? 1964, 1850, 2100)
  const years = whole('years', o.years ?? 30, 0, 200)
  const companies = whole('companies', o.companies ?? 3, 1, MAX_COMPANIES)
  for (let s = seed; s < seed + SEEDS_TRIED; s++) {
    const g = playLife(s, birthYear, years, companies)
    if (g) return g
  }
  throw new Error(`makeReportState: no annual report was queued for seeds ${seed} to ${seed + SEEDS_TRIED - 1} (${years} years, ${companies} companies)`)
}

// ---------------------------------------------------------------------------------------------- command

function number(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d{1,7}$/.test(raw)) throw new Error(`--${name} needs a whole number`)
  return Number(raw)
}

/** The command: parse the arguments, make the state, write it to --out, print one line about it. */
export function runCli(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { out: { type: 'string' }, seed: { type: 'string' }, 'birth-year': { type: 'string' }, years: { type: 'string' }, companies: { type: 'string' } },
    allowPositionals: false,
    strict: true,
  })
  if (values.out === undefined) throw new Error('--out <file> is required')
  const g = makeReportState({
    seed: number(values.seed, 'seed'),
    birthYear: number(values['birth-year'], 'birth-year'),
    years: number(values.years, 'years'),
    companies: number(values.companies, 'companies'),
  })
  writeFileSync(values.out, JSON.stringify(g))
  console.log(JSON.stringify({ lifeId: g.lifeId, year: g.year, age: g.character.age, reports: g.queue.length }))
}

/** True when this file is the program node was started with, as the bundle is (and never under the test). */
function isMain(): boolean {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  try {
    runCli(process.argv.slice(2))
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}
