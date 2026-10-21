// R2-A1: the parity kit. It records g.rng and a digest of ten non-text slices of a game state after every year of a
// seeded life, so a change that must not move a seeded run (the pickline codemod, E.T3) can prove it by replaying the
// same lives and comparing. The first fixture (test/fixtures/r2-parity.json) is recorded at the unmodified v4.1.1,
// before any pick is rewritten. A moved digest means a draw moved: a new draw, a removed draw, or a draw in a new order.
//
// A digest is eight hex digits of fnv1a (src/game/text/hash.ts) over a canonical JSON of a shallow projection of the
// state: keys sorted, a non-finite number written as a string (so NaN is not null and not 0), undefined skipped.
//
// The slices (one more, 'text', is only ever shown, never compared):
//   rng            g.rng
//   meta           version, year, generation, nextId, lifeId, ribbon
//   character      g.character without its memories
//   people         g.people with each person's notes taken out
//   assets         g.assets
//   counters       counters and yearActions
//   economy        flags.worldEconomy
//   flagsWorld, flagsPersonal, flagsCache
//                  every other flag, by classifyFlag (src/game/world-flags.ts); an unclassified key counts as
//                  personal; textMem and flavorRecent are in none of the three (they are text)
//   queue          structure only: kind, id, scriptId, source, personId, game and the choice ids. Titles, texts,
//                  emoji, tones, labels, hints and data are left out
//   text           the log, the memories, each person's notes, flags.textMem, flags.flavorRecent, the obituary and
//                  every queue title, text, label and hint
//
// No vitest imports here: like test/play-kit.ts and test/probe-life.ts it may run as a bundled script later.
import { fnv1a } from '../src/game/text/hash'
import type { GameState, ModalItem } from '../src/game/types'
import { classifyFlag } from '../src/game/world-flags'
import { playLife } from './play-kit'
import { probeLife } from './probe-life'

export const PARITY_SLICES = ['rng', 'meta', 'character', 'people', 'assets', 'counters', 'economy', 'flagsWorld', 'flagsPersonal', 'flagsCache', 'queue'] as const
export type ParitySlice = (typeof PARITY_SLICES)[number]
/** Eight lowercase hex digits per slice. */
export type ParityDigests = Record<ParitySlice | 'text', string>

/** Canonical JSON: keys sorted, `undefined` object members skipped (an array hole is null, as in JSON), non-finite numbers as strings. */
function canon(v: unknown): string {
  switch (typeof v) {
    case 'number':
      return Number.isFinite(v) ? JSON.stringify(v) : JSON.stringify('#' + String(v))
    case 'string':
      return JSON.stringify(v)
    case 'boolean':
      return v ? 'true' : 'false'
    case 'bigint':
      return JSON.stringify('#' + String(v) + 'n')
    case 'object': {
      if (v === null) return 'null'
      if (Array.isArray(v)) return '[' + Array.from(v, canon).join(',') + ']'
      const o = v as Record<string, unknown>
      const parts: string[] = []
      for (const k of Object.keys(o).sort()) {
        const x = o[k]
        if (x === undefined || typeof x === 'function' || typeof x === 'symbol') continue
        parts.push(JSON.stringify(k) + ':' + canon(x))
      }
      return '{' + parts.join(',') + '}'
    }
    default:
      return 'null'
  }
}

function digest(v: unknown): string {
  return fnv1a(canon(v)).toString(16).padStart(8, '0')
}

/** The flags that no other slice owns, split by class. */
const FLAGS_ELSEWHERE: ReadonlySet<string> = new Set(['worldEconomy', 'textMem', 'flavorRecent'])

function flagsByClass(flags: Record<string, unknown>): Record<'world' | 'personal' | 'cache', Record<string, unknown>> {
  const out: Record<'world' | 'personal' | 'cache', Record<string, unknown>> = { world: {}, personal: {}, cache: {} }
  for (const key of Object.keys(flags)) {
    if (FLAGS_ELSEWHERE.has(key)) continue
    out[classifyFlag(key) ?? 'personal'][key] = flags[key]
  }
  return out
}

interface LooseModal {
  kind?: unknown
  id?: unknown
  scriptId?: unknown
  source?: unknown
  personId?: unknown
  game?: unknown
  title?: unknown
  text?: unknown
  choices?: { id?: unknown; label?: unknown; hint?: unknown }[]
}

/** The shape of a queued popup: ids and routing, never words. */
function queueShape(m: ModalItem): unknown {
  const r = m as unknown as LooseModal
  return {
    kind: r.kind,
    id: r.id,
    scriptId: r.scriptId,
    source: r.source,
    personId: r.personId,
    game: r.game,
    choices: Array.isArray(r.choices) ? r.choices.map((c) => c.id) : undefined,
  }
}

/** The words of a queued popup: title, text, and each choice's label and hint. A built-in task has none and gives undefined. */
function queueWords(m: ModalItem): unknown {
  const r = m as unknown as LooseModal
  if (r.title === undefined && r.text === undefined && !Array.isArray(r.choices)) return undefined
  return [r.title, r.text, Array.isArray(r.choices) ? r.choices.map((c) => [c.label, c.hint]) : null]
}

