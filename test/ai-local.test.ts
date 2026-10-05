// The narrator is local and doesn't repeat itself:
// - every prompt carries a LOCAL LIFE line for the player's actual country (school words, the
//   big exam, holidays, food, sports, transport, weather, faith) and the rule to stay there;
// - AI flavor lines that repeat or paraphrase the last ten years of the log are dropped, as are
//   lines where the character does something big the player never chose;
// - AI and offline events don't come back (or hit the same person the same way) for years.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyFallback,
  claimsBigAction,
  isRepeatEvent,
  planYear,
  runAiTask,
  similarLines,
  toGameEffects,
} from '../src/ai/director'
import { resetLmStudioSession } from '../src/ai/lmstudio'
import {
  EVENT_THEMES,
  describeCharacter,
  estimateTokens,
  eventMemory,
  localLifeLine,
  localizeTheme,
  narratorSystem,
  recentAiEvents,
  schoolLabels,
  stageRule,
  yearEventsPrompt,
} from '../src/ai/prompts'
import { NEUTRAL_EFFECTS } from '../src/ai/schemas'
import { ageUp } from '../src/game/aging'
import { currentLogYear } from '../src/game/core'
import { hasLocaleData, localeOf } from '../src/game/data/locales'
import { EVENT_LIBRARY, eventKind, foreignToLocale, lastFired, queueFallbackYearEvents } from '../src/game/events'
import { EVENT_SCRIPT } from '../src/game/events/helpers'
import { createNewLife } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, LifeStage, ModalItem, Person } from '../src/game/types'
import { DEFAULT_SETTINGS, type Settings } from '../src/settings'

const COUNTRIES = ['us', 'id', 'et', 'jp', 'br', 'in', 'ng', 'de', 'sa', 'mx'] as const
/** Things only an American life should ever see. */
const AMERICANISMS = [/Las Vegas/, /Northgate/, /Meadowbrook/, /\bSATs?\b/, /\bDMV\b/, /(?<![\d$.,])\b911\b(?![\d,])/, /Thanksgiving/, /Fourth of July/, /Super Bowl/, /lemonade stand/]

/** The Americanisms a country must never see (Mexico dials 911, Canada has Thanksgiving...). */
function americanismsFor(id: string): RegExp[] {
  if (id === 'us') return []
  const loc = localeOf(id)
  const all = [loc.terms.finalExam, loc.terms.licenseOffice, loc.terms.emergencyNumber, ...loc.holidays, ...loc.getaways, ...loc.sports].join(' | ')
  return AMERICANISMS.filter((re) => !re.test(all))
}

const settings: Settings = { ...DEFAULT_SETTINGS, baseUrl: 'http://lm.test/v1', model: 'test-model', disableThinking: false }

function life(countryId: string, seed = 11): GameState {
  return createNewLife({ seed, year: 2026, countryId })
}

/** A life of the given age with the popups answered offline. */
function grown(countryId: string, age: number, seed = 11): GameState {
  const g = life(countryId, seed)
  drainOffline(g)
  while (g.character.alive && g.character.age < age) {
    ageUp(g)
    drainOffline(g)
  }
  return g
}

function minigameResult(m: Extract<ModalItem, { kind: 'minigame' }>): string {
  if (m.game === 'annualReport') return 'skip'
  if (m.game === 'burglary') return JSON.stringify({ loot: 0, caught: false })
  if (m.game === 'prisonEscape') return 'caught'
  if (m.game === 'pickpocket') return 'fail'
  if (m.game === 'blackjack') return 'push'
  return 'done'
}

/** Resolve one popup the way the store does (offline), returning it. */
function resolveOne(g: GameState, m: ModalItem): void {
  if (m.kind === 'choice') {
    const choice = m.choices[m.choices.length - 1]
    if (m.source === 'script') runScript(g, m.scriptId!, choice.id, m.data, m)
    else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
  } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || '1', m.data, m)
  else if (m.kind === 'minigame') runScript(g, m.scriptId, minigameResult(m), m.data, m)
  else if (m.kind === 'aiTask') applyFallback(g, m.task)
}

