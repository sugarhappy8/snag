// Main Character Syndrome in sport, stage and the street: skill is mastered the first time at the
// ceiling the body and age allow; the league, the years and the dice are not skipped.
import { describe, expect, it } from 'vitest'
import { specialCareersMenu } from '../src/game/special'
import { hustlerCareerMenu, hustlerJobNodes } from '../src/game/special/hustler'
import { trainArt, trainDesign } from '../src/game/special/gamedev-core'
import { gdMut } from '../src/game/special/gamedev-state'
import { indRating, sportRecord, viewRecord } from '../src/game/special/sports-individual'
import { IND_SPORTS, indSport } from '../src/game/special/sports-data'
import { bodyCeiling, experienceCap, isMastered, masteredAt, masteryCap } from '../src/game/mastery'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function life(age: number, main = true, seed = 3, extra: Record<string, unknown> = {}): GameState {
  const g = makeTestGame(seed, { age, money: 5_000_000, talents: main ? ['MainCharacter'] : undefined, ...extra })
  g.log = [{ age, year: 2026, entries: [] }]
  return g
}

function find(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 6) return undefined
  for (const n of nodes) {
    if ('id' in n && n.id === id) return n
    if (n.type === 'menu') {
      const hit = find(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

function run(g: GameState, nodes: MenuNode[], id: string): void {
  const n = find(g, nodes, id)
  if (!n || n.type !== 'action') throw new Error(`action ${id} not found`)
  const why = n.disabledReason?.(g)
  if (why) throw new Error(`action ${id} is disabled: ${why}`)
  ;(n as MenuAction).run(g)
}

function answer(g: GameState, choiceId?: string): ChoiceModal {
  for (;;) {
    const m = g.queue.shift()
    if (!m) throw new Error('no choice in the queue')
    if (m.kind !== 'choice') continue
    const before = g.queue.length
    runScript(g, m.scriptId!, choiceId ?? m.choices[0].id, m.data, m)
    g.queue.unshift(...g.queue.splice(before))
    return m
  }
}

const careers = (g: GameState) => specialCareersMenu.children(g)
const flag = <T,>(g: GameState, key: string): T => g.flags[`special.${key}`] as unknown as T

describe('team sports', () => {
  it('the first tryout puts every skill at the body ceiling; the team still has to say yes', () => {
    const g = life(25)
    run(g, careers(g), 'athlete.tryout')
    answer(g, 'soccer')
    answer(g)
    answer(g, '0')
    const p = flag<{ sport: string; skills: Record<string, number> }>(g, 'athlete')
    expect(p.sport).toBe('soccer')
    expect(Object.values(p.skills).every((v) => v === 100)).toBe(true)
    expect(isMastered(g, 'sport.soccer')).toBe(true)
    // The fitness is still the body's own, and the result is still a roll: a pro job is not guaranteed.
    expect(g.character.job === null || g.character.job.defId === 'athlete').toBe(true)
    const plain = life(25, false)
    run(plain, careers(plain), 'athlete.tryout')
    answer(plain, 'soccer')
    answer(plain)
    answer(plain, '0')
    expect(Object.values(flag<{ skills: Record<string, number> }>(plain, 'athlete').skills).every((v) => v < 60)).toBe(true)
    expect(plain.flags['mcs.mastered']).toBeUndefined()
  })

  it('with years the competitive level grows from the middle of the pack to the top', () => {
    const g = life(25)
    run(g, careers(g), 'athlete.tryout')
    answer(g, 'soccer')
    answer(g)
    answer(g, '0')
    expect(masteredAt(g, 'sport.soccer')).toBe(25)
    expect(masteryCap(g, 'sport.soccer')).toBeLessThan(50)
    g.character.age = 32
    g.year += 7
    expect(masteryCap(g, 'sport.soccer')).toBeGreaterThan(80)
    g.character.age = 40
    g.year += 8
    expect(masteryCap(g, 'sport.soccer')).toBe(100)
  })
})

describe('individual sports', () => {
  it('a first tennis practice sets the attributes at the ceiling, but the rating against the field starts mid-pack', () => {
    const g = life(25)
    run(g, careers(g), 'sports.ind.tennis.practice')
    answer(g)
    const sport = indSport('tennis')!
    const rec = viewRecord(g, 'tennis')!
    expect(sport.attrs.every((a) => rec.attrs[a] >= 99)).toBe(true)
    expect(isMastered(g, 'sport.tennis')).toBe(true)
    expect(indRating(g, sport, rec)).toBeLessThanOrEqual(experienceCap(g, 25))
    // Twelve years later the same player can show the full level.
    g.character.age = 37
    g.year += 12
    const later = indRating(g, sport, rec)
    expect(later).toBeGreaterThan(indRating(life(25), sport, rec))
  })

  it('an eighty-year-old master sprinter is still eighty', () => {
    const old = life(80)
    const track = indSport('track')!
    const rec = sportRecord(old, track)
    expect(Math.max(...track.attrs.map((a) => rec.attrs[a]))).toBeLessThan(60)
    expect(Math.max(...track.attrs.map((a) => rec.attrs[a]))).toBe(bodyCeiling(old, { peakEnd: track.peak[1] }))
    const young = life(22)
    expect(Math.min(...track.attrs.map((a) => sportRecord(young, track).attrs[a]))).toBe(100)
    const kid = life(9)
    expect(Math.max(...track.attrs.map((a) => sportRecord(kid, track).attrs[a]))).toBeLessThan(60)
    expect(IND_SPORTS.length).toBeGreaterThan(5)
  })

  it('is untouched for everyone else', () => {
    const plain = life(25, false)
    const sport = indSport('tennis')!
    const rec = sportRecord(plain, sport)
    expect(sport.attrs.every((a) => rec.attrs[a] < 60)).toBe(true)
    expect(isMastered(plain, 'sport.tennis')).toBe(false)
  })
})

describe('fighting, wrestling and esports', () => {
  it('boxing training masters the ring skills for an adult', () => {
    const g = life(25)
    run(g, careers(g), 'sports.boxing.train')
    answer(g, 'striking')
    const p = flag<{ striking: number; grappling: number; cardio: number }>(g, 'sports.fight')
    expect([p.striking, p.grappling, p.cardio]).toEqual([100, 100, 100])
    expect(isMastered(g, 'fight.ring')).toBe(true)
    const old = life(70)
    run(old, careers(old), 'sports.boxing.train')
    answer(old, 'striking')
    expect(flag<{ striking: number }>(old, 'sports.fight').striking).toBeLessThan(70)
  })

  it('wrestling school masters in-ring and mic work', () => {
    const g = life(25)
    run(g, careers(g), 'sports.wrestle.school')
    const p = flag<{ inRing: number; mic: number }>(g, 'sports.wrestle')
    expect(p.inRing).toBe(100)
    expect(p.mic).toBe(100)
    const plain = life(25, false)
    run(plain, careers(plain), 'sports.wrestle.school')
    expect(flag<{ inRing: number }>(plain, 'sports.wrestle').inRing).toBeLessThan(60)
  })

  it('a first ranked game masters the attributes; reflexes follow the body', () => {
    const g = life(25)
    run(g, careers(g), 'sports.es.game')
    answer(g)
    const p = flag<{ attrs: Record<string, number> }>(g, 'sports.esports')
    expect(Object.values(p.attrs)).toEqual([100, 100, 100, 100])
    const old = life(45)
    run(old, careers(old), 'sports.es.game')
    answer(old)
    const q = flag<{ attrs: Record<string, number> }>(old, 'sports.esports')
    expect(q.attrs.Mechanics).toBeLessThan(q.attrs['Game Sense'])
  })
})

describe('the street and the studio', () => {
  it('a first street act is mastered to the age ceiling', () => {
    const g = life(25)
    run(g, hustlerCareerMenu.children(g), 'hustle.start.perform')
    answer(g, 'fire')
    run(g, hustlerJobNodes(g), 'hustle.work')
    expect(flag<{ skills: Record<string, number> }>(g, 'hustler').skills.fire).toBe(100)
    expect(isMastered(g, 'hustle.fire')).toBe(true)
    const kid = life(17)
    run(kid, hustlerCareerMenu.children(kid), 'hustle.start.perform')
    answer(kid, 'mime')
    run(kid, hustlerJobNodes(kid), 'hustle.work')
    expect(flag<{ skills: Record<string, number> }>(kid, 'hustler').skills.mime).toBeLessThanOrEqual(100)
  })

  it('game design and game art master at the first try', () => {
    const g = life(30)
    const p = gdMut(g)
    trainDesign(g, p, 2)
    trainArt(g, p, 2)
    expect(p.design).toBe(100)
    expect(p.art).toBe(100)
    const kid = life(10)
    const q = gdMut(kid)
    trainDesign(kid, q, 2)
    expect(q.design).toBeLessThan(100)
    const plain = life(30, false)
    const r = gdMut(plain)
    trainDesign(plain, r, 2)
    expect(r.design).toBeLessThan(15)
  })
})