/** Digest every slice of the state. A pure read: it never writes to `g`. */
export function parityDigests(g: GameState): ParityDigests {
  const { memories, ...character } = g.character
  const flags = flagsByClass(g.flags)
  return {
    rng: digest(g.rng),
    meta: digest({ version: g.version, year: g.year, generation: g.generation, nextId: g.nextId, lifeId: g.lifeId, ribbon: g.ribbon }),
    character: digest(character),
    people: digest(g.people.map(({ notes: _notes, ...rest }) => rest)),
    assets: digest(g.assets),
    counters: digest({ counters: g.counters, yearActions: g.yearActions }),
    economy: digest(g.flags.worldEconomy),
    flagsWorld: digest(flags.world),
    flagsPersonal: digest(flags.personal),
    flagsCache: digest(flags.cache),
    queue: digest(g.queue.map(queueShape)),
    text: digest({
      log: g.log,
      memories,
      notes: g.people.map((p) => [p.id, p.notes]),
      textMem: g.flags.textMem,
      flavorRecent: g.flags.flavorRecent,
      obituary: g.obituary,
      queue: g.queue.map(queueWords).filter((w) => w !== undefined),
    }),
  }
}

export interface ParityLife {
  id: string
  /** 'birth' is playLife (every popup answered); 'founder' is probeLife (an adult with companies, popups never shown). */
  kind: 'birth' | 'founder'
  seed: number
  birthYear: number
  /** Birth lives: stop at this age (default 40). */
  untilAge?: number
  /** Birth lives: money set to 60,000,000 at 25, so the wealth events run. */
  rich?: boolean
  /** Founder lives: companies owned at 30 (default 1). */
  businesses?: number
  /** Founder lives: years lived from 30 on (default 25). */
  years?: number
}

type Extra = Pick<ParityLife, 'untilAge' | 'rich' | 'businesses' | 'years'>

// Tuples, not object literals, so the seed-pin ratchet (R2-B1) does not count them: [id, kind, seed, birthYear, extra].
// The seeds were chosen at the unmodified base (101 to 112, then the next free one when a seed failed): a birth life must
// reach 30 (103 died at 23 in 1975, so b1975 takes 113), a founder must not make probeLife throw (it throws when fewer
// than `businesses` industries are open to a founder in that country and year) and is better alive at the end (110
// died at 40 in 1975, so f1975-2x25 takes 103). All 12 survive to the end of their trace.
const LIVES: ReadonlyArray<readonly [id: string, kind: ParityLife['kind'], seed: number, birthYear: number, extra: Extra]> = [
  ['b1925', 'birth', 101, 1925, {}],
  ['b1950', 'birth', 102, 1950, {}],
  ['b1975', 'birth', 113, 1975, {}],
  ['b1990', 'birth', 104, 1990, {}],
  ['b2010', 'birth', 105, 2010, {}],
  ['b1960-rich', 'birth', 106, 1960, { rich: true }],
  ['b2000-rich', 'birth', 107, 2000, { rich: true }],
  ['b1985', 'birth', 108, 1985, {}],
  ['f1950-1x25', 'founder', 109, 1950, { businesses: 1, years: 25 }],
  ['f1975-2x25', 'founder', 103, 1975, { businesses: 2, years: 25 }],
  ['f1990-3x25', 'founder', 111, 1990, { businesses: 3, years: 25 }],
  ['f1950-1x30', 'founder', 112, 1950, { businesses: 1, years: 30 }],
]

export const PARITY_LIVES: readonly ParityLife[] = LIVES.map(([id, kind, seed, birthYear, extra]) => ({ id, kind, seed, birthYear, ...extra }))

/** Per year: the PARITY_SLICES digests in order, then the 'text' digest. Row 0 is the state before the first year. */
export interface ParityTrace {
  id: string
  years: string[][]
}

const ROW_LENGTH = PARITY_SLICES.length + 1

function rowOf(d: ParityDigests): string[] {
  return [...PARITY_SLICES.map((s) => d[s]), d.text]
}

/** Play the life through the real yearly loop and digest the state after birth and after every year. */
export function traceLife(life: ParityLife): ParityTrace {
  const years: string[][] = []
  const onYear = (g: GameState): void => {
    years.push(rowOf(parityDigests(g)))
  }
  if (life.kind === 'birth') {
    playLife({ seed: life.seed, birthYear: life.birthYear, untilAge: life.untilAge ?? 40, rich: life.rich ?? false, onYear })
  } else {
    probeLife({ seed: life.seed, birthYear: life.birthYear, businesses: life.businesses ?? 1, years: life.years ?? 25, onYear })
  }
  return { id: life.id, years }
}

export interface Divergence {
  life: string
  /** Index into the trace's years: 0 is the state after birth, 7 is after the seventh year. */
  year: number
  slices: ParitySlice[]
}

/** Every (life, year) where a non-text slice differs, in life and year order. The 'text' column is never compared. Lists of a different shape throw. */
export function compareTraces(a: readonly ParityTrace[], b: readonly ParityTrace[]): Divergence[] {
  if (a.length !== b.length) throw new Error(`compareTraces: ${a.length} lives against ${b.length} lives`)
  const out: Divergence[] = []
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.id !== y.id) throw new Error(`compareTraces: life ${x.id} against life ${y.id}`)
    if (x.years.length !== y.years.length) throw new Error(`compareTraces: ${x.id} has ${x.years.length} years against ${y.years.length} years`)
    for (let t = 0; t < x.years.length; t++) {
      if (x.years[t].length !== ROW_LENGTH || y.years[t].length !== ROW_LENGTH) {
        throw new Error(`compareTraces: ${x.id} year ${t} has ${x.years[t].length} and ${y.years[t].length} slices, expected ${ROW_LENGTH}`)
      }
      const slices = PARITY_SLICES.filter((_, j) => x.years[t][j] !== y.years[t][j])
      if (slices.length > 0) out.push({ life: x.id, year: t, slices })
    }
  }
  return out
}

export interface ParityFixture {
  v: 1
  /** Where the digests were recorded, e.g. 'base a65349a: v4.1.1, before the pickline codemod'. */
  source: string
  /** [...PARITY_SLICES, 'text'] */
  slices: string[]
  lives: ParityTrace[]
}
