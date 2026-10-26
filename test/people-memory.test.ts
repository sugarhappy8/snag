// ci: fast
// R4-U10 (People UI and fog track, X45, X57): the memory lines of "Shared history". On a life the social flag stamped, the card starts with
// what the person remembers: up to three short sentences, the strongest memory first, each with its year. memoryLines (src/game/hubs/
// people-memory.ts) builds them from the memories of the edge `person > player` and PersonProfile.tsx draws them above the notes.
//
//   table       MEMORY_PHRASE holds two sentences for each of the 40 kinds of MEMORY_KINDS, one for each side of `by` (you did it, they did
//               it), each with one {name} slot. It is a frozen table (cross-check section 3.3, X57): the lead reads the values at the merge,
//               and a change after R4 needs a RECORD_REASON. The shape tests below prove the count, the length, the dash and the voice;
//               they fail the day R6 appends a kind without a phrase, by design (X45)
//   lines       [] unless the life is stamped; the memories of the edge, strongest weight first and then the newest, at most n (3), each
//               `${phrase} (${year})`; a phrase is a fact label, so the same memory reads the same and nothing is picked or drawn
//   hostile     an edge of garbage, 100 memories, a name of 500 characters or a number as n gives at most three plain lines
//   pure        a frozen game with its dice trapped, the same lines twice, nothing written
//   page        PersonProfile draws the lines first in the card, the card appears for memories alone, and a life that is not stamped draws
//               the page it drew before
//
// The suite runs in Exact (test/setup-exact.ts). A Realistic case goes through inFog; the flag is always named with withFlags.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BANNED_ANYWHERE, unitFlags } from '../scripts/voice/rules.mjs'
import { withFlags } from '../src/game/flags'
import { MEMORY_PHRASE, memoryLines } from '../src/game/hubs/people-memory'
import { personEntity } from '../src/game/kernel/person-ref'
import { PEOPLE_CAPS } from '../src/game/people-fog'
import type { GameState, Person } from '../src/game/types'
import { EDGE_CAPS } from '../src/game/world/caps'
import { MEMORY_KINDS, formatMemory, type MemoryKind } from '../src/game/world/edge-memory'
import { putEdge, remember } from '../src/game/world/edge-write'
import type { Edge } from '../src/game/world/edges'
import { playerRef } from '../src/game/world/people'
import { PersonProfile } from '../src/ui/components/PersonProfile'
import { trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { inFog } from './knowledge-kit'
import { cast, socialGame } from './social-kit'

const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)
const BY = ['ego', 'them'] as const
type By = (typeof BY)[number]
const NAME = 'Marisol'
const E = (over: Partial<Edge> = {}): Edge => ({ t: 50, f: 50, r: 50, s: 0, o: 0, y: 2000, l: 2026, ...over })
const mem = (kind: MemoryKind, year: number, w: 1 | 2 | 3 = 3, by: By = 'ego'): string => formatMemory({ kind, year, w, by })
const keyOf = (g: GameState, p: Person): string => `${personEntity(p)}>${playerRef(g)}`
/** A phrase with its slot filled: what a line says before the year. */
const said = (kind: MemoryKind, by: By, name = NAME): string => MEMORY_PHRASE[kind][by].replace('{name}', () => name)

/** A stamped game with one named friend whose edge carries these memories. */
function withMemories(memories: string[], seed = 1): { g: GameState; p: Person } {
  const g = socialGame(seed)
  const p = cast(g, 50, 'friend', { firstName: NAME, lastName: 'Vale' })
  expect(putEdge(g, keyOf(g, p), E({ m: memories }))).toBe(true)
  return { g, p }
}

/** Every fault of a phrase table against a list of kinds, one line each. The real check below runs it on the real data, and the self-test on a longer list. */
function phraseProblems(kinds: readonly string[], table: Readonly<Record<string, unknown>>): string[] {
  const out: string[] = []
  for (const k of kinds) if (!Object.prototype.hasOwnProperty.call(table, k)) out.push(`${k} has no phrase`)
  for (const k of Object.keys(table)) if (!kinds.includes(k)) out.push(`${k} is not a kind`)
  if (out.length === 0 && Object.keys(table).join(',') !== kinds.join(',')) out.push('the rows are not in the order of the kinds')
  return out
}

