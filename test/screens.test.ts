// Out-of-game screens + AI chat sheet: pure helpers and server-render smoke tests.
// The store and the AI director are mocked so these tests only exercise the UI modules.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPerson } from '../src/game/people'
import { RIBBONS } from '../src/game/ribbons'
import type { GraveyardEntry } from '../src/game/save'
import type { GameState } from '../src/game/types'
import { COUNTRIES, NAME_POOLS } from '../src/game/world'
import { DEFAULT_SETTINGS } from '../src/settings'
import { makeTestGame } from './helpers'

const mock = vi.hoisted(() => ({
  state: {
    screen: 'home',
    previousScreen: 'home',
    game: null as unknown,
    settings: {} as Record<string, unknown>,
    ai: null,
    aiStatus: 'online',
    aiMessage: 'Connected to LM Studio.',
  },
  calls: [] as string[],
}))

vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  getApp: () => mock.state,
  goTo: (s: string) => mock.calls.push(`goTo:${s}`),
  goBack: () => mock.calls.push('goBack'),
  startNewLife: () => mock.calls.push('startNewLife'),
  resumeSavedGame: () => false,
  hasSavedGame: () => false,
  continueAs: (id: string) => mock.calls.push(`continueAs:${id}`),
  abandonLife: () => mock.calls.push('abandonLife'),
  updateSettings: () => mock.calls.push('updateSettings'),
  checkAi: async () => {
    mock.calls.push('checkAi')
  },
  act: (fn: (g: unknown) => void) => fn(mock.state.game),
}))

vi.mock('../src/ai/director', () => ({
  chatReply: async () => ({ reply: 'Hi!', relationshipDelta: 3 }),
  testConnection: async () => ({ ok: true, message: 'ok', models: ['test-model'] }),
}))

const { applyChatExchange, chatBlockReason, chatKey, cleanReply, CHAT_LIMIT, ChatSheet } = await import('../src/ui/components/ChatSheet')
const { deathFacts, heirsOf, highestEducation, mournersLine, legacyRows, DeathScreen } = await import('../src/ui/screens/DeathScreen')
const { ribbonTiles, RibbonsScreen } = await import('../src/ui/screens/RibbonsScreen')
const { sortGraves, graveStats, bulldozeGrave, GraveyardScreen } = await import('../src/ui/screens/GraveyardScreen')
const { guessCountryId, cleanName, rollFirstName, rollLastName, NewLifeScreen } = await import('../src/ui/screens/NewLifeScreen')
const { HomeScreen, summarizeLife } = await import('../src/ui/screens/HomeScreen')
const { SettingsScreen } = await import('../src/ui/screens/SettingsScreen')

// Minimal in-memory localStorage for node.
function installStorage(): Map<string, string> {
  const data = new Map<string, string>()
  const storage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
  return data
}

const grave = (lifeId: string, name: string, age: number, netWorth: number): GraveyardEntry => ({
  lifeId,
  name,
  age,
  netWorth,
  generation: 1,
  gender: 'male',
  bornYear: 2000,
  diedYear: 2000 + age,
  causeOfDeath: 'Old Age',
  occupation: 'Chef',
  ribbon: null,
  obituary: null,
})

function adult(seed = 3): GameState {
  return makeTestGame(seed, { age: 30 })
}

beforeEach(() => {
  mock.calls.length = 0
  mock.state.settings = { ...DEFAULT_SETTINGS }
  mock.state.game = null
  mock.state.aiStatus = 'online'
  installStorage()
})

// ---------------------------------------------------------------------------

