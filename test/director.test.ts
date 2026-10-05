import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Feature modules other engineers own are mocked so the director is tested in isolation.
vi.mock('../src/game/events', () => ({
  queueFallbackYearEvents: vi.fn((g: { flags: Record<string, unknown> }) => {
    g.flags.fallbackYear = true
  }),
  fallbackChoiceOutcome: vi.fn((g: { flags: Record<string, unknown> }) => {
    g.flags.fallbackChoice = true
  }),
  fallbackCustomAction: vi.fn((g: { flags: Record<string, unknown> }) => {
    g.flags.fallbackCustom = true
  }),
  fallbackObituary: vi.fn(() => 'They lived. They died. The end.'),
  foreignToLocale: vi.fn(() => false),
}))
vi.mock('../src/game/careers', () => ({
  fallbackInterviewQuestion: vi.fn(() => ({ question: 'Fallback question?', answers: [{ label: 'Yes', score: 80 }, { label: 'No', score: 10 }, { label: 'Maybe', score: 40 }] })),
  presentInterview: vi.fn((g: { flags: Record<string, unknown> }, job: { title: string }, q: unknown) => {
    g.flags.interview = { job: job.title, q } as never
  }),
}))
vi.mock('../src/game/crime', () => ({
  arrestPlayer: vi.fn((g: { flags: Record<string, unknown> }, crime: string, severity: number) => {
    g.flags.arrested = `${crime}:${severity}`
  }),
}))
vi.mock('../src/game/ribbons', () => ({ computeRibbon: vi.fn(() => null) }))

import { applyFallback, chatReply, narrateNotice, planYear, resolvePerson, runAiTask, testConnection, toGameEffects, MAX_CUSTOM_ACTIONS_PER_YEAR } from '../src/ai/director'
import { NEUTRAL_EFFECTS } from '../src/ai/schemas'
import { normalizeBaseUrl, resetLmStudioSession } from '../src/ai/lmstudio'
import { createPerson } from '../src/game/people'
import type { ChoiceModal, GameState, NoticeModal } from '../src/game/types'
import { DEFAULT_SETTINGS, type Settings } from '../src/settings'
import { makeTestGame } from './helpers'

const settings: Settings = { ...DEFAULT_SETTINGS, baseUrl: 'http://lm.test/v1', model: 'test-model', disableThinking: false }

interface Call {
  url: string
  method: string
  body: Record<string, unknown> | undefined
  headers: Record<string, string>
}
let calls: Call[] = []
type Reply = Response | ((body: Record<string, unknown>) => Response)
let chatQueue: Reply[] = []
let modelsBody: unknown = { object: 'list', data: [{ id: 'test-model', object: 'model' }, { id: 'text-embedding-nomic', object: 'model' }] }
let nativeBody: unknown = null

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function chat(content: string, finish = 'stop', extra: Record<string, unknown> = {}): Response {
  return json({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content, ...extra }, finish_reason: finish }] })
}
function chatJsonReply(obj: unknown): Response {
  return chat(JSON.stringify(obj))
}

function chatBodies(): Record<string, unknown>[] {
  return calls.filter((c) => c.url.endsWith('/chat/completions')).map((c) => c.body ?? {})
}

