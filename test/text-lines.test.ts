// The table lint (R2-P8, E.T3 b): every row of STATE_TABLE obeys the voice guide and the memory's key rules.
// R2-P9 adds rows, and this loop checks each of them with no further test. R2-P10 adds the lint of the event pools at the end
// (lintPool and POOLS: one row per pool that a status or event line of the repeat worklist speaks through).
// The lint itself is lintStateRow(): the loop runs it on the real table, and the synthetic cases at the end run it on rows
// built to break each rule, so a rule that stopped checking would show here even while the real table is short.
import { describe, expect, it } from 'vitest'
import { LIMITS, staticLength, unitFlags } from '../scripts/voice/rules.mjs'
import { futureHeadlines, GAMES_HEADLINES, WORLD_CUP_HEADLINES } from '../src/game/history/events-future'
import { eraSafe } from '../src/game/history/events-guard'
import { BOUNDARY_LINES } from '../src/game/events/wealth-resolve'
import { ADMIRER_LINES, SCAM_LINES } from '../src/game/events/wealth-world'
import { PROMO_LINES } from '../src/game/npc-lives'
import { PRO_SEASON_LINES } from '../src/game/special/athlete'
import { isMemKey } from '../src/game/text/memory'
import { defineLines, registeredLines } from '../src/game/text/registry'
import { STATE_TABLE, type StateSpec } from '../src/game/text/state-table'
import {
  AIR_RAID_LINES,
  AVOIDING_LINES,
  BROKER_LINES,
  CHILD_UNCURED_LINES,
  DONATED_LINES,
  ENDORSE_RENEWED_LINES,
  FAVOR_DONE_LINES,
  FAVOR_REFUSED_LINES,
  GAVE_LINES,
  HOME_BOUGHT_LINES,
  HOMELESS_LINES,
  LENT_LINES,
  NOTEBOOK_FULL_LINES,
  REFUSED_LINES,
  RESIGN_LINES,
  VENTURE_LOST_LINES,
  VOUCH_LINES,
} from '../src/game/text/pools'

const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)
const SLOT_RE = /\{([^{}]*)\}/g
const PLAIN_WORD = /^[A-Za-z][A-Za-z0-9]*$/

/** The probes a band function must answer with a whole number from 0 to 99. */
const BAND_PROBES = [0, -1, -1e12, Number.NaN, 1e12, 1, 0.5, 7, 100, 1e6, 1e300, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

/** What is wrong with one row, as short messages; an empty list is a clean row. */
function lintStateRow(key: string, spec: StateSpec): string[] {
  const bad: string[] = []
  if (key.length > 32) bad.push(`key longer than 32 characters`)
  if (!isMemKey(key)) bad.push(`key is not a valid memory key`)
  const n = spec.variants.length
  if (n < 3 || n > 6) bad.push(`${n} variants, want 3 to 6`)
  if (new Set(spec.variants).size !== n) bad.push(`a variant appears twice`)
  spec.variants.forEach((text, i) => {
    const at = `variant ${i}`
    if (typeof text !== 'string' || text.length === 0) {
      bad.push(`${at} is empty`)
      return
    }
    // Every {slot} stands for one hole of the voice tools; any brace left over is a typo.
    const slots = [...text.matchAll(SLOT_RE)].map((m) => m[1])
    for (const slot of slots) if (!PLAIN_WORD.test(slot)) bad.push(`${at}: slot {${slot}} is not a plain word`)
    const holed = text.replace(SLOT_RE, '${...}')
    if (/[{}]/.test(text.replace(SLOT_RE, ''))) bad.push(`${at}: a stray brace`)
    if (staticLength(holed) > LIMITS.log) bad.push(`${at}: ${staticLength(holed)} static characters, cap ${LIMITS.log}`)
    const flags = unitFlags(holed, 'log')
    if (flags.length) bad.push(`${at}: voice flags ${flags.join(', ')}`)
    if (text.includes(EM_DASH) || text.includes(EN_DASH)) bad.push(`${at}: a long dash`)
  })
  for (const probe of BAND_PROBES) {
    let b: unknown
    try {
      b = spec.band(probe)
    } catch {
      bad.push(`band throws on ${probe}`)
      continue
    }
    if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b > 99) bad.push(`band(${probe}) is ${String(b)}, want a whole number from 0 to 99`)
  }
  if (spec.every !== undefined && (!Number.isInteger(spec.every) || spec.every < 0)) bad.push(`every must be a whole number, 0 or more`)
  if (spec.gap !== undefined && (!Number.isInteger(spec.gap) || spec.gap < 1)) bad.push(`gap must be a whole number, 1 or more`)
  return bad
}