describe('chat rules', () => {
  it('blocks the dead, the missing, babies and over-limit chats', () => {
    const g = adult()
    const mom = createPerson(g, { relation: 'parent', age: 55, gender: 'female' })
    expect(chatBlockReason(g, mom.id)).toBeNull()
    expect(chatBlockReason(g, 'nobody')).toMatch(/no longer/)

    mom.alive = false
    expect(chatBlockReason(g, mom.id)).toMatch(/passed away/)
    mom.alive = true

    const baby = createPerson(g, { relation: 'child', age: 1 })
    expect(chatBlockReason(g, baby.id)).toMatch(/too young to talk back/)

    const pet = createPerson(g, { relation: 'pet', age: 1, species: 'Dog' })
    expect(chatBlockReason(g, pet.id)).toBeNull()

    g.yearActions[chatKey(mom.id)] = CHAT_LIMIT
    expect(chatBlockReason(g, mom.id)).toMatch(/ear off/)

    const tiny = makeTestGame(1, { age: 2 })
    const dad = createPerson(tiny, { relation: 'parent', age: 30 })
    expect(chatBlockReason(tiny, dad.id)).toMatch(/too young/)

    g.character.alive = false
    expect(chatBlockReason(g, pet.id)).toMatch(/dead/)
  })

  it('only lets prisoners reach family, partners and cellmates', () => {
    const g = adult()
    g.character.prison = {
      name: 'State Pen',
      security: 'medium',
      crime: 'Burglary',
      sentenceYears: 4,
      yearsServed: 1,
      respect: 30,
      appealed: false,
      escapeAttempts: 0,
    }
    const friend = createPerson(g, { relation: 'friend', age: 30 })
    const sister = createPerson(g, { relation: 'sibling', age: 28 })
    const cellie = createPerson(g, { relation: 'cellmate', age: 40 })
    expect(chatBlockReason(g, friend.id)).toMatch(/prison/)
    expect(chatBlockReason(g, sister.id)).toBeNull()
    expect(chatBlockReason(g, cellie.id)).toBeNull()
  })

  it('applies an exchange: uses a chat, clamps the delta, counts, logs once a year', () => {
    const g = adult()
    const friend = createPerson(g, { relation: 'friend', age: 30, relationship: 50 })
    const d1 = applyChatExchange(g, friend.id, 'How are you?', 'Great!', 99)
    expect(d1).toBe(10)
    expect(friend.relationship).toBe(60)
    expect(g.yearActions[chatKey(friend.id)]).toBe(1)
    expect(g.counters.conversations).toBe(1)
    const lines = () => g.log[g.log.length - 1].entries.length
    expect(lines()).toBe(1)
    expect(friend.notes.length).toBe(1)

    const d2 = applyChatExchange(g, friend.id, "You're annoying", 'Wow. Rude.', -40)
    expect(d2).toBe(-15)
    expect(friend.relationship).toBe(45)
    expect(lines()).toBe(1) // logged once per person per year
    expect(friend.notes.length).toBe(2) // big swings are remembered

    applyChatExchange(g, friend.id, 'ok', 'ok', 1)
    expect(friend.notes.length).toBe(2) // small talk isn't

    expect(applyChatExchange(g, friend.id, 'x', 'y', Number.NaN)).toBe(0)
    expect(JSON.parse(JSON.stringify(g))).toEqual(g) // still plain JSON
  })

  it('stops counting at the yearly limit and ignores the dead', () => {
    const g = adult()
    const p = createPerson(g, { relation: 'friend', age: 30, relationship: 50 })
    for (let i = 0; i < CHAT_LIMIT; i++) applyChatExchange(g, p.id, 'hi', 'hi', 1)
    const rel = p.relationship
    expect(applyChatExchange(g, p.id, 'hi', 'hi', 5)).toBe(0)
    expect(p.relationship).toBe(rel)
    expect(g.counters.conversations).toBe(CHAT_LIMIT)
    p.alive = false
    expect(applyChatExchange(g, p.id, 'hi', 'hi', 5)).toBe(0)
  })

  it('cleans model replies', () => {
    expect(cleanReply('  "Hello there!"  ')).toBe('Hello there!')
    expect(cleanReply('')).toBe('…')
    expect(cleanReply(undefined)).toBe('…')
    expect(cleanReply('x'.repeat(2000)).length).toBeLessThanOrEqual(700)
  })
})

// ---------------------------------------------------------------------------