/** The words of a rendered tree: tags dropped, the entities React writes turned back, white space collapsed. */
function plain(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------------------------------------------------
// The frozen table

describe('MEMORY_PHRASE, the frozen table (X57)', () => {
  it('has a phrase for each of the 40 kinds, in the order of MEMORY_KINDS, and nothing else', () => {
    expect(MEMORY_KINDS).toHaveLength(40)
    expect(phraseProblems(MEMORY_KINDS, MEMORY_PHRASE)).toEqual([])
  })

  it('fails the day R6 appends a kind without a phrase, by design (X45)', () => {
    expect(phraseProblems([...MEMORY_KINDS, 'new_kind'], MEMORY_PHRASE)).toEqual(['new_kind has no phrase'])
    expect(phraseProblems(MEMORY_KINDS.slice(0, 39), MEMORY_PHRASE)).toEqual([`${MEMORY_KINDS[39]!} is not a kind`])
    expect(phraseProblems([...MEMORY_KINDS].reverse(), MEMORY_PHRASE)).toEqual(['the rows are not in the order of the kinds'])
  })

  it('gives each kind two sentences, you did it and they did it, each with one {name} slot and at most 60 characters', () => {
    for (const k of MEMORY_KINDS) {
      const row = MEMORY_PHRASE[k]
      expect(Object.keys(row), k).toEqual(['ego', 'them'])
      for (const by of BY) {
        const text = row[by]
        const where = `${k} (${by}): ${text}`
        expect(typeof text, where).toBe('string')
        expect(text.split('{name}').length - 1, where).toBe(1)
        expect(text.replace('{name}', '').includes('{'), where).toBe(false)
        expect(text.length, where).toBeLessThanOrEqual(60)
        expect(text, where).not.toMatch(DASHES)
        expect(text, where).toBe(text.trim())
        expect(text, where).not.toMatch(/\s{2,}|\$|[\r\n\t]/)
        expect(text.endsWith('.'), where).toBe(false)
      }
    }
  })

  it('reads right from both ends: you did it starts with You, they did it starts with the name and says you, and the two differ', () => {
    for (const k of MEMORY_KINDS) {
      const { ego, them } = MEMORY_PHRASE[k]
      expect(ego.startsWith('You '), `${k}: ${ego}`).toBe(true)
      expect(them.startsWith('{name} '), `${k}: ${them}`).toBe(true)
      expect(/\byou(r)?\b/.test(them), `${k}: ${them} does not say you`).toBe(true)
      expect(ego, k).not.toBe(them)
    }
  })

  it('gives no two sentences the same words, so two kinds never read as one fact', () => {
    const seen = new Map<string, string>()
    for (const k of MEMORY_KINDS) {
      for (const by of BY) {
        const text = MEMORY_PHRASE[k][by]
        expect(seen.get(text), `${k} (${by}) repeats ${seen.get(text)}`).toBeUndefined()
        seen.set(text, `${k} (${by})`)
      }
    }
    expect(seen.size).toBe(80)
  })

  it('keeps the voice of docs/VOICE.md: no banned phrase, no flag of the voice tool, contractions, no dash, nothing a life log may not say', () => {
    for (const k of MEMORY_KINDS) {
      for (const by of BY) {
        const where = `${k} (${by})`
        const line = `${said(k, by)} (2031)`
        for (const phrase of BANNED_ANYWHERE) expect(line, `${where} holds "${phrase}"`).not.toContain(phrase)
        expect(unitFlags(line, 'log'), where).toEqual([])
        expect(line, where).not.toMatch(DASHES)
        expect(line, where).not.toMatch(/\b(?:did|was|is|were|do|does|had|would|could|have|has) not\b|\bcannot\b/i)
      }
    }
  })

  it('is frozen all the way down, so a stray write is a TypeError', () => {
    expect(Object.isFrozen(MEMORY_PHRASE)).toBe(true)
    for (const k of MEMORY_KINDS) expect(Object.isFrozen(MEMORY_PHRASE[k]), k).toBe(true)
    expect(() => {
      ;(MEMORY_PHRASE.betrayal as { ego: string }).ego = 'x'
    }).toThrow(TypeError)
  })

  it('prints the table for the lead to read: one line a kind, the sentence for each side', () => {
    const rows = MEMORY_KINDS.map((k) => `${k.padEnd(18)} ego:  ${MEMORY_PHRASE[k].ego}\n${' '.repeat(18)} them: ${MEMORY_PHRASE[k].them}`)
    process.stdout.write(`MEMORY_PHRASE (the {name} slot is the first name)\n${rows.join('\n')}\n`)
    expect(rows).toHaveLength(40)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The lines

describe('memoryLines', () => {
  it('is [] on a life that is not stamped, whatever its edge holds (X6)', () => {
    const g = makeTestGame(1)
    const p = cast(g, 50, 'friend', { firstName: NAME })
    expect(putEdge(g, keyOf(g, p), E({ m: [mem('betrayal', 2030), mem('saved_me', 2031, 3, 'them')] }))).toBe(true)
    expect(memoryLines(g, p)).toEqual([])
    expect(memoryLines(g, p, 8)).toEqual([])
  })

  it('is [] with no edge, with an edge that has no memory, and for a person who has no name in the world', () => {
    const g = socialGame(2)
    const p = cast(g, 50, 'friend', { firstName: NAME })
    expect(memoryLines(g, p)).toEqual([])
    expect(putEdge(g, keyOf(g, p), E())).toBe(true)
    expect(memoryLines(g, p)).toEqual([])
    const odd = cast(g, 50, 'friend', { firstName: NAME })
    odd.id = 'not a name'
    expect(personEntity(odd)).toBe('pool:other')
    expect(memoryLines(g, odd)).toEqual([])
  })

  it('is [] and never throws for a game with no world, a world that is garbage and an edge map that is not a map', () => {
    const g = socialGame(3)
    const p = cast(g, 50, 'friend', { firstName: NAME })
    for (const edges of [null, 7, 'x', [1, 2], [mem('betrayal', 2030)], { [keyOf(g, p)]: 'betrayal.2030.3.e' }, { [keyOf(g, p)]: { m: [mem('betrayal', 2030)] } }]) {
      const h = structuredClone(g)
      h.world = { ...h.world, edges } as unknown as GameState['world']
      expect(() => memoryLines(h, p), JSON.stringify(edges)).not.toThrow()
      expect(memoryLines(h, p), JSON.stringify(edges)).toEqual([])
    }
    const bare = structuredClone(g)
    ;(bare as { world?: unknown }).world = undefined
    expect(memoryLines(bare, p)).toEqual([])
    const noCharacter = structuredClone(g)
    ;(noCharacter as { character?: unknown }).character = undefined
    expect(() => memoryLines(noCharacter, p)).not.toThrow()
    expect(memoryLines(noCharacter, p)).toEqual([])
  })

  it('reads the edge person > player and no other: the reverse edge and another person\'s edge show nothing', () => {
    const g = socialGame(4)
    const p = cast(g, 50, 'friend', { firstName: NAME })
    const q = cast(g, 50, 'friend', { firstName: 'Odile' })
    expect(putEdge(g, `${playerRef(g)}>${personEntity(p)}`, E({ m: [mem('betrayal', 2030)] }))).toBe(true)
    expect(putEdge(g, `${personEntity(q)}>${personEntity(p)}`, E({ m: [mem('saved_me', 2030)] }))).toBe(true)
    expect(putEdge(g, keyOf(g, q), E({ m: [mem('loan_given', 2029)] }))).toBe(true)
    expect(memoryLines(g, p)).toEqual([])
    expect(memoryLines(g, q)).toEqual([`${said('loan_given', 'ego', 'Odile')} (2029)`])
  })

  it('says each memory as its phrase and the year, on the side that did it', () => {
    const { g, p } = withMemories([mem('loan_given', 2031, 2, 'ego')])
    expect(memoryLines(g, p)).toEqual(['You lent Marisol money (2031)'])
    const them = withMemories([mem('loan_given', 2031, 2, 'them')])
    expect(memoryLines(them.g, them.p)).toEqual(['Marisol lent you money (2031)'])
    const both = withMemories([mem('proposed_yes', 2012, 2, 'ego'), mem('divorced', 2020, 3, 'them')])
    expect(memoryLines(both.g, both.p)).toEqual([`${said('divorced', 'them')} (2020)`, `${said('proposed_yes', 'ego')} (2012)`])
  })

  it('puts the strongest weight first, then the newest year, then the memory written last', () => {
    const { g, p } = withMemories([
      mem('loan_given', 2020, 1),
      mem('gift_given', 2024, 2),
      mem('betrayal', 2025, 3, 'them'),
      mem('loan_repaid', 2030, 2, 'them'),
      mem('kept_secret', 2030, 2, 'ego'),
      mem('covered_for_me', 2031, 1),
    ])
    expect(memoryLines(g, p)).toEqual([`${said('betrayal', 'them')} (2025)`, `${said('kept_secret', 'ego')} (2030)`, `${said('loan_repaid', 'them')} (2030)`])
    expect(memoryLines(g, p, 5)).toEqual([
      `${said('betrayal', 'them')} (2025)`,
      `${said('kept_secret', 'ego')} (2030)`,
      `${said('loan_repaid', 'them')} (2030)`,
      `${said('gift_given', 'ego')} (2024)`,
      `${said('covered_for_me', 'ego')} (2031)`,
    ])
  })

  it('takes n as a count: the default is the profile cap of 3, 0 gives none, a fraction is cut down, and a value that is no number gives the default', () => {
    const all = Array.from({ length: 8 }, (_, i) => mem(MEMORY_KINDS[i]!, 2020 + i, 3))
    const { g, p } = withMemories(all)
    expect(PEOPLE_CAPS.memories).toBe(3)
    expect(memoryLines(g, p)).toHaveLength(3)
    expect(memoryLines(g, p, 1)).toHaveLength(1)
    expect(memoryLines(g, p, 0)).toEqual([])
    expect(memoryLines(g, p, -4)).toEqual([])
    expect(memoryLines(g, p, 2.9)).toHaveLength(2)
    expect(memoryLines(g, p, 8)).toHaveLength(8)
    expect(memoryLines(g, p, 1e9)).toHaveLength(EDGE_CAPS.memPerEdge)
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined, '3' as unknown as number, null as unknown as number]) {
      expect(memoryLines(g, p, bad), String(bad)).toHaveLength(3)
    }
    expect(memoryLines(g, p, 3)).toEqual(memoryLines(g, p))
    expect(memoryLines(g, p, 1)).toEqual(memoryLines(g, p).slice(0, 1))
  })

  it('names the person by first name, cleaned: a long name is cut, a dash is a hyphen, white space is one space, and no name reads as "this person"', () => {
    const named = (firstName: unknown): string[] => {
      const { g, p } = withMemories([mem('loan_given', 2031, 2, 'ego'), mem('saved_me', 2030, 1, 'them')])
      ;(p as { firstName: unknown }).firstName = firstName
      return memoryLines(g, p)
    }
    expect(named('Marisol')).toEqual(['You lent Marisol money (2031)', 'Marisol saved you (2030)'])
    expect(named('  Mary \n  Ann ')).toEqual(['You lent Mary Ann money (2031)', 'Mary Ann saved you (2030)'])
    expect(named(`Jean${String.fromCharCode(0x2014)}Luc${String.fromCharCode(0x2013)}Paul`)).toEqual(['You lent Jean-Luc-Paul money (2031)', 'Jean-Luc-Paul saved you (2030)'])
    expect(named('$& $1 $$ {name}')).toEqual(['You lent $& $1 $$ {name} money (2031)', '$& $1 $$ {name} saved you (2030)'])
    for (const none of ['', '   ', undefined, null, 7, {}, ['Ana']]) {
      expect(named(none), JSON.stringify(none)).toEqual(['You lent this person money (2031)', 'This person saved you (2030)'])
    }
    const long = named('A'.repeat(500))
    expect(long[0]).toBe(`You lent ${'A'.repeat(24)} money (2031)`)
    expect(long[1]).toBe(`${'A'.repeat(24)} saved you (2030)`)
    const emoji = named(`a${'\u{1F600}'.repeat(40)}`)
    for (const line of emoji) expect(line, 'a cut never leaves half a pair').not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/)
  })

  it('keeps every line of every kind and side within 90 characters, with the longest name and the longest year', () => {
    const { g, p } = withMemories([])
    ;(p as { firstName: string }).firstName = 'W'.repeat(100)
    const key = keyOf(g, p)
    for (const k of MEMORY_KINDS) {
      for (const by of BY) {
        expect(putEdge(g, key, E({ m: [mem(k, 100_000, 3, by)] })), `${k} (${by})`).toBe(true)
        const lines = memoryLines(g, p)
        expect(lines, `${k} (${by})`).toHaveLength(1)
        expect(lines[0]!.length, `${k} (${by}): ${lines[0]}`).toBeLessThanOrEqual(90)
        expect(lines[0]!.endsWith(' (100000)'), `${k} (${by})`).toBe(true)
        expect(lines[0], `${k} (${by})`).not.toMatch(/\{|\}|undefined|NaN|null|\[object/)
      }
    }
  })

  it('gives at most three plain lines for a hostile edge: garbage memories, unknown kinds, 100 entries, a bad weight, a bad side', () => {
    const g = socialGame(5)
    const p = cast(g, 50, 'friend', { firstName: NAME })
    const junk: unknown[] = [
      7,
      null,
      {},
      [],
      'betrayal',
      'betrayal.2030',
      'betrayal.2030.3',
      'betrayal.2030.3.x',
      'betrayal.2030.9.e',
      'betrayal.0.3.e',
      'betrayal.-2030.3.e',
      'betrayal.2030.3.e.extra',
      'nobody_knows.2030.3.e',
      '__proto__.2030.3.e',
      'constructor.2030.3.e',
      '<b>betrayal</b>.2030.3.e',
      'x'.repeat(5_000),
    ]
    const flood = Array.from({ length: 100 }, (_, i) => (i % 3 === 0 ? junk[i % junk.length] : mem(MEMORY_KINDS[i % 40]!, 2000 + (i % 30), (1 + (i % 3)) as 1 | 2 | 3, i % 2 === 0 ? 'ego' : 'them')))
    const hostile = [{ m: flood }, { m: [...junk, ...flood] }, { m: junk }, { m: 'betrayal.2030.3.e' }, { m: { 0: mem('betrayal', 2030) } }]
    for (const [i, over] of hostile.entries()) {
      const h = structuredClone(g)
      h.world = { ...h.world, edges: { [keyOf(h, p)]: { ...E(), ...over } } } as unknown as GameState['world']
      const lines = memoryLines(h, p)
      expect(lines.length, `edge ${i}`).toBeLessThanOrEqual(3)
      for (const line of lines) {
        expect(line.length, line).toBeLessThanOrEqual(90)
        expect(line, line).not.toMatch(DASHES)
        expect(line, line).not.toMatch(/\{|\}|undefined|NaN|null|\[object|<|>/)
        expect(line, line).toMatch(/ \(\d{4,6}\)$/)
      }
    }
    expect(memoryLines((() => { const h = structuredClone(g); h.world = { ...h.world, edges: { [keyOf(h, p)]: { ...E(), m: flood } } } as unknown as GameState['world']; return h })(), p).length).toBe(3)
  })

  it('is pure: a frozen game with its dice trapped gives the same lines twice, and nothing is written, drawn or minted', () => {
    const g = socialGame(6)
    const p = cast(g, 50, 'friend', { firstName: NAME })
    expect(putEdge(g, keyOf(g, p), E({ m: [mem('betrayal', 2029, 3), mem('olive_branch', 2031, 2, 'them')] }))).toBe(true)
    const rng = g.rng
    const nextId = g.nextId
    const before = JSON.stringify(g)
    const frozen = deepFreeze(trapRng(structuredClone(g)))
    const frozenBefore = JSON.stringify(frozen)
    const fp = frozen.people.find((x) => x.id === p.id)!
    const first = memoryLines(frozen, fp)
    const second = memoryLines(frozen, fp)
    expect(first).toEqual([`${said('betrayal', 'ego')} (2029)`, `${said('olive_branch', 'them')} (2031)`])
    expect(second).toEqual(first)
    expect(JSON.stringify(frozen)).toBe(frozenBefore)
    memoryLines(g, p)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
    expect(JSON.stringify(g)).toBe(before)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
  })

  it('reads what the real writer wrote: remember() on a stamped life shows as a line, and on an unstamped life nothing was written', () => {
    const g = socialGame(7)
    const p = cast(g, 50, 'friend', { firstName: NAME })
    expect(remember(g, p, 'saved_me', { w: 3, by: 'them' })).toBe(true)
    expect(remember(g, p, 'gift_refused', { w: 1, by: 'ego' })).toBe(true)
    expect(memoryLines(g, p)).toEqual([`Marisol saved you (${g.year})`, `You turned down a request from Marisol (${g.year})`])
    const plainGame = makeTestGame(7)
    const q = cast(plainGame, 50, 'friend', { firstName: NAME })
    expect(remember(plainGame, q, 'saved_me', { w: 3, by: 'them' })).toBe(false)
    expect(memoryLines(plainGame, q)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The page

describe('the lines on the page', () => {
  const ON = { peopleProfile: true } as const
  const draw = (g: GameState, p: Person): string => withFlags(ON, () => inFog(() => renderToStaticMarkup(createElement(PersonProfile, { g, person: p }))))
  /** The list items of the card: the memory lines and then the notes. */
  const items = (markup: string): string[] => [...(/<ul class="person-notes">(.*?)<\/ul>/s.exec(markup)?.[1] ?? '').matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((m) => plain(m[1]!))

  it('puts the lines first in "Shared history", above the notes, each as a list item with its year', () => {
    const { g, p } = withMemories([mem('loan_given', 2027, 2, 'ego'), mem('saved_me', 2030, 3, 'them')])
    p.notes = ['Met at a concert.', 'Moved to Lisbon.']
    const markup = draw(g, p)
    const words = plain(markup)
    const at = (s: string): number => words.indexOf(s)
    expect(at('Shared history')).toBeGreaterThan(0)
    expect(at('Marisol saved you (2030)')).toBeGreaterThan(at('Shared history'))
    expect(at('You lent Marisol money (2027)')).toBeGreaterThan(at('Marisol saved you (2030)'))
    expect(at('Met at a concert.')).toBeGreaterThan(at('You lent Marisol money (2027)'))
    expect(at('Moved to Lisbon.')).toBeGreaterThan(at('Met at a concert.'))
    expect(items(markup)).toEqual(['Marisol saved you (2030)', 'You lent Marisol money (2027)', 'Met at a concert.', 'Moved to Lisbon.'])
    expect(markup).not.toMatch(/<button|tabindex|role="dialog"|aria-modal/)
    expect(draw(g, p)).toBe(markup)
  })

  it('draws the card for memories alone, with no notes', () => {
    const { g, p } = withMemories([mem('betrayal', 2030, 3, 'ego')])
    p.notes = []
    const words = plain(draw(g, p))
    expect(words).toContain('Shared history')
    expect(words).toContain('You betrayed Marisol (2030)')
  })

  it('draws no more than three lines, and no card when there is nothing to put in it', () => {
    const { g, p } = withMemories(Array.from({ length: 8 }, (_, i) => mem(MEMORY_KINDS[i + 10]!, 2020 + i, 2)))
    p.notes = []
    expect(memoryLines(g, p)).toHaveLength(3)
    expect(items(draw(g, p))).toHaveLength(3)
    const bare = socialGame(8)
    const q = cast(bare, 50, 'friend', { firstName: NAME })
    q.notes = []
    expect(plain(draw(bare, q))).not.toContain('Shared history')
  })

  it('draws the page it drew before on a life that is not stamped, whatever the edge holds', () => {
    const plainGame = makeTestGame(9)
    const p = cast(plainGame, 50, 'friend', { firstName: NAME })
    p.notes = ['Met at a concert.']
    const without = draw(plainGame, p)
    expect(putEdge(plainGame, keyOf(plainGame, p), E({ m: [mem('betrayal', 2030), mem('saved_me', 2031, 3, 'them')] }))).toBe(true)
    expect(draw(plainGame, p)).toBe(without)
    expect(plain(without)).toContain('Met at a concert.')
    expect(plain(without)).not.toMatch(/betrayed|saved you|\(2030\)|\(2031\)/)
  })

  it('draws a frozen game without a write or a draw', () => {
    const { g, p } = withMemories([mem('mentored_me', 2030, 3, 'them')])
    const frozen = deepFreeze(trapRng(structuredClone(g)))
    const fp = frozen.people.find((x) => x.id === p.id)!
    expect(plain(draw(frozen, fp))).toContain('Marisol mentored you (2030)')
  })
})
