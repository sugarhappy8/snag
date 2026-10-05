// Pure logic behind the game UI shell: menu evaluation / navigation and dialog input
// validation. (Rendering itself is covered by the browser smoke tests.)
import { describe, expect, it, vi } from 'vitest'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { normalizeInput, parseNumberInput, rangeHint, validateInput } from '../src/ui/components/Dialogs'
import {
  confirmText,
  groupChildren,
  groupHeader,
  infoText,
  isMultiline,
  nodeDisabled,
  nodeSubtitle,
  nodeVisible,
  resolveTrail,
} from '../src/ui/components/menuModel'
import { makeTestGame } from './helpers'

const action = (id: string, extra: Partial<MenuAction> = {}): MenuAction => ({
  type: 'action',
  id,
  label: id,
  emoji: '🙂',
  run: () => {},
  ...extra,
})

const group = (id: string, children: (g: GameState) => MenuNode[], extra: Partial<MenuGroup> = {}): MenuGroup => ({
  type: 'menu',
  id,
  label: id,
  emoji: '📁',
  children,
  ...extra,
})

describe('menu node evaluation', () => {
  it('evaluates visible / disabledReason / subtitle against the state', () => {
    const g = makeTestGame(1, { age: 10 })
    const adult = action('casino', {
      visible: (s) => s.character.age >= 4,
      disabledReason: (s) => (s.character.age < 18 ? 'You must be at least 18 years old.' : null),
      subtitle: (s) => `Age ${s.character.age}`,
    })
    expect(nodeVisible(adult, g)).toBe(true)
    expect(nodeDisabled(adult, g)).toBe('You must be at least 18 years old.')
    expect(nodeSubtitle(adult, g)).toBe('Age 10')
    g.character.age = 2
    expect(nodeVisible(adult, g)).toBe(false)
    g.character.age = 30
    expect(nodeDisabled(adult, g)).toBeNull()
    expect(nodeSubtitle(action('plain', { subtitle: 'Static' }), g)).toBe('Static')
    expect(nodeSubtitle(action('none'), g)).toBeNull()
  })

  it('never throws when a feature menu callback is broken', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const g = makeTestGame()
    const boom = () => {
      throw new Error('boom')
    }
    const bad = group('bad', boom, { visible: boom, disabledReason: boom, subtitle: boom, header: boom })
    expect(nodeVisible(bad, g)).toBe(false)
    expect(nodeDisabled(bad, g)).toBeNull()
    expect(nodeSubtitle(bad, g)).toBeNull()
    expect(groupHeader(bad, g)).toBeNull()
    const kids = groupChildren(bad, g)
    expect(kids).toHaveLength(1)
    expect(kids[0].type).toBe('info')
    expect(confirmText(action('x', { confirm: boom }), g)).toBeNull()
    expect(infoText({ type: 'info', id: 'i', text: boom }, g)).toBe('')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('treats empty strings from callbacks as "nothing"', () => {
    const g = makeTestGame()
    expect(nodeDisabled(action('a', { disabledReason: () => '' }), g)).toBeNull()
    expect(confirmText(action('a', { confirm: () => '' }), g)).toBeNull()
    expect(confirmText(action('a', { confirm: () => 'Sure?' }), g)).toBe('Sure?')
  })

  it('uses a multi-line field only for long-form text input', () => {
    expect(isMultiline(action('doAnything', { input: { kind: 'text', label: 'What do you want to do?' } }))).toBe(true)
    expect(isMultiline(action('name', { input: { kind: 'text', label: 'Name', placeholder: 'Rex' } }))).toBe(false)
    expect(isMultiline(action('amount', { input: { kind: 'number', label: 'How much?' } }))).toBe(false)
    expect(isMultiline(action('none'))).toBe(false)
  })
})

describe('resolveTrail (menu navigation stack)', () => {
  const tree = (g: GameState): MenuNode[] => [
    action('top'),
    group('job', () => [
      action('work'),
      group('boss', () => [action('askRaise')], { visible: (s) => s.flags.hasBoss === true }),
    ], { visible: (s) => s.character.job !== null || s.flags.fakeJob === true }),
    group('locked', () => [], { disabledReason: () => 'Nope' }),
    ...(g.flags.extra ? [group('extra', () => [])] : []),
  ]

  it('follows the stored id path through nested groups', () => {
    const g = makeTestGame()
    g.flags.fakeJob = true
    g.flags.hasBoss = true
    const trail = resolveTrail(g, tree(g), ['job', 'boss'])
    expect(trail.map((t) => t.id)).toEqual(['job', 'boss'])
  })

  it('stops at groups that disappeared or became hidden (e.g. you quit the job)', () => {
    const g = makeTestGame()
    g.flags.fakeJob = true
    g.flags.hasBoss = false
    expect(resolveTrail(g, tree(g), ['job', 'boss']).map((t) => t.id)).toEqual(['job'])
    g.flags.fakeJob = false
    expect(resolveTrail(g, tree(g), ['job', 'boss'])).toEqual([])
    expect(resolveTrail(g, tree(g), ['missing'])).toEqual([])
  })

  it('does not enter locked groups or actions', () => {
    const g = makeTestGame()
    expect(resolveTrail(g, tree(g), ['locked'])).toEqual([])
    expect(resolveTrail(g, tree(g), ['top'])).toEqual([])
  })

  it('picks up groups that only exist in the latest state', () => {
    const g = makeTestGame()
    expect(resolveTrail(g, tree(g), ['extra'])).toEqual([])
    g.flags.extra = true
    expect(resolveTrail(g, tree(g), ['extra']).map((t) => t.id)).toEqual(['extra'])
  })
})

describe('dialog input validation', () => {
  it('parses money-ish numbers leniently', () => {
    expect(parseNumberInput('1500')).toBe(1500)
    expect(parseNumberInput('$1,500')).toBe(1500)
    expect(parseNumberInput(' 2 000 ')).toBe(2000)
    expect(parseNumberInput('-5')).toBe(-5)
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('abc')).toBeNull()
    expect(parseNumberInput('12abc')).toBeNull()
  })

  it('enforces min / max for numbers and non-empty text', () => {
    expect(validateInput('number', '50', 1, 100)).toBeNull()
    expect(validateInput('number', '0', 1, 100)).toBe('The minimum is 1.')
    expect(validateInput('number', '1,000', 1, 500)).toBe('The maximum is 500.')
    expect(validateInput('number', 'lots')).toBe('Please enter a number.')
    expect(validateInput('text', '   ')).toBe('Please type something first.')
    expect(validateInput('text', 'Rex')).toBeNull()
  })

  it('normalizes what actions and scripts receive', () => {
    expect(normalizeInput('number', '$1,234.6')).toBe('1235')
    expect(normalizeInput('text', '  Clementine  ')).toBe('Clementine')
  })

  it('describes the allowed range', () => {
    expect(rangeHint('number', 1, 10000)).toBe('Between 1 and 10,000')
    expect(rangeHint('number', 5)).toBe('At least 5')
    expect(rangeHint('number', undefined, 9)).toBe('At most 9')
    expect(rangeHint('number')).toBeNull()
    expect(rangeHint('text', 1, 2)).toBeNull()
  })
})
