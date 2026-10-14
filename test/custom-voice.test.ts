// Do Anything in the house voice (docs/VOICE.md, Part A task A3). Outcomes say what happened, with no
// "You decided to" frame, and the life-log line is "I" plus the phrase. Text that no rule knows gets one
// concrete consequence with a small stat change. The self-harm outcome keeps its behaviour; its story is
// plain, and the real-world help line is UI: NoticeModal.support, drawn under the text by ModalHost.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BANNED_ANYWHERE } from '../scripts/voice/rules.mjs'
import { currentLogYear, formatMoney, notice } from '../src/game/core'
import { resolveCustomAction } from '../src/game/events/custom'
import { loadGame, saveGame } from '../src/game/save'
import { SAVE_KEY } from '../src/game/save-backends'
import { isLoadableGame } from '../src/game/save-schema'
import type { GameState, NoticeModal } from '../src/game/types'
import { NoticeCard } from '../src/ui/components/ModalHost'
import { makeTestGame } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** An adult with room in every stat, so that any change shows. */
function adult(seed: number, money = 5_000): GameState {
  return makeTestGame(seed, { age: 30, money, stats: { happiness: 50, health: 50, smarts: 50, looks: 50 } })
}

function jail(g: GameState): void {
  g.character.prison = { name: 'Blackrock Penitentiary', security: 'medium', crime: 'Burglary', sentenceYears: 8, yearsServed: 1, respect: 40, appealed: false, escapeAttempts: 0 }
  g.character.residence = { status: 'prison', description: 'Blackrock Penitentiary' }
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}

function lastLog(g: GameState): string | undefined {
  return currentLogYear(g).entries.at(-1)?.text
}

/** What the player can see change: the four stats and the cash. */
function visible(g: GameState): number[] {
  const { happiness, health, smarts, looks } = g.character.stats
  return [happiness, health, smarts, looks, g.character.money]
}

/** Every phrase in the selfHarm rule's regex. */
const SELF_HARM = ['kill myself', 'suicide', 'end my life', 'end it all', 'self-harm', 'hurt myself', 'cut myself', 'unalive myself']

const STORY_TITLE = 'You talked to someone'
const STORY_TEXT = 'You talked to someone you trust. It helped a little.'
const STORY_LOG = 'I talked to someone I trust about how I was feeling.'
const SUPPORT_LINE = "If you're struggling in real life, talk to someone you trust or call a local crisis line."

/** Text no rule knows: what the player typed, the phrase, and how it reads after "You" and after "I". */
const UNMATCHED: [typed: string, phrase: string, you: string, me: string][] = [
  ['juggle flaming torches on a unicycle', 'juggle flaming torches on a unicycle', 'juggle flaming torches on a unicycle', 'juggle flaming torches on a unicycle'],
  ['Build a treehouse', 'build a treehouse', 'build a treehouse', 'build a treehouse'],
  ['I want to climb a tree', 'climb a tree', 'climb a tree', 'climb a tree'],
  ['dig a hole in my yard', 'dig a hole in my yard', 'dig a hole in your yard', 'dig a hole in my yard'],
  ['I want to be a superhero', 'be a superhero', 'are a superhero', 'am a superhero'],
  ['start a business', 'start a business', 'start a business', 'start a business'],
  ['fix the fence', 'fix the fence', 'fix the fence', 'fix the fence'],
  ['visit the zoo', 'visit the zoo', 'visit the zoo', 'visit the zoo'],
  ['bury treasure in the backyard', 'bury treasure in the backyard', 'bury treasure in the backyard', 'bury treasure in the backyard'],
  ['ride a horse', 'ride a horse', 'ride a horse', 'ride a horse'],
]

