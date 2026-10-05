import { describe, expect, it } from 'vitest'
import { extractJsonText, parseJsonLoose, repairJson, stripThinking } from '../src/ai/json'
import {
  SCHEMAS,
  SchemaError,
  firstEmoji,
  int,
  logLine,
  scrubBrands,
  validateChat,
  validateCustomAction,
  validateEffects,
  validateInterview,
  validateNarration,
  validateObituary,
  validateOutcome,
  validateYearEvents,
} from '../src/ai/schemas'

describe('stripThinking', () => {
  it('removes complete think blocks', () => {
    expect(stripThinking('<think>hmm, let me plan</think>\n{"a":1}')).toBe('{"a":1}')
    expect(stripThinking('<thinking>x</thinking>{"a":1}<think>y</think>')).toBe('{"a":1}')
  })
  it('drops everything before a dangling closing tag', () => {
    expect(stripThinking('I should write JSON {"wrong":true}</think>{"a":1}')).toBe('{"a":1}')
  })
  it('drops an unterminated think block (ran out of tokens)', () => {
    expect(stripThinking('<think>The user wants {"a": 1} so')).toBe('')
  })
  it('handles gpt-oss channel markup', () => {
    expect(stripThinking('<|channel|>analysis<|message|>plan<|end|><|start|>assistant<|channel|>final<|message|>{"a":1}')).toBe('{"a":1}')
  })
})

describe('extractJsonText', () => {
  it('finds the object inside prose and code fences', () => {
    expect(extractJsonText('Sure! Here you go:\n```json\n{"a": {"b": [1, 2]}}\n```\nEnjoy')).toBe('{"a": {"b": [1, 2]}}')
  })
  it('ignores braces inside strings', () => {
    expect(extractJsonText('x {"t": "a } b"} y')).toBe('{"t": "a } b"}')
  })
  it('returns null for truncated JSON', () => {
    expect(extractJsonText('{"a": [1, 2')).toBeNull()
  })
})

describe('repairJson / parseJsonLoose', () => {
  const parse = (s: string) => parseJsonLoose(s) as Record<string, unknown>

  it('parses strict JSON directly', () => {
    expect(parse('{"a":1,"b":[true,null]}')).toEqual({ a: 1, b: [true, null] })
  })
  it('handles code fences and leading prose', () => {
    expect(parse('Here is the result:\n```json\n{"text": "You won."}\n```')).toEqual({ text: 'You won.' })
  })
  it('removes trailing commas', () => {
    expect(parse('{"log": ["a", "b",], "x": 1,}')).toEqual({ log: ['a', 'b'], x: 1 })
  })
  it('converts single quotes and keeps apostrophes', () => {
    expect(parse("{'text': 'You can't stop now', 'n': 2}")).toEqual({ text: "You can't stop now", n: 2 })
  })
  it('quotes bare keys and maps Python literals', () => {
    expect(parse('{possible: True, death: None, ok: False}')).toEqual({ possible: true, death: null, ok: false })
  })
  it('closes truncated output', () => {
    expect(parse('{"log": ["I learned to swim."], "event": {"title": "Pool Party", "text": "You see a po')).toEqual({
      log: ['I learned to swim.'],
      event: { title: 'Pool Party', text: 'You see a po' },
    })
  })
  it('gives a dangling key a null value', () => {
    expect(parse('{"a": 1, "b"')).toEqual({ a: 1, b: null })
    expect(parse('{"a": 1, "b":')).toEqual({ a: 1, b: null })
  })
  it('completes truncated literals', () => {
    expect(parse('{"possible": tru')).toEqual({ possible: true })
  })
  it('escapes unescaped inner quotes and raw newlines', () => {
    expect(parse('{"text": "He said "hi" to me", "log": "line one\nline two"}')).toEqual({
      text: 'He said "hi" to me',
      log: 'line one\nline two',
    })
  })
  it('inserts missing commas', () => {
    expect(parse('{"a": 1\n"b": 2}')).toEqual({ a: 1, b: 2 })
  })
  it('strips comments', () => {
    expect(parse('{"a": 1, // the answer\n /* block */ "b": 2}')).toEqual({ a: 1, b: 2 })
  })
  it('reads money-style numbers', () => {
    expect(parse('{"money": -$1,500, "happiness": +5}')).toEqual({ money: -1500, happiness: 5 })
  })
  it('unwraps JSON that was returned as a JSON string', () => {
    expect(parse('"{\\"text\\": \\"hi\\"}"')).toEqual({ text: 'hi' })
  })
  it('parses after think tags', () => {
    expect(parse('<think>I need JSON with {braces}</think>\n{"text": "ok"}')).toEqual({ text: 'ok' })
  })
  it('ignores prose braces before the real object', () => {
    expect(parse('Use {name} here. {"text": "fine"}')).toEqual({ text: 'fine' })
  })
  it('handles mismatched closers', () => {
    expect(JSON.parse(repairJson('{"a": [1, 2}'))).toEqual({ a: [1, 2] })
  })
  it('throws on empty or JSON-less replies', () => {
    expect(() => parseJsonLoose('')).toThrow()
    expect(() => parseJsonLoose('I cannot do that.')).toThrow()
    expect(() => parseJsonLoose('<think>only thoughts</think>')).toThrow()
  })
  it('always produces valid JSON for any truncation of a reply', () => {
    const full =
      'Sure!\n```json\n{"title": "Stray Dog \u{1F415}", "text": "You said \\"hi\\" to a dog, then it bit you.", "log": \'I met a dog.\', "effects": {"happiness": -5, "money": -1,250, "relationships": [{"name": "Mom", "delta": 3},], "death": "", ok: True}}\n```'
    for (let cut = full.indexOf('{') + 1; cut <= full.length; cut++) {
      const out = repairJson(full.slice(0, cut))
      expect(() => JSON.parse(out), out).not.toThrow()
    }
    const done = parseJsonLoose(full) as Record<string, unknown>
    expect(done.title).toBe('Stray Dog \u{1F415}')
    expect((done.effects as Record<string, unknown>).money).toBe(-1250)
  })
  it('does not treat prototype names as literals', () => {
    expect(parse('{"a": constructor}')).toEqual({ a: 'constructor' })
  })
})

