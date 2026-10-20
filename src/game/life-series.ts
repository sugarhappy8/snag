// The life series (R1 charts, S3): one row for each age you lived, written at the end of every year by ageUp and kept in
// g.flags.lifeSeries. The net-worth line on the Profile, Death and Graveyard screens and the wealth cockpit read it, and
// so will the CV lanes later. It is a record of what happened, never an input: nothing in the simulation reads it back.
//
// A row is [age, year, netWorth, cash, debt, income, happiness, health], all whole numbers. The writer holds every value to
// its range and the reader does it again, so a damaged save can only lose rows, never break a chart. The series belongs to
// one life (it names the lifeId): an heir starts their own, and a copy that is not this life's reads as nothing.
//
// Pure reads, one idempotent write: no random draws, no dates, no money moved.
import { netWorth } from './core'
import type { GameState, Json } from './types'

/** Rows kept (the newest by age). */
export const LIFE_SERIES_ROWS = 120
/** Entries of a stored series a read looks at (the newest), so a hostile save cannot make a read walk tens of thousands. */
const READ_WINDOW = 1000
/** Points in a graveyard trail. */
const SPARK_POINTS = 40
/** The most any money value holds, either way. */
const MAGNITUDE = 1e15
const MAX_AGE = 150
const MAX_YEAR = 9999

export type LifeRow = [age: number, year: number, netWorth: number, cash: number, debt: number, income: number, happiness: number, health: number]

export interface LifeSeries {
  v: 1
  id: string
  rows: LifeRow[]
}

function whole(n: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, n))) + 0
}

/** A row from eight finite numbers, each held to its range; null for anything else. */
function cleanRow(v: unknown): LifeRow | null {
  if (!Array.isArray(v) || v.length !== 8) return null
  for (const n of v) if (typeof n !== 'number' || !Number.isFinite(n)) return null
  const [age, year, nw, cash, debt, income, happiness, health] = v as number[]
  return [
    whole(age!, 0, MAX_AGE),
    whole(year!, 1, MAX_YEAR),
    whole(nw!, -MAGNITUDE, MAGNITUDE),
    whole(cash!, -MAGNITUDE, MAGNITUDE),
    whole(debt!, -MAGNITUDE, MAGNITUDE),
    whole(income!, -MAGNITUDE, MAGNITUDE),
    whole(happiness!, 0, 100),
    whole(health!, 0, 100),
  ]
}

/** Valid rows only, one for each age (the later one wins), oldest first, at most LIFE_SERIES_ROWS (the newest). */
function tidy(rows: readonly unknown[]): LifeRow[] {
  const byAge = new Map<number, LifeRow>()
  for (const raw of rows) {
    const row = cleanRow(raw)
    if (row) byAge.set(row[0], row)
  }
  return [...byAge.values()].sort((a, b) => a[0] - b[0]).slice(-LIFE_SERIES_ROWS)
}

/**
 * This life's rows, oldest first. Nothing for a series that belongs to another life, has another version, or is not a list
 * of rows; rows that are not eight finite numbers are left out.
 */
export function readLifeSeries(g: GameState): LifeRow[] {
  const s = g.flags.lifeSeries
  if (!s || typeof s !== 'object' || Array.isArray(s)) return []
  if (s.v !== 1 || s.id !== g.lifeId || !Array.isArray(s.rows)) return []
  // A real series holds at most LIFE_SERIES_ROWS, so only the newest READ_WINDOW entries of a longer one are looked at.
  return tidy(s.rows.length > READ_WINDOW ? s.rows.slice(-READ_WINDOW) : s.rows)
}

/** The same rows as objects, oldest first (what the wealth cockpit and the net-worth line read). */
export function lifeRows(g: GameState): { age: number; year: number; netWorth: number; cash: number; debt: number }[] {
  return readLifeSeries(g).map(([age, year, nw, cash, debt]) => ({ age, year, netWorth: nw, cash, debt }))
}

function finite(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Write the row of the character's current age: replaces the one already there, so a replayed year leaves one row. Call it
 * after the year's hooks, when the year's income so far is in flags.taxableIncome. Never throws and never touches the dice.
 */
export function writeLifeRow(g: GameState): void {
  try {
    const c = g.character
    const debt = c.loans.reduce((t, l) => t + finite(l.balance), 0) + g.assets.reduce((t, a) => t + finite(a.mortgage?.balance), 0)
    const row = cleanRow([c.age, g.year, netWorth(g), c.money, debt, finite(g.flags.taxableIncome), c.stats.happiness, c.stats.health].map((n) => (Number.isFinite(n) ? n : 0)))
    if (!row) return
    const rows = [...readLifeSeries(g).filter((r) => r[0] !== row[0]), row].sort((a, b) => a[0] - b[0]).slice(-LIFE_SERIES_ROWS)
    const series: LifeSeries = { v: 1, id: g.lifeId, rows }
    g.flags.lifeSeries = series as unknown as Json
  } catch {
    // A record of the past is never worth a failed year.
  }
}

/**
 * The net worth of each row as a short trail for the graveyard: at most `points` values (never more than 40), the first and
 * the last always kept, the rest spread evenly. A short series comes back whole.
 */
export function lifeSpark(g: GameState, points: number = SPARK_POINTS): number[] {
  const worth = readLifeSeries(g).map((r) => r[2])
  const want = Math.max(2, Math.min(SPARK_POINTS, Number.isFinite(points) ? Math.floor(points) : SPARK_POINTS))
  if (worth.length <= want) return worth
  const last = worth.length - 1
  return Array.from({ length: want }, (_, i) => worth[Math.round((i * last) / (want - 1))]!)
}

/** A graveyard trail read back from storage: two to 40 finite numbers, made whole and held to 1e15; anything else is dropped. */
export function readSpark(v: unknown): number[] | undefined {
  if (!Array.isArray(v) || v.length < 2 || v.length > SPARK_POINTS) return undefined
  const out: number[] = []
  for (const n of v) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
    out.push(whole(n, -MAGNITUDE, MAGNITUDE))
  }
  return out
}