describe('Do Anything, self-harm', () => {
  it('every selfHarm phrase gets the supportive popup with support true', () => {
    // Each phrase of the regex, its other spellings, and the way a player would type it.
    const typed = [...SELF_HARM, 'self harm', 'selfharm', 'I want to kill myself', 'commit suicide.', 'I want to end it all!!']
    let seed = 0
    for (const text of typed) {
      for (const prison of [false, true]) {
        const g = adult(++seed)
        if (prison) jail(g)
        const happiness = g.character.stats.happiness
        resolveCustomAction(g, text)
        const shown = notices(g)
        expect(shown, text).toHaveLength(1)
        const [n] = shown
        expect(n.title, text).toBe(STORY_TITLE)
        expect(n.text, text).toBe(STORY_TEXT)
        expect(n.support, text).toBe(true)
        expect([n.emoji, n.tone], text).toEqual(['💛', 'neutral'])
        // The real-world line is UI, not story.
        expect(`${n.title} ${n.text}`, text).not.toMatch(/crisis|988|deserve/i)
        // The behaviour is the same as before, in or out of prison: the log line and +4 happiness.
        expect(lastLog(g), text).toBe(STORY_LOG)
        expect(g.character.stats.happiness, text).toBe(happiness + 4)
      }
    }
  })
})