describe('STATE_TABLE', () => {
  it('lints clean, row by row', () => {
    for (const [key, spec] of Object.entries(STATE_TABLE as Record<string, StateSpec>)) expect(lintStateRow(key, spec), key).toEqual([])
  })

  it('has keys that are valid memory keys and not inherited names', () => {
    for (const key of Object.keys(STATE_TABLE)) {
      expect(['__proto__', 'constructor', 'toString', 'hasOwnProperty'], key).not.toContain(key)
      expect(isMemKey(key), key).toBe(true)
    }
  })
})

// R2-P9: the nine rows the status-line sites call. Each site fills the slots listed here and no others, so a variant that
// names {mony} (or a slot its site does not have) would print an empty hole: the lint above cannot see that, this can.
const SITE_SLOTS: Readonly<Record<string, readonly string[]>> = {
  'around.growth': ['cause'],
  'around.credit': ['cause'],
  'around.supply': ['cause'],
  'index.crash': ['index', 'move'],
  'index.boom': ['index', 'move'],
  'endorse.income': ['money'],
  'allowance.one': ['money'],
  'allowance.many': ['money', 'count'],
  'loan.back': ['who', 'whom', 'he', 'money', 'left'],
}

describe('the rows of R2-P9', () => {
  it('are the nine of the worklist', () => {
    expect(Object.keys(STATE_TABLE).sort()).toEqual(Object.keys(SITE_SLOTS).sort())
  })

  it('use only the slots their call sites fill, and every slot the site fills is used by some variant', () => {
    for (const [key, spec] of Object.entries(STATE_TABLE as Record<string, StateSpec>)) {
      const filled = SITE_SLOTS[key] ?? []
      const used = new Set<string>()
      for (const text of spec.variants) for (const m of text.matchAll(SLOT_RE)) used.add(m[1])
      for (const slot of used) expect(filled, `${key}: {${slot}} is not filled by its call site`).toContain(slot)
      for (const slot of filled) expect([...used], `${key}: the site fills {${slot}} and no variant uses it`).toContain(slot)
    }
  })

  it('keep a slot filled with the same words in every variant of a row, so a speaker reads the same in each', () => {
    // Every variant of a row names the same facts: the slots one variant uses, the others use too, apart from the person's
    // two spellings in the loan row ({who} opens a sentence, {whom} sits inside one, {he} only in the first variant).
    for (const [key, spec] of Object.entries(STATE_TABLE as Record<string, StateSpec>)) {
      if (key === 'loan.back') continue
      const sets = spec.variants.map((t) => [...new Set([...t.matchAll(SLOT_RE)].map((m) => m[1]))].sort().join(','))
      expect(new Set(sets).size, `${key}: variants name different slots (${sets.join(' | ')})`).toBe(1)
    }
  })
})

