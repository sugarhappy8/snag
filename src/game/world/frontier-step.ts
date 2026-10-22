// The yearly step of the world frontier (R3-F2, C.6 b): the module that owns the slice world.frontier in the `frontier` phase of the
// aging seam (kernel/registry.ts, modules/index.ts registers it with one line).
//
// Two things happen to the shard once a year, in table order of the fields:
//   - public research fades: pub = floor(pub x 0.9). A leap other researchers can build on does not stay free forever. The lead does
//     not fade: it is how far ahead the world is, and only the calendar closes it (the Workshop race, R3-F5, reads it);
//   - a rival follows. Each row of yours with a lead (a field with `lead`, who 'you', d above 0), not followed yet, one to four years
//     old, is followed with a chance of 30% a year, from the named stream `frontier` (followDraw). A follow marks your row (f: 1, so a
//     row is followed once) and adds a rival row in the same market, dated this year, worth floor(d / 2) but at least 1, cut to the room
//     the field has left this year and in all (pushRow, the same cut the writer makes). A follow adds no public research.
//
// Why it is safe:
//   - idempotent by a year stamp: the shard remembers the last year it was stepped (shard.y). A second call in the year returns, and so
//     does a replay of the year. A stamp from the future (a hostile save) is stepped once and put right, never trusted to freeze the
//     fade for good;
//   - nothing to do, nothing written: up to 2026 (history is fixed), with no shard (so a save from before R3 and every life that never
//     meets a push has no `frontier` key and plays exactly as it did), or with no field in it, the step returns without creating a
//     world. It logs nothing: the player learns of a follow from the Workshop race row and from the odds term, not from a line;
//   - luck is a pure function of the family, the year, the field and the row's origin (outcomeStream), so a reload, a clone and an heir
//     see the same follows and a Time Machine jump re-rolls the year it lands in and keeps the finished ones. It draws nothing from
//     g.rng and moves no g.nextId;
//   - bounded: the rows go through pushRow and boundRows, so 6 rows a market, 4 markets a field, 2 years of lead a year and 12 in all
//     still hold, and the shard stays a valid one that normalizeFrontier returns as itself;
//   - written once, by replacing the shard root (ensureWorld(g).frontier = next), never in place.
//
// It sits in layer 2 and imports the world's own files, the stream table and the registry's type.
import { PRESENT_YEAR } from '../history/timeline'
import type { ModuleDef } from '../kernel/registry'
import { outcomeStream } from '../kernel/streams'
import type { GameState } from '../types'
import { pushRow, readFrontier, type FieldRec, type FrontierRow, type FrontierShard } from './frontier'
import { FIELDS, FIELD_IDS, type FieldId } from './frontier-fields'
import { ensureWorld } from './state'

/** The chance, in a year, that a rival follows one of your rows. */
const FOLLOW_CHANCE = 0.3
/** A rival follows a row that is this many years old or more (a row of this year is too new), up to FOLLOW_MAX. */
const FOLLOW_MIN_AGE = 1
const FOLLOW_MAX_AGE = 4
/** Public research keeps this much of itself each year (tenths of a point, rounded down). */
const FADE = 0.9

/**
 * The luck of a rival following the row of origin key `o` in `field`, in [0, 1): a pure function of the family, the year, the field and
 * the origin. Below FOLLOW_CHANCE the rival follows. Draws nothing from g.rng.
 */
export function followDraw(g: Pick<GameState, 'lifeId' | 'flags'>, field: FieldId, o: string, year: number): number {
  return outcomeStream(g, 'frontier', year, `${field}|f|${o}`)()
}

/** Whether a row of yours is due a follow draw in `year`: a lead field, your row with a lead, not followed, one to four years old. */
const due = (r: Readonly<FrontierRow>, year: number): boolean => r.w === 'you' && r.d > 0 && r.f !== 1 && year - r.y >= FOLLOW_MIN_AGE && year - r.y <= FOLLOW_MAX_AGE

/** One field after a year: public research faded, and the rows of yours that a rival follows marked and answered with a rival row. */
function stepField(g: GameState, id: FieldId, rec: Readonly<FieldRec>): FieldRec | null {
  let cur: FieldRec = { ...rec, pub: Math.floor(rec.pub * FADE) }
  if (FIELDS[id].lead) {
    const marked = new Set<number>()
    const answers: FrontierRow[] = []
    rec.rows.forEach((r, i) => {
      if (!due(r, g.year) || followDraw(g, id, r.o, g.year) >= FOLLOW_CHANCE) return
      marked.add(i)
      answers.push({ y: g.year, w: 'rival', m: r.m, d: Math.max(1, Math.floor(r.d / 2)), o: `f${r.o}` })
    })
    if (marked.size > 0) {
      cur = { ...cur, rows: rec.rows.map((r, i): FrontierRow => (marked.has(i) ? { ...r, f: 1 } : r)) }
      // One answer for a year and an origin: two rows of one origin in different years are followed by the same rival row.
      for (const a of answers) if (!cur.rows.some((r) => r.y === a.y && r.o === a.o)) cur = pushRow(cur, id, a, 0)
    }
  }
  return cur.rows.length === 0 && cur.fold === 0 && cur.pub === 0 ? null : cur
}

/**
 * The frontier's year: public research fades and rivals follow. Idempotent by shard.y; a no-op up to 2026, with no shard, or with no
 * field in it. Draws from the named stream only, logs nothing, and writes the shard root once.
 */
export function stepFrontier(g: GameState): void {
  if (g.year <= PRESENT_YEAR) return
  const shard = readFrontier(g)
  if (shard.y === g.year || Object.keys(shard.f).length === 0) return
  const f: Partial<Record<FieldId, FieldRec>> = {}
  for (const id of FIELD_IDS) {
    const rec = shard.f[id]
    if (rec === undefined) continue
    const next = stepField(g, id, rec)
    if (next !== null) f[id] = next
  }
  const next: FrontierShard = { v: 1, y: g.year, f }
  ensureWorld(g).frontier = next
}

/** The module registry's entry for the step: the frontier phase of the aging seam, between the world step and the society step. */
export const frontierModule: ModuleDef = {
  id: 'world.frontier',
  layer: 2,
  slices: ['world.frontier'],
  yearly: [{ seam: 'aging', phase: 'frontier', order: 10, run: stepFrontier }],
}
