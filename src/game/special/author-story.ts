// The writer's desk: named characters, scene decisions, editorial feedback and reader mail.
// Separate owner-scoped notes preserve old catalogues without changing royalty contracts.
import { formatMoney, notice, scriptChoice, spend, useYearAction, yearActionsUsed } from '../core'
import { localPrice } from '../activities/common'
import { defineScript } from '../scripts'
import type { GameState, Json, MenuGroup, MenuNode } from '../types'
import { workOnAuthorWork, setAuthorFocus } from './author-career'
import { authorView, authorMut, saveAuthor, AUTHOR_JOB, type AuthorWork } from './author-state'
import { blocked, myJob, ownerKey, ownerMatches, peek, stableChoice } from './common'

type SceneFocus = 'characters' | 'world' | 'conflict' | 'payoff'
interface StoryNotes { protagonist: string; setting: string; beats: string[] }
const FOCI: SceneFocus[] = ['characters', 'world', 'conflict', 'payoff']
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
function notes(g: GameState, id: string): StoryNotes {
  const all = object(peek(g, 'authorStories')), n = object(all[id])
  return { protagonist: typeof n.protagonist === 'string' ? n.protagonist.slice(0, 50) : 'your protagonist', setting: typeof n.setting === 'string' ? n.setting.slice(0, 80) : 'a world waiting to be named', beats: Array.isArray(n.beats) ? n.beats.filter((s): s is string => typeof s === 'string').slice(-12).map(s => s.slice(0, 200)) : [] }
}
function saveNotes(g: GameState, id: string, n: StoryNotes): void {
  const all = object(peek(g, 'authorStories'))
  g.flags['special.authorStories'] = { ...all, [id]: n, owner: ownerKey(g) } as unknown as Json
}
function work(g: GameState, id: string): AuthorWork | undefined { return authorView(g).works.find(w => w.id === id) }
function gate(g: GameState, id: string): string | null { return blocked(g, 16) ?? (!myJob(g, AUTHOR_JOB) ? 'Return to the Author career.' : null) ?? (!work(g, id) ? 'This story is no longer yours.' : null) }
export function nameStoryDetail(g: GameState, id: string, detail: 'protagonist' | 'setting', input: string): boolean {
  if (gate(g, id) || !['protagonist', 'setting'].includes(detail)) return false
  const value = input.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, detail === 'protagonist' ? 50 : 80)
  if (!value) return false
  const n = notes(g, id); n[detail] = value; saveNotes(g, id, n); return true
}
const PROMPTS: Record<SceneFocus, string[]> = {
  characters: ['must choose between loyalty and a long-held dream', 'admits a weakness to an unlikely ally', 'finds an unexpected bond with a former rival'],
  world: ['discovers a hidden rule of the world', 'steps into a place where familiar rules no longer apply', 'learns what a beloved tradition has been hiding'],
  conflict: ['wins a small victory that creates a larger problem', 'faces the consequences of an earlier mistake', 'is offered exactly what they want at a painful price'],
  payoff: ['pays off an early clue with a surprising answer', 'keeps an old promise despite the personal cost', 'resolves a conflict through a choice rather than coincidence'],
}
export function writeStoryScene(g: GameState, id: string, focus: SceneFocus): boolean {
  const current = work(g, id)
  if (gate(g, id) || !current || !['draft', 'ready'].includes(current.stage) || !FOCI.includes(focus) || yearActionsUsed(g, 'author.write') >= 2) return false
  const previous = yearActionsUsed(g, 'author.write')
  workOnAuthorWork(g, id, true)
  if (yearActionsUsed(g, 'author.write') !== previous + 1) return false
  const p = authorMut(g), w = p.works.find(row => row.id === id)!
  const aligned = (w.promise === 'characters' && focus === 'characters') || (w.promise === 'spectacle' && focus === 'world') || (w.promise === 'mystery' && focus === 'payoff')
  w.quality = Math.min(98, w.quality + (aligned ? 2 : 1))
  saveAuthor(g, p)
  const n = notes(g, id), prompt = stableChoice(g, `author.scene.${id}.${previous}.${focus}`, PROMPTS[focus])
  const beat = `${g.year}: ${n.protagonist} ${prompt} in ${n.setting}.`
  n.beats = [...n.beats, beat].slice(-12); saveNotes(g, id, n)
  notice(g, 'A Scene Comes Alive', `${beat}\n\n${aligned ? 'This scene delivers on your promise to readers.' : 'A new layer gives the story more texture.'} ${w.title} is ${Math.round(w.progress)}% complete; quality ${Math.round(w.quality)}/100.${w.stage === 'ready' ? ' Ready to pitch, self-publish, or revise further.' : ''}`, { emoji: '✍️' })
  return true
}
const SCENE_SCRIPT = defineScript('author.scene', (g, choice, data) => {
  const d = object(data)
  if (typeof d.id !== 'string' || !FOCI.includes(choice as SceneFocus) || !ownerMatches(g, d.owner) || d.session !== yearActionsUsed(g, 'author.write') || d.year !== g.year) return
  writeStoryScene(g, d.id, choice as SceneFocus)
})
export function chooseStoryScene(g: GameState, id: string): void {
  if (gate(g, id) || yearActionsUsed(g, 'author.write') >= 2) return
  const w = work(g, id), n = notes(g, id)
  if (!w || !['draft', 'ready'].includes(w.stage)) return
  scriptChoice(g, SCENE_SCRIPT, w.stage === 'ready' ? 'Choose a Revision' : 'What Happens Next?', `${w.title}\n${n.protagonist} · ${n.setting}\nChoose the next scene's purpose. This uses one of your two yearly writing sessions.`, FOCI.map(focus => ({ id: focus, label: focus === 'characters' ? 'A difficult character choice' : focus === 'world' ? 'A vivid discovery in the world' : focus === 'conflict' ? 'A victory with consequences' : 'An answer that pays off an earlier clue', emoji: focus === 'characters' ? '❤️' : focus === 'world' ? '🌏' : focus === 'conflict' ? '⚔️' : '🧩' })), { emoji: '✍️', data: { id, year: g.year, owner: ownerKey(g), session: yearActionsUsed(g, 'author.write') } })
}
export function storyFeedback(g: GameState, w: AuthorWork): string {
  const p = authorView(g)
  if (p.burnout >= 65) return 'Your editor: “The voice is getting tired. A careful schedule or a break will do more than another rushed chapter.”'
  if (w.stage === 'serial' && w.hooks > 40) return 'Reader mail: “We love the mystery, but please answer something. We are keeping a list of the loose ends!”'
  if (w.stage === 'serial' && w.trust < 55) return 'Reader mail: “Give us a reason to trust the next arc. A satisfying payoff would bring us back.”'
  if (w.quality < 60) return 'Your editor: “The idea has a heartbeat. Revise the scenes until motives and consequences feel earned.”'
  return w.promise === 'characters' ? 'Reader mail: “I came for the premise. I stayed because these characters feel like people.”' : w.promise === 'mystery' ? 'Reader mail: “That little detail has to mean something. I cannot wait to compare theories.”' : 'Reader mail: “The setting is the kind of place I want to get lost in.”'
}
export function workshopStory(g: GameState, id: string): boolean {
  const current = work(g, id), cost = localPrice(g, 500)
  if (gate(g, id) || !current || !['ready', 'serial'].includes(current.stage) || yearActionsUsed(g, `author.workshop.${id}`) >= 1 || g.character.money < cost) return false
  if (!useYearAction(g, `author.workshop.${id}`, 1) || !spend(g, cost, 'purchase')) return false
  const p = authorMut(g), w = p.works.find(row => row.id === id)!
  w.quality = Math.min(98, w.quality + 2); p.burnout = Math.max(0, p.burnout - 2)
  saveAuthor(g, p)
  const n = notes(g, id); n.beats = [...n.beats, `${g.year}: a paid reader workshop sharpened motivation and pacing.`].slice(-12); saveNotes(g, id, n)
  notice(g, 'The Readers Around Your Table', `${formatMoney(cost)} paid for an editor and a small reader panel. They disagreed about the ending, loved a side character, and helped you sharpen the story. Quality +2; burnout −2.\n\n${storyFeedback(g, w)}`, { emoji: '☕' }); return true
}
export function storyDesk(w: AuthorWork): MenuGroup {
  const id = w.id
  return { type: 'menu', id: `author.desk.${id}`, label: 'The Story Desk', emoji: '☕', subtitle: 'Characters, setting, scene notebook and reader feedback',
    header: g => { const n = notes(g, id), current = work(g, id); return `${n.protagonist} · ${n.setting}\n${current ? storyFeedback(g, current) : 'No story found.'}${n.beats.length ? `\n\nScene notebook:\n${n.beats.join('\n')}` : ''}` },
    children: g => {
      const current = work(g, id); if (!current) return []
      const nodes: MenuNode[] = (['protagonist', 'setting'] as const).map(detail => ({ type: 'action', id: `author.detail.${detail}.${id}`, label: detail === 'protagonist' ? 'Name Your Lead Character' : 'Name the Setting', emoji: detail === 'protagonist' ? '👤' : '🌏', disabledReason: gg => gate(gg, id), input: { kind: 'text', label: detail === 'protagonist' ? 'Lead character' : 'Setting', placeholder: detail === 'protagonist' ? 'Character name' : 'A city, kingdom, school, planet…' }, run: (gg, input) => { nameStoryDetail(gg, id, detail, input ?? '') } }))
      if (['ready', 'serial'].includes(current.stage)) nodes.push({ type: 'action', id: `author.workshop.${id}`, label: 'Host an Editorial Reader Workshop', emoji: '☕', subtitle: `${formatMoney(localPrice(g, 500))} · once per story/year · quality +2, burnout −2`, disabledReason: gg => gate(gg, id) ?? (yearActionsUsed(gg, `author.workshop.${id}`) >= 1 ? 'Your panel already met this year.' : gg.character.money < localPrice(gg, 500) ? 'Cannot afford the workshop.' : null), run: gg => { workshopStory(gg, id) } })
      if (current.stage === 'serial') nodes.push({ type: 'action', id: `author.respond.${id}`, label: 'Answer Reader Theories with a Payoff Arc', emoji: '💌', subtitle: 'Resolve story debt in the next year of chapters', disabledReason: gg => gate(gg, id), run: gg => setAuthorFocus(gg, id, 'payoff') })
      return nodes
    } }
}