describe('the lint itself', () => {
  const GOOD: StateSpec = {
    variants: ['Money got tight around me. {cause}', 'Times got harder in my town. {cause}', 'The squeeze reached my whole street. {cause}'],
    band: (v) => (v > 0 ? 1 : 0),
  }

  it('passes a good row, with and without slots, and a row of six', () => {
    expect(lintStateRow('around.growth', GOOD)).toEqual([])
    expect(lintStateRow('plain', { variants: ['I paid rent.', 'Rent went out again.', 'The landlord took his share.'], band: () => 0, every: 0, gap: 3 })).toEqual([])
    expect(lintStateRow('six', { variants: ['One of {a}.', 'Two of {a}.', 'Three of {a}.', 'Four of {a}.', 'Five of {a}.', 'Six of {a}.'], band: () => 0 })).toEqual([])
  })

  it('flags the number of variants', () => {
    expect(lintStateRow('few', { ...GOOD, variants: GOOD.variants.slice(0, 2) }).join('|')).toMatch(/2 variants, want 3 to 6/)
    expect(lintStateRow('many', { ...GOOD, variants: [...GOOD.variants, 'Four.', 'Five.', 'Six.', 'Seven.'] }).join('|')).toMatch(/7 variants, want 3 to 6/)
    expect(lintStateRow('twin', { ...GOOD, variants: [GOOD.variants[0], GOOD.variants[0], GOOD.variants[1]] }).join('|')).toMatch(/appears twice/)
  })

  it('flags a variant over 90 static characters, and counts a slot as nothing', () => {
    const long = 'I kept saving what I could, and I kept it in a jar by the window where the light came in every morning.'
    expect(long.length).toBeGreaterThan(90)
    expect(lintStateRow('long', { ...GOOD, variants: [long, GOOD.variants[1], GOOD.variants[2]] }).join('|')).toMatch(/static characters, cap 90/)
    const slotty = 'I paid {money} to {who} and {count} others, and it went on {when} and on {where} and so on {how}.'
    const flagged = lintStateRow('slotty', { ...GOOD, variants: [slotty, GOOD.variants[1], GOOD.variants[2]] }).join('|')
    expect(flagged).not.toMatch(/static characters/)
  })

  it('flags the voice rules of docs/VOICE.md: no contraction, a chatbot opener, a feeling to end on', () => {
    const run = (text: string): string => lintStateRow('v', { ...GOOD, variants: [text, GOOD.variants[1], GOOD.variants[2]] }).join('|')
    expect(run('I did not pay {money} this year.')).toMatch(/no-contraction/)
    expect(run('Consider the {money} I paid.')).toMatch(/chatbot/)
    expect(run('I paid {money} and felt proud.')).toMatch(/feeling-end/)
    expect(run('Nobody paid me {money} this year.')).toMatch(/nobody/)
    expect(run('Everyone paid me {money} this year.')).toMatch(/everyone/)
  })

  it('flags a long dash of either kind', () => {
    const run = (text: string): string => lintStateRow('d', { ...GOOD, variants: [text, GOOD.variants[1], GOOD.variants[2]] }).join('|')
    expect(run(`I paid ${EM_DASH} again.`)).toMatch(/long dash/)
    expect(run(`I paid ${EN_DASH} again.`)).toMatch(/long dash/)
  })

  it('flags a slot that is not a plain word, and a stray brace', () => {
    const run = (text: string): string => lintStateRow('s', { ...GOOD, variants: [text, GOOD.variants[1], GOOD.variants[2]] }).join('|')
    expect(run('I paid {the money} today.')).toMatch(/not a plain word/)
    expect(run('I paid {} today.')).toMatch(/not a plain word/)
    expect(run('I paid {2x} today.')).toMatch(/not a plain word/)
    expect(run('I paid {money today.')).toMatch(/stray brace/)
    expect(run('I paid money} today.')).toMatch(/stray brace/)
  })

  it('flags a band that is not a whole number from 0 to 99 for every probe, or that throws', () => {
    expect(lintStateRow('b', { ...GOOD, band: (v) => v }).join('|')).toMatch(/band\(/)
    expect(lintStateRow('b', { ...GOOD, band: () => 100 }).join('|')).toMatch(/band\(/)
    expect(lintStateRow('b', { ...GOOD, band: () => -1 }).join('|')).toMatch(/band\(/)
    expect(lintStateRow('b', { ...GOOD, band: () => 1.5 }).join('|')).toMatch(/band\(/)
    expect(lintStateRow('b', { ...GOOD, band: () => Number.NaN }).join('|')).toMatch(/band\(/)
    expect(lintStateRow('b', { ...GOOD, band: () => { throw new Error('no') } }).join('|')).toMatch(/band throws/)
  })

  it('flags a key that is too long or not a memory key', () => {
    expect(lintStateRow('k'.repeat(33), GOOD).join('|')).toMatch(/longer than 32/)
    expect(lintStateRow('1abc', GOOD).join('|')).toMatch(/not a valid memory key/)
    expect(lintStateRow('has space', GOOD).join('|')).toMatch(/not a valid memory key/)
  })

  it('flags an every or a gap that cannot work', () => {
    expect(lintStateRow('e', { ...GOOD, every: -1 }).join('|')).toMatch(/every must be/)
    expect(lintStateRow('e', { ...GOOD, every: 2.5 }).join('|')).toMatch(/every must be/)
    expect(lintStateRow('g', { ...GOOD, gap: 0 }).join('|')).toMatch(/gap must be/)
    expect(lintStateRow('g', { ...GOOD, gap: 1.5 }).join('|')).toMatch(/gap must be/)
  })
})

// ---- R2-P10: the pools of the lines that need variants ---------------------------------------------------------------------

/** One pool an event or report line is drawn from, and what its call site fills. */
interface PoolSpec {
  /** The id it is registered under (defineLines). */
  id: string
  lines: readonly string[]
  /** The voice role: a headline is held to the headline caps, everything else to the log's. */
  role: 'log' | 'headline'
  /** The {slots} the call site fills: every line names exactly these and no others. */
  slots: readonly string[]
  /** How the line reaches the log when the call site puts something around it (npc-lives puts the person's name before it). */
  frame?: (line: string) => string
}

/** What is wrong with one pool, as short messages; an empty list is a clean pool. */
function lintPool(spec: PoolSpec): string[] {
  const bad: string[] = []
  const { id, lines, role } = spec
  const cap = role === 'headline' ? LIMITS.headline : LIMITS.log
  if (!Array.isArray(lines)) return [`${id}: not a list of lines`]
  if (lines.length < 3) bad.push(`${lines.length} lines, want at least 3`)
  if (registeredLines().get(id) !== lines) bad.push(`not registered under ${id}`)
  if (!isMemKey(id)) bad.push(`${id} is not a valid memory key`)
  if (new Set(lines).size !== lines.length) bad.push('a line appears twice')
  lines.forEach((raw, i) => {
    const at = `line ${i}`
    if (typeof raw !== 'string' || raw.length === 0) {
      bad.push(`${at} is empty`)
      return
    }
    const names = [...new Set([...raw.matchAll(SLOT_RE)].map((m) => m[1]))].sort()
    if (names.join(',') !== [...spec.slots].sort().join(',')) bad.push(`${at}: names slots [${names.join(',')}], the call site fills [${[...spec.slots].join(',')}]`)
    for (const name of names) if (!PLAIN_WORD.test(name)) bad.push(`${at}: slot {${name}} is not a plain word`)
    if (/[{}]/.test(raw.replace(SLOT_RE, ''))) bad.push(`${at}: a stray brace`)
    const holed = (spec.frame ? spec.frame(raw) : raw).replace(SLOT_RE, '${...}')
    if (staticLength(holed) > cap) bad.push(`${at}: ${staticLength(holed)} static characters, cap ${cap}`)
    const flags = unitFlags(holed, role)
    if (flags.length) bad.push(`${at}: voice flags ${flags.join(', ')}`)
    if (raw.includes(EM_DASH) || raw.includes(EN_DASH)) bad.push(`${at}: a long dash`)
  })
  return bad
}

const POOLS: readonly PoolSpec[] = [
  { id: 'news.games', lines: GAMES_HEADLINES, role: 'headline', slots: [] },
  { id: 'news.worldCup', lines: WORLD_CUP_HEADLINES, role: 'headline', slots: [] },
  { id: 'athlete.proSeason', lines: PRO_SEASON_LINES, role: 'log', slots: ['nth', 'team', 'stats'] },
  { id: 'wealth.scam', lines: SCAM_LINES, role: 'log', slots: ['money'] },
  { id: 'wealth.admirer', lines: ADMIRER_LINES, role: 'log', slots: ['money'] },
  { id: 'wealth.boundary', lines: BOUNDARY_LINES, role: 'log', slots: ['who'] },
  // The log puts the person's name and a colon before this one: judged with that frame on.
  { id: 'npc.promotion', lines: PROMO_LINES, role: 'log', slots: [], frame: (line) => `{name}: ${line}` },
  // R3-Q13: the lines that used to be one sentence every time (the same line never twice within 10 years).
  { id: 'npc.homeBought', lines: HOME_BOUGHT_LINES, role: 'log', slots: [], frame: (line) => `{name}: ${line}` },
  { id: 'career.resign', lines: RESIGN_LINES, role: 'log', slots: ['who'] },
  { id: 'sports.endorseRenewed', lines: ENDORSE_RENEWED_LINES, role: 'log', slots: ['brand'] },
  { id: 'workshop.notebookFull', lines: NOTEBOOK_FULL_LINES, role: 'log', slots: [] },
  { id: 'wealth.avoiding', lines: AVOIDING_LINES, role: 'log', slots: ['who'] },
  { id: 'wealth.refused', lines: REFUSED_LINES, role: 'log', slots: ['what', 'who'] },
  { id: 'wealth.gave', lines: GAVE_LINES, role: 'log', slots: ['money', 'what', 'who'] },
  { id: 'wealth.lent', lines: LENT_LINES, role: 'log', slots: ['money', 'what', 'who'] },
  { id: 'wealth.ventureLost', lines: VENTURE_LOST_LINES, role: 'log', slots: ['money', 'what'] },
  { id: 'charity.donated', lines: DONATED_LINES, role: 'log', slots: ['charity', 'money'] },
  { id: 'history.airRaid', lines: AIR_RAID_LINES, role: 'log', slots: [] },
  { id: 'health.childUncured', lines: CHILD_UNCURED_LINES, role: 'log', slots: ['label', 'who'] },
  { id: 'finance.homeless', lines: HOMELESS_LINES, role: 'log', slots: [] },
  // R4-E10a: the favor acts name the person (the giver, and the third person or the relative where there is one).
  { id: 'social.favorDone', lines: FAVOR_DONE_LINES, role: 'log', slots: ['who'] },
  { id: 'social.favorRefused', lines: FAVOR_REFUSED_LINES, role: 'log', slots: ['who'] },
  { id: 'social.vouch', lines: VOUCH_LINES, role: 'log', slots: ['third', 'who'] },
  { id: 'social.broker', lines: BROKER_LINES, role: 'log', slots: ['who', 'whom'] },
]

describe('the pools of R2-P10', () => {
  for (const spec of POOLS) {
    it(`${spec.id}: at least 3 lines, registered, in voice, and no slot but the ones its site fills`, () => {
      expect(lintPool(spec), spec.id).toEqual([])
    })
  }

  it('the lint itself: flags a short pool, an unregistered one, a slot the site does not fill, and a line over the cap', () => {
    const good = defineLines('test.lint', ['I lost {money} to a scam.', 'The {money} I sent was gone for good.', 'I got scammed out of {money}.'])
    const spec = (lines: readonly string[], over: Partial<PoolSpec> = {}): PoolSpec => ({ id: 'test.lint', lines, role: 'log', slots: ['money'], ...over })
    const bad = (lines: readonly string[], over: Partial<PoolSpec> = {}): string => lintPool(spec(lines, over)).join('|')
    expect(lintPool(spec(good))).toEqual([])
    // Registration is by identity: a copy of the lines is not the registered pool.
    expect(bad([...good])).toMatch(/not registered under test.lint/)
    expect(bad(good.slice(0, 2))).toMatch(/2 lines, want at least 3/)
    expect(bad([...good.slice(0, 2), 'I lost it to a scam.'])).toMatch(/names slots \[\]/)
    expect(bad([...good.slice(0, 2), 'I lost {sum} to a scam.'])).toMatch(/names slots \[sum\]/)
    expect(bad([...good.slice(0, 2), 'I lost {money} to a scam. {money}'])).not.toMatch(/names slots/)
    expect(bad([...good.slice(0, 2), good[0]])).toMatch(/appears twice/)
    expect(bad([...good.slice(0, 2), 'I kept {money} in a jar by the window where the light came in every single morning, and then one day I lost every bit of it.'])).toMatch(/static characters, cap 90/)
    const headline = 'The Games open and the whole world tunes in to watch the opening night live'
    expect(bad([headline, 'A', 'B'], { role: 'headline', slots: [] })).toMatch(/static characters, cap 70/)
    expect(bad([...good.slice(0, 2), `I lost {money} ${EM_DASH} gone.`])).toMatch(/long dash/)
    expect(bad([...good.slice(0, 2), 'I did not lose {money} to a scam.'])).toMatch(/no-contraction/)
    expect(bad([...good.slice(0, 2), 'I lost {the money} to a scam.'])).toMatch(/not a plain word/)
    expect(bad([...good.slice(0, 2), 'I lost {money to a scam.'])).toMatch(/stray brace/)
  })
})

// ---- R2-P10: the Games and the World Cup, after the dates on the calendar run out --------------------------------------------

const fnv = (text: string): string => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** The headline of one kind in a future year: the Summer Games ('games'), the World Cup ('cup') or the Winter Games ('winter'). */
function rhythmLine(year: number, kind: 'games' | 'cup' | 'winter'): string[] {
  const re = kind === 'games' ? /Olympics|Games/ : kind === 'cup' ? /World Cup/ : /Winter/
  return futureHeadlines(year)
    .filter((r) => r[1] === 'sport' && r[3] === 'world' && re.test(r[4]) && (kind === 'winter' || !/Winter/.test(r[4])))
    .map((r) => r[4])
}

describe('the rhythm headlines after 2034', () => {
  const GAMES = Array.from({ length: 17 }, (_, i) => 2036 + 4 * i)
  const CUP = Array.from({ length: 16 }, (_, i) => 2038 + 4 * i)

  it('one Summer Games line in every fourth year from 2036, one World Cup line from 2038, and nothing in the years between', () => {
    for (let y = 2035; y <= 2100; y++) {
      expect(rhythmLine(y, 'games'), `${y} games`).toHaveLength(y % 4 === 0 ? 1 : 0)
      expect(rhythmLine(y, 'cup'), `${y} cup`).toHaveLength(y % 4 === 2 ? 1 : 0)
    }
  })

  it('two editions in a row never read the same, and a line does not come back within three editions', () => {
    for (const [name, years] of [['Games', GAMES], ['World Cup', CUP]] as const) {
      const lines = years.map((y) => rhythmLine(y, name === 'Games' ? 'games' : 'cup')[0])
      for (let i = 0; i + 2 < lines.length; i++) {
        expect(new Set([lines[i], lines[i + 1], lines[i + 2]]).size, `${name}: editions ${years[i]}, ${years[i + 1]}, ${years[i + 2]} read ${lines.slice(i, i + 3).join(' | ')}`).toBe(3)
      }
    }
  })

  it('draws every line of its pool, and only those', () => {
    expect(new Set(GAMES.map((y) => rhythmLine(y, 'games')[0]))).toEqual(new Set(GAMES_HEADLINES))
    expect(new Set(CUP.map((y) => rhythmLine(y, 'cup')[0]))).toEqual(new Set(WORLD_CUP_HEADLINES))
  })

  it('names no invention that a country does not have in that year', () => {
    for (const line of [...GAMES_HEADLINES, ...WORLD_CUP_HEADLINES]) {
      for (const country of ['us', 'ng', 'jp', 'br', 'in']) for (const year of [2036, 2038, 2070, 2110]) expect(eraSafe(line, country, year), `${line} (${country}, ${year})`).toBe(true)
    }
  })

  it('is a pure function of the year: the same on every call, in any order', () => {
    const forward = [...GAMES, ...CUP].map((y) => futureHeadlines(y))
    const backward = [...GAMES, ...CUP].reverse().map((y) => futureHeadlines(y)).reverse()
    expect(backward).toEqual(forward)
    expect(futureHeadlines(2060)).toEqual(futureHeadlines(2060))
  })

  it('keeps the Winter Games line and the rest of the calendar as they were: only the Summer Games and World Cup rhythm lines changed', () => {
    for (const y of CUP) expect(rhythmLine(y, 'winter'), String(y)).toEqual(['The Winter Olympics open'])
    // Every other row of every year from 2027 to 2100 (the calendar, the pool, the Winter Games), fingerprinted before R2-P10.
    const rows = []
    for (let y = 2027; y <= 2100; y++) for (const r of futureHeadlines(y)) if (!(y > 2034 && (rhythmLine(y, 'games').includes(r[4]) || rhythmLine(y, 'cup').includes(r[4])))) rows.push(r)
    expect(rows).toHaveLength(111)
    expect(fnv(JSON.stringify(rows))).toBe('ad1fa38f')
    // The rhythm rows keep their kind, severity and reach; only the words changed.
    const rhythm = []
    for (let y = 2027; y <= 2100; y++) for (const r of futureHeadlines(y)) if (y > 2034 && (rhythmLine(y, 'games').includes(r[4]) || rhythmLine(y, 'cup').includes(r[4]))) rhythm.push([y, r[1], r[2], r[3]])
    expect(rhythm).toHaveLength(33)
    expect(fnv(JSON.stringify(rhythm))).toBe('51b76efe')
  })

  it('gives years before 2035 the old pool: no rhythm line at all', () => {
    for (let y = 2027; y <= 2034; y++) {
      expect(rhythmLine(y, 'games').filter((t) => (GAMES_HEADLINES as readonly string[]).includes(t)), String(y)).toEqual([])
      expect(rhythmLine(y, 'cup').filter((t) => (WORLD_CUP_HEADLINES as readonly string[]).includes(t)), String(y)).toEqual([])
    }
    expect(futureHeadlines(2026)).toEqual([])
  })
})
