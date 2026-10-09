import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { startAuthorCareer, startAuthorWork, publishAuthorWork, workOnAuthorWork } from '../src/game/special/author-career'
import { authorView } from '../src/game/special/author-state'
import { authorCareerMenu, authorJobNodes } from '../src/game/special/author'
import { chooseStoryScene, nameStoryDetail, storyDesk, storyFeedback, workshopStory, writeStoryScene } from '../src/game/special/author-story'
import { runScript } from '../src/game/scripts'

function writer() {
  const g = makeTestGame(4, { age: 30, money: 1_000_000, countryId: 'jp' })
  g.flags['skill.writing'] = 100; g.flags['skill.art'] = 100
  startAuthorCareer(g)
  startAuthorWork(g, { format: 'manga', genre: 'fantasy', promise: 'characters', title: 'The Lantern Keeper' })
  g.queue = []
  return { g, id: authorView(g).works[0].id }
}
describe('author story desk', () => {
  it('removes the career tutorial menu, retaining inline feedback', () => {
    const { g } = writer()
    expect(authorJobNodes(g).some(n => n.id === 'author.guide')).toBe(false)
    g.character.job = null
    expect(authorCareerMenu.children(g).some(n => n.id === 'author.guide')).toBe(false)
  })
  it('names characters and settings and persists the chosen scene', () => {
    const { g, id } = writer()
    expect(nameStoryDetail(g, id, 'protagonist', 'Hana')).toBe(true)
    expect(nameStoryDetail(g, id, 'setting', 'the floating library')).toBe(true)
    expect(writeStoryScene(g, id, 'characters')).toBe(true)
    const w = authorView(g).works[0]
    expect(w.progress).toBeGreaterThan(0)
    const saved = JSON.parse(JSON.stringify(g))
    const header = storyDesk(authorView(saved).works[0]).header?.(saved)
    expect(header).toContain('Hana')
    expect(header).toContain('floating library')
    expect(header).toContain('Scene notebook')
    expect(g.yearActions['author.write']).toBe(1)
  })
  it('scene prompts are one-shot and cannot consume a second session on replay', () => {
    const { g, id } = writer()
    chooseStoryScene(g, id)
    const modal = g.queue.find(m => m.kind === 'choice')
    if (!modal || modal.kind !== 'choice') throw Error('missing scene prompt')
    runScript(g, modal.scriptId!, 'characters', modal.data, modal)
    const before = JSON.stringify(g)
    runScript(g, modal.scriptId!, 'payoff', modal.data, modal)
    expect(JSON.stringify(g)).toBe(before)
  })
  it('retains the two shared writing sessions and blocks invalid or stale work', () => {
    const { g, id } = writer()
    expect(writeStoryScene(g, id, 'characters')).toBe(true)
    expect(writeStoryScene(g, id, 'world')).toBe(true)
    expect(writeStoryScene(g, id, 'payoff')).toBe(false)
    expect(writeStoryScene(g, 'missing', 'conflict')).toBe(false)
    expect(writeStoryScene(g, id, 'forged' as never)).toBe(false)
  })
  it('workshops cost money once per year and leave royalty contracts unchanged', () => {
    const { g, id } = writer()
    workOnAuthorWork(g, id); workOnAuthorWork(g, id)
    expect(authorView(g).works[0].stage).toBe('ready')
    const before = g.character.money
    expect(workshopStory(g, id)).toBe(true)
    const after = g.character.money
    expect(after).toBeLessThan(before)
    expect(workshopStory(g, id)).toBe(false)
    expect(g.character.money).toBe(after)
    publishAuthorWork(g, id, 'self')
    expect(authorView(g).works[0].stage).toBe('serial')
    expect(authorView(g).works[0].share).toBe(.7)
  })
  it('feedback identifies story debt and menus do not mutate state or randomness', () => {
    const { g } = writer(), w = authorView(g).works[0]
    expect(storyFeedback(g, { ...w, stage: 'serial', hooks: 90 })).toMatch(/answer|loose ends/i)
    const before = JSON.stringify(g), menu = storyDesk(w)
    menu.header?.(g); menu.children(g); menu.children(g)
    expect(JSON.stringify(g)).toBe(before)
  })
  it('rejects minors, prison, other careers, and new-generation ownership', () => {
    const { g, id } = writer()
    g.character.age = 15
    expect(writeStoryScene(g, id, 'characters')).toBe(false)
    g.character.age = 30; g.character.prison = {} as never
    expect(nameStoryDetail(g, id, 'setting', 'forbidden')).toBe(false)
    g.character.prison = null; g.character.job = null
    expect(writeStoryScene(g, id, 'characters')).toBe(false)
    g.character.id = 'heir'
    expect(authorView(g).works).toHaveLength(0)
  })
})