beforeEach(() => {
  calls = []
  chatQueue = []
  nativeBody = null
  modelsBody = { object: 'list', data: [{ id: 'test-model', object: 'model' }, { id: 'text-embedding-nomic', object: 'model' }] }
  resetLmStudioSession()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
      calls.push({ url, method: init?.method ?? 'GET', body, headers: (init?.headers ?? {}) as Record<string, string> })
      if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
      if (url.endsWith('/chat/completions')) {
        const next = chatQueue.shift()
        if (!next) throw new Error('unexpected chat call')
        return typeof next === 'function' ? next(body ?? {}) : next
      }
      if (url.endsWith('/api/v1/models')) return nativeBody ? json(nativeBody) : json({ error: 'Unexpected endpoint' }, 404)
      if (url.endsWith('/api/v0/models')) return json({ error: 'Unexpected endpoint' }, 404)
      if (url.endsWith('/v1/models')) return json(modelsBody)
      return json({ error: 'not found' }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}

function signal(): AbortSignal {
  return new AbortController().signal
}

/** Run a task on a frozen snapshot (proving the director never mutates it) and apply the result to a clone. */
async function run(g: GameState, task: Parameters<typeof runAiTask>[1], s: Settings = settings): Promise<GameState> {
  const frozen = deepFreeze(structuredClone(g))
  const apply = await runAiTask(frozen, task, s, signal())
  const draft = structuredClone(g)
  apply(draft)
  JSON.parse(JSON.stringify(draft)) // still plain JSON
  return draft
}

function familyGame(age = 10, seed = 1): GameState {
  const g = makeTestGame(seed, { age, money: 1000 })
  createPerson(g, { relation: 'parent', age: age + 30, gender: 'female', firstName: 'Susan', lastName: 'Player', relationship: 70, livesWithPlayer: true })
  createPerson(g, { relation: 'parent', age: age + 32, gender: 'male', firstName: 'Mark', lastName: 'Player', relationship: 60, livesWithPlayer: true })
  createPerson(g, { relation: 'pet', age: 3, firstName: 'Waffles', species: 'Cat', relationship: 80, livesWithPlayer: true })
  return g
}

function seedWith(age: number, wantEvent: boolean): GameState {
  for (let seed = 1; seed < 500; seed++) {
    const g = familyGame(age, seed)
    if (planYear(g).wantEvent === wantEvent) return g
  }
  throw new Error('no seed found')
}

const goodYear = {
  log: ['I learned to ride a bike.', 'I got a gold star for spelling.'],
  event: {
    title: 'Stray Dog',
    emoji: '🐕',
    text: 'A scruffy dog follows you home from school. What will you do?',
    person: 'Susan',
    choices: [
      { label: 'Beg Mom to keep it', emoji: '🥺' },
      { label: 'Shoo it away', emoji: '' },
      { label: 'Feed it your lunch', emoji: '' },
    ],
  },
}

const neutralEffects = {
  happiness: 0,
  health: 0,
  smarts: 0,
  looks: 0,
  karma: 0,
  fame: 0,
  money: 0,
  relationships: [],
  newPerson: { relation: 'none', name: '', gender: 'any', age: 0, species: '' },
  condition: { name: '', kind: 'none', severity: 0 },
  arrest: { crime: '', severity: 0 },
  death: '',
  memory: '',
}

describe('planYear', () => {
  it('never plans an event in the birth year and is deterministic', () => {
    const g = familyGame(0)
    expect(planYear(g).wantEvent).toBe(false)
    const g2 = familyGame(12, 7)
    expect(planYear(g2)).toEqual(planYear(g2))
  })
  it('fires events roughly 70% of the time from age 3', () => {
    let hits = 0
    for (let seed = 1; seed <= 400; seed++) if (planYear(makeTestGame(seed, { age: 20 })).wantEvent) hits++
    expect(hits / 400).toBeGreaterThan(0.6)
    expect(hits / 400).toBeLessThan(0.8)
  })
})

describe('toGameEffects safety', () => {
  it('keeps teen romance age-appropriate and drops toddler arrests', () => {
    const teen = familyGame(15)
    const eff = toGameEffects(teen, { ...NEUTRAL_EFFECTS, newPerson: { relation: 'partner', name: 'Ava Stone', gender: 'female', age: 30 } })
    expect(eff.newPerson).toMatchObject({ relation: 'partner', firstName: 'Ava', lastName: 'Stone', age: 17 })
    const kid = familyGame(9)
    expect(toGameEffects(kid, { ...NEUTRAL_EFFECTS, newPerson: { relation: 'lover', name: 'Zed' } }).newPerson?.relation).toBe('friend')
    const tot = familyGame(4)
    const t = toGameEffects(tot, { ...NEUTRAL_EFFECTS, arrest: { crime: 'Theft', severity: 2 }, death: 'Falling', money: 5000, condition: { name: 'Alcoholism', kind: 'addiction', severity: 40 } })
    expect(t.arrest).toBeUndefined()
    expect(t.death).toBeUndefined()
    expect(t.condition).toBeUndefined()
    expect(t.money).toBe(25)
  })
  it('skips people who already exist and unknown relationship names', () => {
    const g = familyGame(30)
    const eff = toGameEffects(g, { ...NEUTRAL_EFFECTS, relationships: [{ name: 'Ghost', delta: 5 }, { name: 'Mom', delta: 3 }, { name: 'Susan', delta: 4 }], newPerson: { relation: 'friend', name: 'Susan' } })
    expect(eff.relationships).toEqual([{ personId: g.people[0].id, delta: 7 }])
    expect(eff.newPerson).toBeUndefined()
  })
})

describe('resolvePerson', () => {
  it('maps names, relation words and pets', () => {
    const g = familyGame()
    expect(resolvePerson(g, 'Susan')?.firstName).toBe('Susan')
    expect(resolvePerson(g, 'Mark Player')?.firstName).toBe('Mark')
    expect(resolvePerson(g, 'my mom')?.firstName).toBe('Susan')
    expect(resolvePerson(g, 'Dad')?.firstName).toBe('Mark')
    expect(resolvePerson(g, 'the cat')?.firstName).toBe('Waffles')
    expect(resolvePerson(g, 'Test Player')).toBeUndefined()
    expect(resolvePerson(g, 'Zorblax')).toBeUndefined()
  })
})

describe('yearEvents', () => {
  it('asks for prison-only events when locked up', async () => {
    const g = familyGame(30)
    g.character.prison = { name: 'Rock Bay', security: 'maximum', crime: 'Burglary', sentenceYears: 6, yearsServed: 1, respect: 40, appealed: false, escapeAttempts: 0 }
    chatQueue.push(chatJsonReply({ log: ['I traded noodles for stamps.'], event: goodYear.event }))
    await run(g, { type: 'yearEvents' })
    const prompt = (chatBodies()[0].messages as { content: string }[])[1].content
    expect(prompt).toMatch(/IN PRISON/)
    expect(prompt).toMatch(/PRISON: serving 6 yrs \(1 served\) for Burglary/)
  })

  it('logs AI lines and queues an AI choice popup', async () => {
    const g = seedWith(10, true)
    chatQueue.push(chatJsonReply(goodYear))
    const out = await run(g, { type: 'yearEvents' })
    const entries = out.log[out.log.length - 1].entries
    expect(entries.map((e) => e.text)).toEqual(goodYear.log)
    expect(entries.every((e) => e.tone === 'ai')).toBe(true)
    const modal = out.queue[out.queue.length - 1] as ChoiceModal
    expect(modal.kind).toBe('choice')
    expect(modal.source).toBe('ai')
    expect(modal.choices.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(modal.choices[0]).toEqual({ id: 'a', label: 'Beg Mom to keep it', emoji: '🥺' })
    expect(modal.choices[1]).toEqual({ id: 'b', label: 'Shoo it away' })
    expect(modal.personId).toBe(g.people[0].id)
    expect(out.counters.aiEvents).toBe(3)
    expect(out.flags.aiRecentEvents).toEqual(['Stray Dog'])
    expect(out.rng).not.toBe(g.rng)
    // Asked with the event schema
    const body = chatBodies()[0]
    expect(body.model).toBe('test-model')
    expect((body.response_format as { json_schema: { name: string } }).json_schema.name).toBe('year_events')
  })

  it('asks only for log lines when the engine rolls no event', async () => {
    const g = seedWith(10, false)
    chatQueue.push(chatJsonReply({ log: ['I collected 40 rocks.'] }))
    const out = await run(g, { type: 'yearEvents' })
    expect(out.queue).toHaveLength(0)
    expect(out.log[out.log.length - 1].entries[0].text).toBe('I collected 40 rocks.')
    expect((chatBodies()[0].response_format as { json_schema: { name: string } }).json_schema.name).toBe('year_log')
  })

  it("skips repeated log lines (within the reply, this year's and last year's log)", async () => {
    const g = seedWith(10, false)
    g.log.push({ age: 9, year: g.year - 1, entries: [{ id: 'l1', text: 'I collected 40 rocks.', tone: 'ai' }] })
    g.log.push({ age: 10, year: g.year, entries: [{ id: 'l2', text: 'I lost a tooth!', tone: 'ai' }] })
    chatQueue.push(chatJsonReply({ log: ['I built a fort.', 'i built a FORT!', 'I collected 40 rocks'] }))
    const out = await run(g, { type: 'yearEvents' })
    expect(out.log[out.log.length - 1].entries.map((e) => e.text)).toEqual(['I lost a tooth!', 'I built a fort.'])
  })

  it('strips <think> blocks and code fences', async () => {
    const g = seedWith(10, true)
    chatQueue.push(chat(`<think>Let me plan a fun event for a kid. {"draft": true}</think>\n\`\`\`json\n${JSON.stringify(goodYear)}\n\`\`\``, 'stop', { reasoning_content: 'ignored' }))
    const out = await run(g, { type: 'yearEvents' })
    expect((out.queue[0] as ChoiceModal).title).toBe('Stray Dog')
  })

  it('retries once with a correction, then falls back offline', async () => {
    const g = seedWith(10, true)
    chatQueue.push(chat('Sorry, I cannot help with that.'), chat('{"log": ["x"]}'))
    const out = await run(g, { type: 'yearEvents' })
    expect(out.flags.fallbackYear).toBe(true)
    const bodies = chatBodies()
    expect(bodies).toHaveLength(2)
    const retryMessages = bodies[1].messages as { role: string; content: string }[]
    expect(retryMessages[retryMessages.length - 2].role).toBe('assistant')
    expect(retryMessages[retryMessages.length - 1].content).toMatch(/could not be used/)
  })

  it('accepts a repaired reply on the corrective retry', async () => {
    const g = seedWith(10, true)
    chatQueue.push(chat('nothing useful'), chat(`{'log': ['I found a frog.',], 'event': {'title': 'Frog', 'emoji': '🐸', 'text': 'A frog hops into your lunchbox. What will you do?', 'person': '', 'choices': [{'label': 'Kiss it'}, {'label': 'Release it'}]`))
    const out = await run(g, { type: 'yearEvents' })
    expect(out.flags.fallbackYear).toBeUndefined()
    expect((out.queue[0] as ChoiceModal).choices).toHaveLength(2)
  })

  it('retries without response_format when the server rejects it (400) and remembers', async () => {
    const g = seedWith(10, true)
    chatQueue.push(json({ error: "'response_format.type' must be 'json_schema' or 'text'" }, 400), chatJsonReply(goodYear), chatJsonReply({ log: ['I grew an inch.'] }))
    const out = await run(g, { type: 'yearEvents' })
    expect((out.queue[0] as ChoiceModal).title).toBe('Stray Dog')
    const bodies = chatBodies()
    expect(bodies[0].response_format).toBeDefined()
    expect(bodies[1].response_format).toBeUndefined()
    await run(seedWith(10, false), { type: 'yearEvents' })
    expect(chatBodies()[2].response_format).toBeUndefined()
  })

  it('adds the /no_think hint when thinking is disabled', async () => {
    const g = seedWith(10, false)
    chatQueue.push(chatJsonReply({ log: ['I napped.'] }))
    await run(g, { type: 'yearEvents' }, { ...settings, disableThinking: true })
    const sys = (chatBodies()[0].messages as { role: string; content: string }[])[0]
    expect(sys.role).toBe('system')
    expect(sys.content.endsWith('/no_think')).toBe(true)
  })

  it('keeps the prompt compact', async () => {
    const g = seedWith(30, true)
    for (let i = 0; i < 30; i++) createPerson(g, { relation: 'friend', age: 30, relationship: 50 })
    for (let i = 0; i < 40; i++) g.log[0].entries.push({ id: `l${i}`, text: `I did a fairly ordinary thing number ${i} this year.`, tone: 'neutral' })
    for (let i = 0; i < 40; i++) g.character.memories.push(`Age ${i}: something memorable happened, number ${i}.`)
    chatQueue.push(chatJsonReply(goodYear))
    await run(g, { type: 'yearEvents' })
    const msgs = chatBodies()[0].messages as { content: string }[]
    const chars = msgs.reduce((n, m) => n + m.content.length, 0)
    expect(chars / 4).toBeLessThan(2500)
  })
})

describe('resolveChoice', () => {
  const event: ChoiceModal = {
    kind: 'choice',
    id: 'm1',
    title: 'Stray Dog',
    emoji: '🐕',
    text: 'A scruffy dog follows you home. What will you do?',
    choices: [
      { id: 'a', label: 'Beg Mom to keep it' },
      { id: 'b', label: 'Shoo it away' },
    ],
    source: 'ai',
  }

  it('shows the outcome, applies effects by name and logs', async () => {
    const g = familyGame(10)
    chatQueue.push(
      chatJsonReply({
        title: 'New Best Friend',
        emoji: '🐶',
        text: 'Mom caved. You now own a dog with questionable hygiene.',
        log: 'I convinced my mom to let me keep a stray dog.',
        effects: {
          ...neutralEffects,
          happiness: 12,
          money: -50000,
          relationships: [{ name: 'Mom', delta: 6 }, { name: 'Nobody Known', delta: 10 }],
          newPerson: { relation: 'pet', name: 'Biscuit', gender: 'male', age: 2, species: 'Dog' },
        },
      }),
    )
    const out = await run(g, { type: 'resolveChoice', event, choiceId: 'a' })
    const n = out.queue[0] as NoticeModal
    expect(n.kind).toBe('notice')
    expect(n.title).toBe('New Best Friend')
    expect(n.text).toMatch(/^Mom caved\./)
    expect(n.text).toMatch(/\+12 Happiness/)
    expect(out.character.stats.happiness).toBe(92)
    expect(out.character.money).toBeGreaterThanOrEqual(1000 - 400) // kid money is capped
    expect(out.people.find((p) => p.firstName === 'Susan')?.relationship).toBe(76)
    expect(out.people.find((p) => p.firstName === 'Biscuit')?.relation).toBe('pet')
    expect(out.log[out.log.length - 1].entries.some((e) => e.text === 'I convinced my mom to let me keep a stray dog.')).toBe(true)
    const prompt = (chatBodies()[0].messages as { content: string }[])[1].content
    expect(prompt).toContain('CHOSE: "Beg Mom to keep it"')
  })

  it('arrests adults for crimes but never toddlers', async () => {
    const adult = familyGame(25)
    chatQueue.push(chatJsonReply({ title: 'Busted', emoji: '🚓', text: 'The cops saw everything.', log: 'I got arrested.', effects: { ...neutralEffects, arrest: { crime: 'Shoplifting', severity: 1 } } }))
    const out = await run(adult, { type: 'resolveChoice', event, choiceId: 'b' })
    expect(out.flags.arrested).toBe('Shoplifting:1')
    expect((out.queue[0] as NoticeModal).text).toBe('The cops saw everything.')

    const tot = familyGame(3)
    chatQueue.push(chatJsonReply({ title: 'Oops', emoji: '🍼', text: 'You bit the mailman.', log: 'I bit the mailman.', effects: { ...neutralEffects, arrest: { crime: 'Assault', severity: 3 }, death: 'Rabies' } }))
    const out2 = await run(tot, { type: 'resolveChoice', event, choiceId: 'b' })
    expect(out2.flags.arrested).toBeUndefined()
    expect(out2.character.alive).toBe(true)
  })

  it('falls back when the choice id is unknown', async () => {
    const out = await run(familyGame(10), { type: 'resolveChoice', event, choiceId: 'z' })
    expect(out.flags.fallbackChoice).toBe(true)
    expect(chatBodies()).toHaveLength(0)
  })
})

describe('customAction', () => {
  it('explains impossible actions without effects', async () => {
    const g = familyGame(8)
    chatQueue.push(chatJsonReply({ possible: false, title: 'Nice Try', emoji: '🚫', text: "You're eight. Nobody is renting you a Lamborghini.", log: '', effects: { ...neutralEffects, happiness: 30 } }))
    const out = await run(g, { type: 'customAction', text: 'Rent a Lamborghini' })
    expect((out.queue[0] as NoticeModal).title).toBe('Nice Try')
    expect(out.character.stats.happiness).toBe(80)
    expect(out.counters.customActions).toBeUndefined()
  })

  it('applies possible actions and counts them', async () => {
    const g = familyGame(30)
    chatQueue.push(chatJsonReply({ possible: true, title: 'Garage Band', emoji: '🎸', text: 'You started a garage band. The neighbors started a petition.', log: 'I started a garage band.', effects: { ...neutralEffects, happiness: 8, money: -200 } }))
    const out = await run(g, { type: 'customAction', text: 'Start a garage band' })
    expect(out.counters.customActions).toBe(1)
    expect(out.character.money).toBe(800)
    expect(out.yearActions.doAnything).toBe(1)
  })

  it("refuses what you can't afford", async () => {
    const g = familyGame(30)
    chatQueue.push(chatJsonReply({ possible: true, title: 'Yacht', emoji: '🛥️', text: 'You bought a yacht.', log: 'I bought a yacht.', effects: { ...neutralEffects, money: -2_000_000 } }))
    const out = await run(g, { type: 'customAction', text: 'Buy a yacht' })
    expect((out.queue[0] as NoticeModal).title).toBe("Can't Afford It")
    expect(out.character.money).toBe(1000)
  })

  it('enforces the per-year limit without calling the model', async () => {
    const g = familyGame(30)
    g.yearActions.doAnything = MAX_CUSTOM_ACTIONS_PER_YEAR
    const out = await run(g, { type: 'customAction', text: 'Juggle' })
    expect((out.queue[0] as NoticeModal).title).toBe('Exhausted')
    expect(chatBodies()).toHaveLength(0)
    const fb = structuredClone(g)
    applyFallback(fb, { type: 'customAction', text: 'Juggle' })
    expect(fb.flags.fallbackCustom).toBeUndefined()
  })
})

describe('interview & obituary', () => {
  const job = { defId: 'barista', title: 'Barista', company: 'Bean There', salary: 24000, category: 'parttime' as const }

  it('presents an AI interview question with shuffled answers', async () => {
    chatQueue.push(chatJsonReply({ question: 'How do you handle a customer who wants a decaf triple espresso?', answers: [{ label: 'Smile and make it.', score: 85 }, { label: 'Lie.', score: 40 }, { label: 'Throw beans.', score: 5 }] }))
    const out = await run(familyGame(20), { type: 'interview', job })
    const iv = out.flags.interview as { job: string; q: { question: string; answers: { label: string; score: number }[] } }
    expect(iv.job).toBe('Barista')
    expect(iv.q.question).toMatch(/decaf/)
    expect(iv.q.answers.map((a) => a.label).sort()).toEqual(['Lie.', 'Smile and make it.', 'Throw beans.'])
  })

  it('falls back to the scripted interview on unusable output', async () => {
    chatQueue.push(chat('{"question": "Why?", "answers": []}'), chat('{"question": "Why?"}'))
    const out = await run(familyGame(20), { type: 'interview', job })
    expect((out.flags.interview as { q: { question: string } }).q.question).toBe('Fallback question?')
  })

  it('writes the obituary', async () => {
    const g = familyGame(80)
    g.character.alive = false
    g.character.causeOfDeath = 'Old Age'
    chatQueue.push(chatJsonReply({ text: 'Test Player, 80, died of old age after a lifetime of mild chaos. He is survived by a cat named Waffles.' }))
    const out = await run(g, { type: 'obituary' })
    expect(out.obituary).toMatch(/^Test Player, 80/)
  })
})

describe('errors', () => {
  it("explains when LM Studio can't be reached", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(runAiTask(familyGame(10), { type: 'yearEvents' }, settings, signal())).rejects.toThrow(/Can't reach LM Studio at http:\/\/lm\.test\/v1.*Start Server/)
    await expect(runAiTask(familyGame(10), { type: 'yearEvents' }, settings, signal())).rejects.toThrow(/Enable CORS.*local network.*Allow/)
  })

  it('explains when no model is loaded', async () => {
    chatQueue.push(json({ error: 'No models loaded. Please load a model in the developer page or use the `lms load` command.' }, 404))
    await expect(runAiTask(seedWith(10, false), { type: 'yearEvents' }, settings, signal())).rejects.toThrow(/No model loaded in LM Studio/)
  })

  it('reports HTTP status details', async () => {
    chatQueue.push(json({ error: { message: 'Something exploded' } }, 500))
    await expect(runAiTask(seedWith(10, false), { type: 'yearEvents' }, { ...settings, structuredOutput: false }, signal())).rejects.toThrow(/HTTP 500.*Something exploded/)
  })

  it('treats a model that only thinks as unusable (fallback)', async () => {
    chatQueue.push(chat('<think>hmm hmm hmm', 'length'))
    const out = await run(seedWith(10, true), { type: 'yearEvents' })
    expect(out.flags.fallbackYear).toBe(true)
    expect(chatBodies()).toHaveLength(1)
  })

  it('explains a dead dev-server proxy (502, empty body)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })))
    await expect(runAiTask(seedWith(10, false), { type: 'yearEvents' }, { ...settings, baseUrl: '/lmstudio/v1' }, signal())).rejects.toThrow(
      /Can't reach LM Studio at \/lmstudio\/v1/,
    )
  })

  it('explains authentication failures', async () => {
    chatQueue.push(json({ error: 'Unauthorized' }, 401))
    await expect(runAiTask(seedWith(10, false), { type: 'yearEvents' }, settings, signal())).rejects.toThrow(/requires an API token/)
    chatQueue.push(json({ error: 'Unauthorized' }, 401))
    await expect(runAiTask(seedWith(10, false), { type: 'yearEvents' }, { ...settings, apiKey: 'bad' }, signal())).rejects.toThrow(/rejected the API token/)
  })

  it('explains a page served instead of the API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })))
    await expect(runAiTask(seedWith(10, false), { type: 'yearEvents' }, settings, signal())).rejects.toThrow(/web page instead of LM Studio/)
  })

  it('propagates aborts', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(runAiTask(familyGame(10), { type: 'yearEvents' }, settings, ctrl.signal)).rejects.toThrow(/abort/i)
  })
})