function drainOffline(g: GameState): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    resolveOne(g, m)
    g.queue.unshift(...g.queue.splice(before))
  }
}

// ---------------------------------------------------------------------------
// Mock AI server (OpenAI-compatible, like LM Studio)

type Reply = (body: Record<string, unknown>) => unknown
let reply: Reply = () => ({ log: [] })
let prompts: string[] = []

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  prompts = []
  resetLmStudioSession()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
      if (url.endsWith('/chat/completions')) {
        const msgs = body.messages as { role: string; content: string }[]
        prompts.push(msgs.map((m) => m.content).join('\n'))
        const content = JSON.stringify(reply(body))
        return json({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] })
      }
      if (url.endsWith('/v1/models') && !url.includes('/api/')) return json({ object: 'list', data: [{ id: 'test-model', object: 'model' }] })
      return json({ error: 'not found' }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Age up once with the AI narrating the year (other AI tasks fall back offline). */
async function aiYear(g: GameState, shown: ChoiceModal[]): Promise<void> {
  ageUp(g)
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'aiTask' && m.task.type === 'yearEvents') {
      const apply = await runAiTask(structuredClone(g), m.task, settings, new AbortController().signal)
      apply(g)
    } else {
      if (m.kind === 'choice') shown.push(m)
      resolveOne(g, m)
    }
    g.queue.unshift(...g.queue.splice(before))
  }
}

function addBrother(g: GameState, name = 'Hendra'): Person {
  return createPerson(g, { relation: 'sibling', age: g.character.age + 2, gender: 'male', firstName: name, lastName: g.character.lastName, relationship: 60, livesWithPlayer: true })
}

// ---------------------------------------------------------------------------

describe('near-duplicate life-log lines', () => {
  function family(): GameState {
    const g = life('id')
    g.people = g.people.filter((p) => p.relation !== 'sibling' && p.relation !== 'halfSibling' && p.relation !== 'stepsibling')
    addBrother(g, 'Hendra')
    createPerson(g, { relation: 'sibling', age: 4, gender: 'female', firstName: 'Sari', relationship: 60 })
    return g
  }

  it('catches the same moment told again', () => {
    const g = family()
    const base = 'I attacked my brother Hendra.'
    expect(similarLines(g, base, 'I attacked my brother Hendra again!')).toBe(true)
    expect(similarLines(g, base, 'I got into a fight with my brother Hendra.')).toBe(true)
    expect(similarLines(g, base, 'I punched Hendra in the kitchen.')).toBe(true)
    expect(similarLines(g, base, 'Hendra and I got into a huge fist fight over the TV remote.')).toBe(true)
    expect(similarLines(g, 'I collected 40 rocks.', 'I collected 55 rocks!')).toBe(true)
    expect(similarLines(g, 'I built a kite with my brother Hendra.', 'Me and Hendra built a kite again.')).toBe(true)
  })

  it('keeps genuinely different lines', () => {
    const g = family()
    const base = 'I attacked my brother Hendra.'
    expect(similarLines(g, base, 'I built a sandcastle with my brother Hendra.')).toBe(false)
    expect(similarLines(g, base, 'I attacked my sister Sari.')).toBe(false)
    expect(similarLines(g, 'I played chess with my brother.', 'I played badminton with my brother.')).toBe(false)
    expect(similarLines(g, 'I learned to swim.', 'I learned to ride a bike.')).toBe(false)
    expect(similarLines(g, 'I had lunch with Hendra.', 'I had lunch with Sari.')).toBe(false)
    expect(similarLines(g, 'I lost my first tooth.', 'I found a coin in the gutter.')).toBe(false)
  })

  it('flags flavor lines where the character does something big the player never chose', () => {
    for (const line of [
      'I attacked my brother Hendra.',
      'I got into a fight at school.',
      'I quit my job at the bakery.',
      'I broke up with Ayu over text.',
      'I bought a brand-new car.',
      'I adopted a kitten named Mochi.',
      'I moved to Bandung.',
      'I finally stole a bike.',
      'I got a part-time job at a warung.',
    ]) {
      expect(claimsBigAction(line), line).toBe(true)
    }
    for (const line of [
      'I tripped over the cat twice.',
      'I killed a spider with a sandal.',
      'I got a gold star for spelling.',
      'I learned to whistle.',
      'My brother Hendra stole my bike.',
      'I broke up a fight between two goats.',
      'I proposed a toast at dinner.',
      'I bought a cat toy that the cat ignored.',
      'I was fired up for the school play.',
      'I moved to the front row in class.',
      'I had a pillow fight with Sari.',
    ]) {
      expect(claimsBigAction(line), line).toBe(false)
    }
  })

  it('drops repeated outcome lines and memories', () => {
    const g = family()
    g.character.age = 12
    currentLogYear(g).entries.push({ id: 'x1', text: 'I attacked my brother Hendra.', tone: 'bad' })
    g.character.memories.push('Age 12: I won the school spelling bee.')
    const eff = toGameEffects(g, { ...NEUTRAL_EFFECTS, memory: 'I won the school spelling bee!' }, 'I got into a fight with my brother Hendra.', 2)
    expect(eff.log).toBeUndefined()
    expect(eff.memory).toBeUndefined()
    const fresh = toGameEffects(g, { ...NEUTRAL_EFFECTS, memory: 'I met my first pen pal.' }, 'I fixed my bike with Sari.', 2)
    expect(fresh.log).toBe('I fixed my bike with Sari.')
    expect(fresh.memory).toBe('I met my first pen pal.')
    // A year later the player picks a fight again: that's news. Parroting last year's line word for word isn't.
    g.character.age = 13
    currentLogYear(g)
    expect(toGameEffects(g, NEUTRAL_EFFECTS, 'I got into a fight with my brother Hendra.', 2).log).toBe('I got into a fight with my brother Hendra.')
    expect(toGameEffects(g, NEUTRAL_EFFECTS, 'I attacked my brother Hendra!', 2).log).toBeUndefined()
  })
})