describe('schemas', () => {
  it('are strict objects with every property required', () => {
    for (const schema of Object.values(SCHEMAS)) {
      const s = schema as { type: string; properties: Record<string, unknown>; required: string[]; additionalProperties: boolean }
      expect(s.type).toBe('object')
      expect(s.additionalProperties).toBe(false)
      expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort())
    }
    expect(JSON.stringify(SCHEMAS)).not.toMatch(/anyOf|oneOf/)
  })
})

describe('validators', () => {
  it('coerces numbers', () => {
    expect(int('+10', -40, 40)).toBe(10)
    expect(int('-$1,500', -1e9, 1e9)).toBe(-1500)
    expect(int('2k', 0, 1e9)).toBe(2000)
    expect(int(500, -40, 40)).toBe(40)
    expect(int('nope', 0, 10, 3)).toBe(3)
  })
  it('cleans log lines', () => {
    expect(logLine('- Age 5: i lost a tooth')).toBe('I lost a tooth.')
    expect(logLine('none')).toBe('')
  })
  it('finds emoji', () => {
    expect(firstEmoji('🐶 Dog')).toBe('🐶')
    expect(firstEmoji('no emoji')).toBe('')
  })
  it('scrubs brand names', () => {
    expect(scrubBrands('Welcome to BitLife, Bitizen!')).toBe('Welcome to AnotherLife, citizen!')
  })

  it('validates year events with an event', () => {
    const r = validateYearEvents(
      {
        log: ['I learned to ride a bike.', 'Age 7: I ate a crayon', '', 'extra', 'extra2'],
        event: { title: 'Stray Dog', emoji: '🐕', text: 'A stray dog follows you home. What will you do?', person: '', choices: ['Keep it', { label: 'Shoo it away', emoji: '👋' }, 'Keep it'] },
      },
      true,
    )
    expect(r.log).toEqual(['I learned to ride a bike.', 'I ate a crayon.', 'Extra.'])
    expect(r.event?.choices).toEqual([
      { label: 'Keep it', emoji: '' },
      { label: 'Shoo it away', emoji: '👋' },
    ])
    expect(r.event?.emoji).toBe('🐕')
  })
  it('rejects an event with fewer than two choices', () => {
    expect(() => validateYearEvents({ log: [], event: { title: 'X', text: 'Something happens to you.', choices: ['Only'] } }, true)).toThrow(SchemaError)
  })
  it('requires the event only when asked for', () => {
    expect(validateYearEvents({ log: ['I grew.'] }, false)).toEqual({ log: ['I grew.'], event: null })
    expect(() => validateYearEvents({ log: ['I grew.'] }, true)).toThrow(SchemaError)
  })

  it('validates effects with neutral defaults and aliases', () => {
    const e = validateEffects({
      happiness: '12',
      money: '-$300',
      relationships: [{ name: 'Mom', delta: 5 }, { name: 'none', delta: 3 }, { name: 'Bob', delta: 0 }],
      newPerson: { relation: 'girlfriend', name: 'Ana Lopez', gender: 'female', age: 20, species: '' },
      condition: { name: 'broken arm', kind: 'injury', severity: 30 },
      arrest: { crime: '', severity: 0 },
      death: '',
      memory: 'none',
    })
    expect(e.happiness).toBe(12)
    expect(e.money).toBe(-300)
    expect(e.relationships).toEqual([{ name: 'Mom', delta: 5 }])
    expect(e.newPerson).toEqual({ relation: 'partner', name: 'Ana Lopez', gender: 'female', age: 20, species: undefined })
    expect(e.condition).toEqual({ name: 'Broken arm', kind: 'injury', severity: 30 })
    expect(e.arrest).toBeNull()
    expect(e.death).toBe('')
    expect(e.memory).toBe('')
    expect(validateEffects({ newPerson: { relation: 'none' }, condition: { kind: 'none', name: '' } }).newPerson).toBeNull()
    expect(validateEffects('garbage').happiness).toBe(0)
  })

  it('validates outcomes', () => {
    const o = validateOutcome({ title: 'Ouch', emoji: '🤕', text: 'You fell off the slide.', log: 'i fell off the slide', effects: { health: -5 } })
    expect(o).toMatchObject({ title: 'Ouch', text: 'You fell off the slide.', log: 'I fell off the slide.' })
    expect(o.effects.health).toBe(-5)
    expect(() => validateOutcome({ title: 'x', text: '' })).toThrow(SchemaError)
  })
  it('zeroes effects for impossible custom actions', () => {
    const r = validateCustomAction({ possible: 'false', title: 'Nope', text: 'You are a baby.', log: '', effects: { happiness: 20 } })
    expect(r.possible).toBe(false)
    expect(r.effects.happiness).toBe(0)
  })
  it('validates interviews', () => {
    const q = validateInterview({
      question: 'Why do you want to flip burgers?',
      answers: [
        { label: 'A) I love grease.', score: 85 },
        { label: 'I need money.', score: 50 },
        { label: 'I was court ordered.', score: 5 },
      ],
    })
    expect(q.answers[0].label).toBe('I love grease.')
    expect(() =>
      validateInterview({ question: 'Why are you here today?', answers: [{ label: 'a', score: 50 }, { label: 'b', score: 50 }, { label: 'c', score: 52 }] }),
    ).toThrow(SchemaError)
    expect(() => validateInterview({ question: 'Why are you here today?', answers: [{ label: 'a', score: 90 }, { label: 'b', score: 10 }] })).toThrow(SchemaError)
  })
  it('validates text tasks and chat', () => {
    expect(validateObituary({ text: 'Test Player, 80, died peacefully surrounded by cats.' }).text).toContain('Test Player')
    expect(() => validateObituary({ text: 'short' })).toThrow(SchemaError)
    expect(validateNarration({ text: 'You did it.' }).text).toBe('You did it.')
    expect(validateChat({ reply: 'Hi sweetie!', relationshipDelta: 12, mood: 'Happy' })).toEqual({ reply: 'Hi sweetie!', relationshipDelta: 5, mood: 'happy' })
    expect(() => validateChat({ reply: '' })).toThrow(SchemaError)
  })
})
