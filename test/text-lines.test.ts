// The table lint (R2-P8, E.T3 b): every row of STATE_TABLE obeys the voice guide and the memory's key rules.
// R2-P9 adds rows, and this loop checks each of them with no further test. R2-P10 adds the lint of the event pools here.
// The lint itself is lintStateRow(): the loop runs it on the real table, and the synthetic cases at the end run it on rows
// built to break each rule, so a rule that stopped checking would show here even while the real table is short.
import { describe, expect, it } from 'vitest'
import { LIMITS, staticLength, unitFlags } from '../scripts/voice/rules.mjs'
import { isMemKey } from '../src/game/text/memory'
import { STATE_TABLE, type StateSpec } from '../src/game/text/state-table'

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