describe('the AI narrator over a decade', () => {
  it('logs a line the model keeps returning only once and never lets it attack anyone', async () => {
    const g = grown('id', 5)
    addBrother(g)
    const variants = ['I built a kite with my brother Hendra.', 'I built a kite with Hendra again!', 'Me and my brother Hendra built a kite.']
    let n = 0
    reply = () => ({
      log: [variants[n++ % variants.length], 'I attacked my brother Hendra.'],
      event: {
        title: 'Kite Contest',
        emoji: '🪁',
        text: 'Hendra challenges you to a kite contest at the field. What will you do?',
        person: 'Hendra',
        choices: [
          { label: 'Accept', emoji: '' },
          { label: 'Cut his string', emoji: '' },
        ],
      },
    })
    const shown: ChoiceModal[] = []
    for (let i = 0; i < 10 && g.character.alive; i++) await aiYear(g, shown)
    expect(g.character.age).toBeGreaterThanOrEqual(15)
    const ai = g.log.flatMap((y) => y.entries.filter((e) => e.tone === 'ai').map((e) => e.text))
    expect(ai.filter((t) => /kite/i.test(t))).toHaveLength(1)
    expect(ai.filter((t) => /attack/i.test(t))).toHaveLength(0)
    // The same AI event is not shown again within six years.
    const kiteAges = shown.filter((m) => m.title === 'Kite Contest').map((m) => (m.data as { age: number }).age)
    expect(kiteAges.length).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < kiteAges.length; i++) expect(kiteAges[i] - kiteAges[i - 1]).toBeGreaterThanOrEqual(6)
    // The prompt told the model not to copy the log, and stayed in Indonesia.
    const last = prompts[prompts.length - 1]
    expect(last).toMatch(/Never repeat or reword RECENT LOG/)
    expect(last).toMatch(/LOCAL LIFE \(Indonesia\)/)
    for (const t of ai) expect(t).not.toMatch(/undefined|NaN|\{\w+\}/)
  })

  it('remembers events from both sources and shows them to the model', async () => {
    const g = grown('et', 9)
    queueFallbackYearEvents(g, { flavor: false, event: 'always' })
    const offline = g.queue.find((m) => m.kind === 'choice') as ChoiceModal
    expect(offline).toBeTruthy()
    const memo = eventMemory(g)
    expect(memo[memo.length - 1]).toMatchObject({ title: offline.title, age: 9, source: 'offline' })
    expect(recentAiEvents(g).join(' ')).toContain(offline.title)
    expect(yearEventsPrompt(g, { ...planYear(g), wantEvent: true })).toContain(offline.title)
  })
})

