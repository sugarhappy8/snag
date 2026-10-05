import { describe, expect, it, vi } from 'vitest'
vi.mock('../src/game/crime', () => ({ arrestPlayer: vi.fn() }))
vi.mock('../src/game/ribbons', () => ({ computeRibbon: () => null }))
import { killCharacter } from '../src/game/death'
import { arrestPlayer } from '../src/game/crime'
import { makeTestGame } from './helpers'

describe('probe', () => {
  it('works', () => {
    const g = makeTestGame()
    killCharacter(g, 'Test')
    arrestPlayer(g, 'x', 1)
    expect(g.character.alive).toBe(false)
  })
})