describe('death screen helpers', () => {
  function deadGame(): GameState {
    const g = makeTestGame(5, { age: 81, gender: 'female' })
    g.character.alive = false
    g.character.causeOfDeath = 'Old Age'
    g.flags.finalOccupation = 'Retired'
    g.character.money = 125000
    g.counters = { marriages: 2, murders: 0, crimes: 3 }
    return g
  }

  it('picks the highest degree', () => {
    const g = deadGame()
    expect(highestEducation(g)).toBe('None')
    g.character.education.degrees.push(
      { kind: 'highschool', name: 'High School Diploma', school: 'Central High', age: 18 },
      { kind: 'md', name: 'Doctor of Medicine', school: 'State Med', age: 30 },
      { kind: 'bachelor', name: "Bachelor's in Biology", school: 'State U', age: 22 },
    )
    expect(highestEducation(g)).toBe('Doctor of Medicine')
  })

  it('lists living children oldest first as heirs', () => {
    const g = deadGame()
    const a = createPerson(g, { relation: 'child', age: 40 })
    const b = createPerson(g, { relation: 'stepchild', age: 52 })
    const c = createPerson(g, { relation: 'child', age: 45 })
    c.alive = false
    createPerson(g, { relation: 'friend', age: 60 })
    expect(heirsOf(g).map((p) => p.id)).toEqual([b.id, a.id])
  })

  it('shows optional tombstone facts only when they apply', () => {
    const g = deadGame()
    const labels = deathFacts(g).map((f) => f.label)
    expect(labels).toContain('Net worth')
    expect(labels).toContain('Marriages')
    expect(labels).toContain('Crimes')
    expect(labels).not.toContain('Murders')
    expect(deathFacts(g).find((f) => f.label === 'Net worth')?.value).toBe('$125,000')
  })

  it('writes who mourned', () => {
    const g = deadGame()
    expect(mournersLine(g)).toMatch(/funeral|showed up/)
    const husband = createPerson(g, { relation: 'spouse', age: 80, gender: 'male', relationship: 90 })
    createPerson(g, { relation: 'child', age: 50, relationship: 80 })
    createPerson(g, { relation: 'child', age: 48, relationship: 70 })
    createPerson(g, { relation: 'pet', age: 3, species: 'Dog', firstName: 'Rex' })
    const line = mournersLine(g)
    expect(line).toContain(`her husband ${husband.firstName}`)
    expect(line).toContain('2 children')
    expect(line).toContain('her loyal dog Rex')
  })

  it('builds the family legacy', () => {
    const g = deadGame()
    g.generation = 2
    g.ancestors.push({
      generation: 1,
      name: 'Old Timer',
      gender: 'male',
      bornYear: 1950,
      diedYear: 2020,
      age: 70,
      causeOfDeath: 'Heart Attack',
      netWorth: 1000,
      occupation: 'Plumber',
      ribbon: RIBBONS[0].id,
    })
    const rows = legacyRows(g)
    expect(rows).toHaveLength(2)
    expect(rows[0].ribbonEmoji).toBe(RIBBONS[0].emoji)
    expect(rows[1].current).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('ribbons, graveyard, new life helpers', () => {
  it('hides secret ribbons until earned', () => {
    const secret = RIBBONS.find((r) => r.secret)
    const tiles = ribbonTiles({ [RIBBONS[0].id]: 2 })
    expect(tiles).toHaveLength(RIBBONS.length)
    expect(tiles[0].earned).toBe(true)
    expect(tiles[0].count).toBe(2)
    if (secret) {
      expect(tiles.find((t) => t.def.id === secret.id)?.name).toBe('???')
      expect(ribbonTiles({ [secret.id]: 1 }).find((t) => t.def.id === secret.id)?.name).toBe(secret.name)
    }
  })

  it('sorts graves and summarizes them', () => {
    const list = [grave('a', 'Zed', 50, 10), grave('b', 'Amy', 90, -5), grave('c', 'Bob', 70, 900)]
    expect(sortGraves(list, 'recent').map((e) => e.lifeId)).toEqual(['a', 'b', 'c'])
    expect(sortGraves(list, 'netWorth').map((e) => e.lifeId)).toEqual(['c', 'a', 'b'])
    expect(sortGraves(list, 'age').map((e) => e.lifeId)).toEqual(['b', 'c', 'a'])
    expect(sortGraves(list, 'name').map((e) => e.lifeId)).toEqual(['b', 'c', 'a'])
    const s = graveStats(list)
    expect(s.lives).toBe(3)
    expect(s.oldest?.name).toBe('Amy')
    expect(s.richest?.name).toBe('Bob')
    expect(graveStats([]).oldest).toBeNull()
  })

  it('bulldozes one grave from storage', () => {
    localStorage.setItem('anotherlife.graveyard.v1', JSON.stringify([grave('a', 'A', 1, 0), grave('b', 'B', 2, 0)]))
    expect(bulldozeGrave('a').map((e) => e.lifeId)).toEqual(['b'])
    expect(JSON.parse(localStorage.getItem('anotherlife.graveyard.v1')!)).toHaveLength(1)
  })

  it('guesses the country and rolls names from its pool', () => {
    expect(guessCountryId('en-GB')).toBe('gb')
    expect(guessCountryId('ja')).toBe(COUNTRIES.some((c) => c.id === 'jp') ? 'jp' : COUNTRIES[0].id)
    expect(guessCountryId('xx-ZZ')).toBe(COUNTRIES[0].id)
    expect(guessCountryId(undefined)).toBe(COUNTRIES[0].id)
    expect(cleanName('  mary   jane  ')).toBe('Mary jane')
    expect(cleanName('de Jong', false)).toBe('de Jong')
    expect(cleanName('x'.repeat(50)).length).toBe(20)
    for (let i = 0; i < 20; i++) {
      expect(NAME_POOLS.japanese.female).toContain(rollFirstName('jp', 'female'))
      expect(NAME_POOLS.anglo.last).toContain(rollLastName('us'))
    }
    expect(rollFirstName('us', 'male', 'James')).not.toBe('James')
  })
})

// ---------------------------------------------------------------------------

describe('screens render', () => {
  const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

  it('home shows the menu and AI status', () => {
    const html = render(createElement(HomeScreen))
    expect(html).toContain('AnotherLife')
    expect(html).toContain('New Life')
    expect(html).toContain('Ribbons')
    expect(html).toContain('Graveyard')
    expect(html).toContain('Settings')
    expect(html).not.toContain('Continue Life')
    expect(html).toContain('AI narrator is ready')

    mock.state.aiStatus = 'offline'
    expect(render(createElement(HomeScreen))).toContain('Start Server')

    mock.state.game = adult()
    expect(render(createElement(HomeScreen))).toContain('Continue Life')
    expect(summarizeLife(adult()).name).toBe('Test Player')
  })

  it('new life has random and custom options', () => {
    const html = render(createElement(NewLifeScreen))
    expect(html).toContain('Random Life')
    expect(html).toContain('Custom Life')
    expect(html).toContain('Start Life')
    for (const c of COUNTRIES) expect(html).toContain(c.name)
  })

  it('settings shows every section', () => {
    const html = render(createElement(SettingsScreen))
    for (const text of ['AI Narration', 'Balanced', 'LM Studio Connection', 'Test connection', 'Auto: use the loaded model', 'How to set up LM Studio', 'Danger Zone']) {
      expect(html).toContain(text)
    }
  })

  it('ribbons and graveyard render (empty and full)', () => {
    expect(render(createElement(RibbonsScreen))).toContain(`0 / ${RIBBONS.length}`)
    expect(render(createElement(GraveyardScreen))).toContain('No graves yet')
    localStorage.setItem(
      'anotherlife.graveyard.v1',
      JSON.stringify([{ ...grave('z', 'Zara Quill', 77, 5000), ribbon: RIBBONS[1].id, obituary: 'She was fine.' }]),
    )
    const html = render(createElement(GraveyardScreen))
    expect(html).toContain('Zara Quill')
    expect(html).toContain('age 77')
  })

  it('death screen shows the tombstone, ribbon and heirs', () => {
    const g = makeTestGame(9, { age: 70 })
    g.character.alive = false
    g.character.causeOfDeath = 'Heart Attack'
    g.ribbon = RIBBONS[0].id
    g.obituary = 'Test Player loved soup.'
    const kid = createPerson(g, { relation: 'child', age: 40, firstName: 'Junie' })
    const html = render(createElement(DeathScreen, { game: g }))
    expect(html).toContain('Here lies')
    expect(html).toContain('R.I.P.')
    expect(html).toContain('Heart Attack')
    expect(html).toContain(RIBBONS[0].name)
    expect(html).toContain('Test Player loved soup.')
    expect(html).toContain('Continue as Junie')
    expect(html).toContain(`${g.year - 70} – ${g.year}`)
    expect(kid.alive).toBe(true)
  })

  it('chat sheet: AI off note, blocked note and normal chat', () => {
    const g = adult()
    const mom = createPerson(g, { relation: 'parent', age: 58, gender: 'female', firstName: 'Linda' })
    mock.state.game = g
    let html = render(createElement(ChatSheet, { personId: mom.id, onClose: () => {} }))
    expect(html).toContain('Message Linda')
    expect(html).toContain('Can I borrow money?')
    expect(html).toContain(`${CHAT_LIMIT} messages left this year`)

    mock.state.settings = { ...DEFAULT_SETTINGS, aiLevel: 'off' }
    html = render(createElement(ChatSheet, { personId: mom.id, onClose: () => {} }))
    expect(html).toContain('Live chat needs the AI narrator')

    mock.state.settings = { ...DEFAULT_SETTINGS }
    g.yearActions[chatKey(mom.id)] = CHAT_LIMIT
    html = render(createElement(ChatSheet, { personId: mom.id, onClose: () => {} }))
    expect(html).toContain('ear off')

    html = render(createElement(ChatSheet, { personId: 'ghost', onClose: () => {} }))
    expect(html).toContain('no longer part of your life')
  })
})