describe('AI event repeats', () => {
  it('rejects the same title or the same thing about the same person within a few years', () => {
    const g = grown('br', 10)
    const bro = addBrother(g, 'Thiago')
    g.flags.eventMemory = [{ title: 'Sibling Showdown', age: 8, personId: bro.id, person: 'Thiago', kind: 'a sibling', source: 'ai' }]
    expect(isRepeatEvent(g, 'Sibling Showdown!', undefined, 'a pet')).toBe(true)
    expect(isRepeatEvent(g, 'The Great Showdown', bro, 'a dare')).toBe(true)
    expect(isRepeatEvent(g, 'Garage Band', bro, 'a sibling')).toBe(true)
    expect(isRepeatEvent(g, 'Garage Band', bro, 'a talent show')).toBe(false)
    expect(isRepeatEvent(g, 'Stray Puppy', undefined, 'a pet')).toBe(false)
    g.character.age = 16
    expect(isRepeatEvent(g, 'Sibling Showdown', bro, 'a sibling')).toBe(false)
  })

  it("forgets a parent's events when the player carries on as their child", () => {
    const g = grown('de', 12)
    g.flags.eventMemory = [{ title: 'Bike Theft', age: 11, personId: '', person: '', kind: 'a dare', source: 'ai', gen: g.generation }]
    expect(isRepeatEvent(g, 'Bike Theft', undefined, 'a pet')).toBe(true)
    g.flags.offlineEventHistory = { 'kid.boardGame': 11 }
    g.flags.offlineEventGeneration = g.generation
    expect(lastFired(g, 'kid.boardGame')).toBe(11)
    g.generation += 1
    expect(lastFired(g, 'kid.boardGame')).toBeUndefined()
    expect(isRepeatEvent(g, 'Bike Theft', undefined, 'a pet')).toBe(false)
    expect(recentAiEvents(g)).toEqual([])
    queueFallbackYearEvents(g, { flavor: false, event: 'always' })
    expect(eventMemory(g).every((m) => m.gen === g.generation)).toBe(true)
  })

  it('rotates the suggested theme away from recent ones', () => {
    const g = grown('jp', 10)
    const first = planYear(g)
    g.flags.eventMemory = [{ title: 'Whatever', age: 9, personId: '', person: '', kind: first.themeKey, source: 'ai' }]
    const second = planYear(g)
    expect(second.themeKey).not.toBe(first.themeKey)
    expect(planYear(g)).toEqual(second)
  })
})