describe('model selection & auth', () => {
  it('uses the model loaded in LM Studio when none is configured', async () => {
    nativeBody = { models: [{ type: 'embedding', key: 'nomic', loaded_instances: [{ id: 'nomic' }] }, { type: 'llm', key: 'qwen/qwen3-8b', loaded_instances: [{ id: 'qwen/qwen3-8b' }] }] }
    chatQueue.push(chatJsonReply({ log: ['I napped.'] }), chatJsonReply({ log: ['I napped again.'] }))
    const auto = { ...settings, model: '' }
    await run(seedWith(10, false), { type: 'yearEvents' }, auto)
    await run(seedWith(10, false), { type: 'yearEvents' }, auto)
    expect(chatBodies().map((b) => b.model)).toEqual(['qwen/qwen3-8b', 'qwen/qwen3-8b'])
    expect(calls.filter((c) => c.url.endsWith('/api/v1/models'))).toHaveLength(1) // cached
  })

  it('falls back to the first listed chat model', async () => {
    modelsBody = { data: [{ id: 'text-embedding-x' }, { id: 'llama-3.2-3b' }] }
    chatQueue.push(chatJsonReply({ log: ['I napped.'] }))
    await run(seedWith(10, false), { type: 'yearEvents' }, { ...settings, model: '' })
    expect(chatBodies()[0].model).toBe('llama-3.2-3b')
  })

  it('sends the API token only when set', async () => {
    chatQueue.push(chatJsonReply({ log: ['I napped.'] }), chatJsonReply({ log: ['I napped.'] }))
    await run(seedWith(10, false), { type: 'yearEvents' })
    await run(seedWith(10, false), { type: 'yearEvents' }, { ...settings, apiKey: 'sk-lm-123' })
    const chatsCalls = calls.filter((c) => c.url.endsWith('/chat/completions'))
    expect(chatsCalls[0].headers.Authorization).toBeUndefined()
    expect(chatsCalls[1].headers.Authorization).toBe('Bearer sk-lm-123')
  })

  it('normalizes base URLs', () => {
    expect(normalizeBaseUrl('')).toBe('/lmstudio/v1')
    expect(normalizeBaseUrl('localhost:1234')).toBe('http://localhost:1234/v1')
    expect(normalizeBaseUrl('http://127.0.0.1:1234/')).toBe('http://127.0.0.1:1234/v1')
    expect(normalizeBaseUrl('/lmstudio/v1/')).toBe('/lmstudio/v1')
  })
})