describe('the support line', () => {
  it('the notice card shows the support line only when support is true', () => {
    const modal: NoticeModal = { kind: 'notice', id: 'n1', title: STORY_TITLE, text: STORY_TEXT, emoji: '💛', tone: 'neutral', support: true }
    const html = renderToStaticMarkup(createElement(NoticeCard, { modal }))
    // React escapes the apostrophe.
    expect(html).toContain('you&#x27;re struggling')
    expect(html).toContain(`<p class="popup-support">${SUPPORT_LINE.replace("'", '&#x27;')}</p>`)
    // Once, under the story text and above the OK button.
    expect(html.split('popup-support').length - 1).toBe(1)
    expect(html.indexOf('class="popup-text"')).toBeLessThan(html.indexOf('class="popup-support"'))
    expect(html.indexOf('class="popup-support"')).toBeLessThan(html.indexOf('class="popup-actions"'))
    // Never on another notice: support false, support missing (an older save), or any other popup.
    const others: NoticeModal[] = [
      { ...modal, id: 'n2', support: false },
      { kind: 'notice', id: 'n3', title: STORY_TITLE, text: STORY_TEXT, emoji: '💛', tone: 'neutral' },
      { kind: 'notice', id: 'n4', title: 'Contraband', text: 'A guard caught you with contraband during a cell search.', tone: 'bad' },
    ]
    for (const other of others) {
      const plain = renderToStaticMarkup(createElement(NoticeCard, { modal: other }))
      expect(plain, other.id).toContain(other.title)
      expect(plain, other.id).not.toContain('popup-support')
      expect(plain, other.id).not.toContain('struggling')
    }
    // The stylesheet has a rule for it.
    const css = readFileSync(new URL('../src/ui/styles/global.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\n\.popup-support \{/)
  })
})

describe('Do Anything, the fallback and the log', () => {
  it('unmatched actions never start with You decided to and always change a stat', () => {
    const emojis = new Set<string>()
    let paid = 0
    for (let seed = 1; seed <= 200; seed++) {
      const [typed, , you] = UNMATCHED[seed % UNMATCHED.length]
      // Every fifth player is broke: a consequence that costs money is never offered to them.
      const broke = seed % 5 === 0
      const g = adult(seed, broke ? 0 : 5_000)
      const before = visible(g)
      resolveCustomAction(g, typed)
      const shown = notices(g)
      expect(shown, typed).toHaveLength(1)
      const [n] = shown
      // The fallback's own outcomes: no rule took the text.
      expect(['✨', '🤔', '😬', '🤝'], n.text).toContain(n.emoji)
      expect(n.text, n.text).not.toMatch(/decided to/i)
      // What you did, then one concrete consequence.
      expect(n.text.startsWith(`You ${you}. `), n.text).toBe(true)
      expect(visible(g), n.text).not.toEqual(before)
      expect(n.support, n.text).toBeUndefined()
      expect(g.character.money, n.text).toBeGreaterThanOrEqual(0)
      if (n.text.includes('It cost')) {
        expect(broke, n.text).toBe(false)
        expect(n.text).toBe(`You ${you}. It cost ${formatMoney(40)}.`)
        expect(g.character.money, n.text).toBe(before[4] - 40)
        paid++
      }
      emojis.add(n.emoji ?? '')
    }
    // Every kind of outcome came up: good, neutral, bad, and the new friend.
    expect([...emojis].sort()).toEqual(['✨', '🤔', '😬', '🤝'].sort())
    expect(paid).toBeGreaterThan(0)
  })

  it('the log line is I plus the phrase', () => {
    // The fallback. The new friend has a line of its own, which names the phrase too.
    let friends = 0
    for (let seed = 1; seed <= 100; seed++) {
      const [typed, phrase, , me] = UNMATCHED[seed % UNMATCHED.length]
      const g = adult(seed)
      resolveCustomAction(g, typed)
      const [n] = notices(g)
      const friend = n.emoji === '🤝'
      if (friend) friends++
      expect(lastLog(g), n.text).toBe(friend ? `I made a new friend while trying to ${phrase}.` : `I ${me}.`)
    }
    expect(friends).toBeGreaterThan(0)
    expect(friends).toBeLessThan(50)

    // The rules that used to log "I decided to ...". A few of their outcomes are other events.
    const rules: [typed: string, line: string][] = [
      ['bake a chocolate cake', 'I bake a chocolate cake.'],
      ['sing karaoke', 'I sing karaoke.'],
      ['go dancing', 'I go dancing.'],
      ['paint a landscape', 'I paint a landscape.'],
      ['eat a whole pizza', 'I eat a whole pizza.'],
      ['play video games', 'I play video games.'],
      ['get a haircut', 'I get a haircut.'],
      ['go for a run', 'I go for a run.'],
      ['learn French', 'I learn French.'],
      ['I want to be a rock star and sing', 'I am a rock star and sing.'],
    ]
    const otherEvents = new Set([
      'I nearly burned down the kitchen while cooking.',
      'A video of me went viral.',
      'I was written up in the local paper.',
      'I pulled a muscle working out.',
      'I got a makeover I regret.',
    ])
    for (const [typed, line] of rules) {
      const lines: (string | undefined)[] = []
      for (let seed = 1; seed <= 12; seed++) {
        const g = adult(seed)
        resolveCustomAction(g, typed)
        const [n] = notices(g)
        expect(n.text, typed).not.toMatch(/decided to/i)
        lines.push(lastLog(g))
      }
      expect(lines, typed).toContain(line)
      for (const l of lines) expect(l === line || otherEvents.has(l ?? ''), `${typed}: ${l}`).toBe(true)
    }
  })

  it('no Do Anything text keeps the decided-to frame or a banned phrase', () => {
    const src = readFileSync(new URL('../src/game/events/custom.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/decided to/i)
    for (const phrase of BANNED_ANYWHERE) expect(src, phrase).not.toContain(phrase)
  })
})

describe('saving a support notice', () => {
  it('a queued support notice survives saveGame and loadGame', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    })
    const g = adult(11)
    resolveCustomAction(g, 'I want to end it all')
    notice(g, 'Contraband', 'A guard caught you with contraband during a cell search.')
    expect(notices(g).map((n) => n.support)).toEqual([true, undefined])
    // Only the flag that is set is written: a notice without it is saved as before.
    expect(Object.keys(notices(g)[1])).not.toContain('support')
    expect(saveGame(g)).toBe(true)
    const record: unknown = JSON.parse(storage.get(SAVE_KEY) ?? 'null')
    expect(isLoadableGame(record)).toBe(true)
    const loaded = loadGame()
    expect(loaded).not.toBeNull()
    const kept = notices(loaded!)
    expect(kept.map((n) => [n.title, n.support])).toEqual([
      [STORY_TITLE, true],
      ['Contraband', undefined],
    ])
    // An older save has no such field anywhere: it loads, and reads as false.
    const old = JSON.parse(storage.get(SAVE_KEY) ?? 'null') as GameState
    for (const m of old.queue) if (m.kind === 'notice') delete m.support
    storage.set(SAVE_KEY, JSON.stringify(old))
    expect(isLoadableGame(old)).toBe(true)
    expect(notices(loadGame()!).map((n) => n.support ?? false)).toEqual([false, false])
  })
})