describe('offline events: cooldowns by kind and person', () => {
  it('never shows the same kind of event about the same person within five years, or one kind twice in three', () => {
    for (const seed of [3, 21]) {
      const g = grown('ng', 6, seed)
      addBrother(g, 'Chidi')
      const fired: { id: string; age: number; person: string }[] = []
      for (let age = 6; age <= 70 && g.character.alive; age++) {
        g.character.age = age
        currentLogYear(g)
        queueFallbackYearEvents(g, { event: 'always' })
        const m = g.queue.find((x) => x.kind === 'choice') as ChoiceModal | undefined
        const data = m?.data as { eventId?: string; personId?: string } | undefined
        if (data?.eventId) fired.push({ id: data.eventId, age, person: data.personId ?? '' })
        drainOffline(g)
        g.queue = []
        g.character.stats.health = 90
      }
      expect(fired.length).toBeGreaterThan(30)
      for (let i = 0; i < fired.length; i++) {
        for (let j = i + 1; j < fired.length; j++) {
          const a = fired[i]
          const b = fired[j]
          const gap = b.age - a.age
          if (a.id !== b.id && eventKind(a.id) === eventKind(b.id) && eventKind(a.id) !== a.id) expect(gap, `${a.id} → ${b.id}`).toBeGreaterThanOrEqual(3)
          if (a.person && a.person === b.person && eventKind(a.id) === eventKind(b.id)) expect(gap, `${a.id} → ${b.id} (same person)`).toBeGreaterThanOrEqual(5)
        }
      }
    }
  })

  it('groups only events that exist', () => {
    const ids = new Set(EVENT_LIBRARY.map((e) => e.id))
    const grouped = EVENT_LIBRARY.filter((e) => eventKind(e.id) !== e.id)
    expect(grouped.length).toBeGreaterThan(20)
    for (const e of grouped) expect(ids.has(e.id)).toBe(true)
  })
})

describe('locale guard', () => {
  it('keeps American scenes for Americans and out of other countries unless they fit', () => {
    for (const id of COUNTRIES) {
      const g = life(id)
      const loc = localeOf(id)
      const us = id === 'us'
      expect(foreignToLocale(g, 'I ran a lemonade stand and made $13.'), id).toBe(!us)
      expect(foreignToLocale(g, 'We spent Thanksgiving at Grandma’s.'), id).toBe(!us && !loc.holidays.some((h) => /Thanksgiving/i.test(h)))
      expect(foreignToLocale(g, 'Prom is coming up! What will you do?'), id).toBe(!us && !/\bprom\b|homecoming/i.test(loc.terms.schoolDance))
      expect(foreignToLocale(g, 'Someone called 911.'), id).toBe(!us && !loc.terms.emergencyNumber.includes('911'))
      expect(foreignToLocale(g, 'School closed for a snow day!'), id).toBe(!us && !loc.snow)
      expect(foreignToLocale(g, 'I inherited $12,911.'), id).toBe(false)
      expect(foreignToLocale(g, 'I learned to ride a bike.'), id).toBe(false)
      expect(foreignToLocale(g, 'Homecoming: the cat wandered back after two days.'), id).toBe(false)
    }
  })

  it('offline years outside the US skip American events and flavor lines', () => {
    for (const id of COUNTRIES.filter((c) => c !== 'us')) {
      for (const seed of [1, 2]) {
        const g = grown(id, 4, seed)
        const seen: string[] = []
        for (let age = 5; age <= 45 && g.character.alive; age++) {
          g.character.age = age
          const year = currentLogYear(g)
          const before = year.entries.length
          queueFallbackYearEvents(g, { event: 'always' })
          seen.push(...year.entries.slice(before).map((e) => e.text))
          for (const m of g.queue) if (m.kind === 'choice' && m.scriptId === EVENT_SCRIPT) seen.push(m.title, m.text, ...m.choices.map((c) => c.label))
          drainOffline(g)
          g.queue = []
          g.character.stats.health = 90
        }
        expect(seen.length, `${id}/${seed}`).toBeGreaterThan(40)
        for (const t of seen) for (const re of americanismsFor(id)) expect(t, `${id}/${seed}`).not.toMatch(re)
        for (const t of seen) expect(foreignToLocale(g, t), `${id}/${seed}: ${t}`).toBe(false)
      }
    }
  })

  it('drops American AI lines and events outside the US', async () => {
    const g = grown('et', 15)
    reply = () => ({
      log: ['I asked someone to prom and got turned down.', 'I helped my mother roast coffee beans.'],
      event: { title: 'Prom Night', emoji: '💃', text: 'Prom is next week and nobody has asked you. What will you do?', person: '', choices: [{ label: 'Ask someone', emoji: '' }, { label: 'Stay home', emoji: '' }] },
    })
    const shown: ChoiceModal[] = []
    await aiYear(g, shown)
    const ai = g.log[g.log.length - 1].entries.filter((e) => e.tone === 'ai').map((e) => e.text)
    expect(ai).toEqual(['I helped my mother roast coffee beans.'])
    expect(shown.some((m) => /prom/i.test(m.title + m.text))).toBe(false)
  })
})