describe('testConnection', () => {
  it('lists chat models', async () => {
    const r = await testConnection(settings)
    expect(r.ok).toBe(true)
    expect(r.models).toEqual(['test-model'])
    expect(r.message).toMatch(/Connected to LM Studio · 1 model — using test-model/)
  })
  it('flags a missing configured model', async () => {
    const r = await testConnection({ ...settings, model: 'gone-model' })
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no model called "gone-model"/)
  })
  it('reports an empty server', async () => {
    modelsBody = { data: [] }
    const r = await testConnection(settings)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no model is loaded/)
  })
  it('reports connection failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    const r = await testConnection({ ...settings, baseUrl: '/lmstudio/v1' })
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/Can't reach LM Studio at \/lmstudio\/v1/)
  })
})

describe('narrateNotice & chatReply', () => {
  const n: NoticeModal = { kind: 'notice', id: 'n1', title: 'Lottery', text: 'You won $5,000 in the lottery.', ai: { when: 'balanced', facts: 'Won $5,000 in the lottery.' } }

  it('returns the rewritten text', async () => {
    chatQueue.push(chatJsonReply({ text: 'Jackpot! Well, a baby jackpot: you won $5,000 in the lottery.' }))
    expect(await narrateNotice(familyGame(30), n, settings, signal())).toMatch(/\$5,000/)
  })

  it('keeps the original when the rewrite drops the facts', async () => {
    chatQueue.push(chatJsonReply({ text: 'You won a bunch of money!' }), chatJsonReply({ text: 'You won big!' }))
    expect(await narrateNotice(familyGame(30), n, settings, signal())).toBe(n.text)
  })

  it('replies in character and clamps the relationship delta', async () => {
    const g = familyGame(16)
    const mom = g.people[0]
    chatQueue.push(chatJsonReply({ reply: 'Susan: Oh honey, I love you too!', relationshipDelta: 9, mood: 'touched' }))
    const r = await chatReply(g, mom.id, [{ from: 'npc', text: 'Hi sweetie' }], 'I love you, Mom', settings, signal())
    expect(r.reply).toBe('Oh honey, I love you too!')
    expect(r.relationshipDelta).toBe(5)
    const body = chatBodies()[0]
    const sys = (body.messages as { content: string }[])[0].content
    expect(sys).toMatch(/Susan Player/)
    const user = (body.messages as { content: string }[])[1].content
    expect(user).toMatch(/Susan: Hi sweetie/)
  })

  it('makes pets talk in animal noises', async () => {
    const g = familyGame(16)
    const cat = g.people[2]
    chatQueue.push(chatJsonReply({ reply: '*knocks your phone off the table* Mrrp.', relationshipDelta: 1, mood: 'smug' }))
    const r = await chatReply(g, cat.id, [], 'Who is a good kitty?', settings, signal())
    expect(r.reply).toMatch(/\*/)
    expect((chatBodies()[0].messages as { content: string }[])[0].content).toMatch(/cannot talk/)
  })

  it('does not call the model for the dead', async () => {
    const g = familyGame(16)
    g.people[0].alive = false
    const r = await chatReply(g, g.people[0].id, [], 'Hello?', settings, signal())
    expect(r.relationshipDelta).toBe(0)
    expect(chatBodies()).toHaveLength(0)
  })
})

describe('applyFallback', () => {
  it('dispatches every task offline', () => {
    const g = familyGame(20)
    applyFallback(g, { type: 'yearEvents' })
    applyFallback(g, { type: 'resolveChoice', event: { kind: 'choice', id: 'x', title: 't', text: 't', choices: [], source: 'ai' }, choiceId: 'a' })
    applyFallback(g, { type: 'customAction', text: 'dance' })
    applyFallback(g, { type: 'interview', job: { defId: 'a', title: 'Clerk', company: 'Shop', salary: 1, category: 'fulltime' } })
    applyFallback(g, { type: 'obituary' })
    expect(g.flags.fallbackYear && g.flags.fallbackChoice && g.flags.fallbackCustom).toBe(true)
    expect((g.flags.interview as { q: { question: string } }).q.question).toBe('Fallback question?')
    expect(g.obituary).toBe('They lived. They died. The end.')
  })
})