describe('LOCAL LIFE and local prompts', () => {
  it('describes each country in its own words', () => {
    const lines = new Map<string, string>()
    for (const id of COUNTRIES) {
      const g = grown(id, 15)
      const line = localLifeLine(g)
      lines.set(id, line)
      const loc = localeOf(id)
      expect(line).toMatch(/^LOCAL LIFE \(/)
      expect(line).toContain(loc.terms.high)
      expect(line).toContain(loc.holidays[0])
      expect(line).toContain(loc.foods[0])
      expect(line).toContain(loc.snow ? 'snowy winters' : 'no snow')
      expect(line).not.toMatch(/undefined|NaN|\{\w+\}/)
      expect(estimateTokens(line)).toBeLessThan(140)
      expect(describeCharacter(g)).toContain(line)
      for (const re of americanismsFor(id)) expect(line, `${id}: ${re}`).not.toMatch(re)
    }
    expect(lines.get('id')).not.toBe(lines.get('et'))
    expect(lines.get('id')).not.toBe(lines.get('us'))
    expect(lines.get('et')).not.toBe(lines.get('us'))
    if (hasLocaleData('us')) expect(lines.get('us')).toMatch(/SAT|Thanksgiving|prom/)
  })

  it('names school stages the local way and keeps American words for Americans only', () => {
    for (const id of COUNTRIES) {
      const labels = schoolLabels(id)
      expect(labels.elementary.toLowerCase()).toBe(localeOf(id).terms.primary.toLowerCase())
      expect(labels.high.toLowerCase()).toBe(localeOf(id).terms.high.toLowerCase())
      const g = grown(id, 15)
      expect(stageRule(g, 'teen')).toContain(`${localeOf(id).terms.high} drama`)
      for (const stage of Object.keys(EVENT_THEMES) as (LifeStage | 'prison')[]) {
        for (const theme of EVENT_THEMES[stage]) {
          for (const r of [0, 0.37, 0.99]) {
            const t = localizeTheme(theme, id, r)
            expect(t, theme).not.toMatch(/[{}]|undefined/)
            expect(t.trim().length).toBeGreaterThan(2)
            for (const re of americanismsFor(id)) expect(t, `${id}: ${theme}`).not.toMatch(re)
          }
        }
      }
    }
    expect(localizeTheme('{kidStand}', 'us')).toBe('a lemonade stand')
    expect(localizeTheme('{kidStand}', 'id')).not.toMatch(/lemonade/)
    if (hasLocaleData('us')) expect(localizeTheme('{schoolDance}', 'us')).toMatch(/prom|homecoming/i)
  })

  it('asks the model to stay local, also after emigrating', () => {
    const sys = narratorSystem(settings)
    expect(sys).toMatch(/SETTING: their country/)
    expect(sys).toMatch(/Nothing American unless they live in the US/)
    expect(sys).not.toMatch(/gas station burrito/)
    const g = grown('in', 30)
    g.character.countryId = 'de'
    g.character.city = 'Berlin'
    const prompt = yearEventsPrompt(g, { ...planYear(g), wantEvent: true })
    expect(prompt).toMatch(/PLACE: Berlin, Germany \(born in India\)/)
    expect(prompt).toMatch(/LOCAL LIFE \(Germany\)/)
    expect(prompt).not.toMatch(/LOCAL LIFE \(India\)/)
  })

  it('keeps the prompt short enough for small local models', () => {
    for (const [id, age] of [['us', 8], ['id', 15], ['et', 30], ['sa', 45], ['mx', 70]] as const) {
      const g = grown(id, age)
      const total = estimateTokens(narratorSystem(settings)) + estimateTokens(yearEventsPrompt(g, { ...planYear(g), wantEvent: true }))
      expect(total, `${id} at ${age}`).toBeLessThan(1900)
    }
  })
})
