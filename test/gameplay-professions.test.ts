import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { hireForJob, occupationMenu } from '../src/game/careers'
import { prepareProfessionalWork, professionOf, professionalMenu, professionalRecord, specializeProfession, startProfessionalAssignment, yearlyProfessions, type Profession } from '../src/game/professions'

function worker(path: Profession, seed = 1) {
  const g = makeTestGame(seed, { age: 30 }); g.character.money = 100000
  const ids = { medicine: 'family_physician', law: 'lawyer', engineering: 'engineer', trade: 'plumber' }
  g.character.education.degrees.push({ kind: 'md', name: 'Medical qualification', school: 'College', age: 25 }, { kind: 'jd', name: 'Law', school: 'College', age: 25 }, { kind: 'bachelor', name: 'Engineering', major: 'Engineering', school: 'College', age: 22 })
  hireForJob(g, { defId: ids[path], title: path, company: 'Test Employer', salary: 80000, category: 'fulltime' }); g.queue = []
  return g
}
describe('professional practice', () => {
  it.each<Profession>(['medicine', 'law', 'engineering', 'trade'])('%s is playable and salary-neutral, bounded and replayable', path => {
    const g = worker(path)
    expect(professionOf(g)).toBe(path)
    expect(startProfessionalAssignment(g, path, 'careful')).toBe(true)
    expect(startProfessionalAssignment(g, path, 'fast')).toBe(false)
    expect(prepareProfessionalWork(g, path)).toBe(true)
    expect(prepareProfessionalWork(g, path)).toBe(false)
    const clone = JSON.parse(JSON.stringify(g)), balance = g.character.money
    for (const gg of [g, clone]) { gg.year++; gg.character.age++; yearlyProfessions(gg); if (path === 'engineering') { expect(professionalRecord(gg, path).assignment?.remaining).toBe(1); gg.year++; yearlyProfessions(gg) } }
    expect(g).toEqual(clone); expect(g.character.money).toBe(balance)
    expect(professionalRecord(g, path).assignment).toBeNull()
    const before = JSON.stringify(g); yearlyProfessions(g); expect(JSON.stringify(g)).toBe(before)
    expect(occupationMenu.children(g).some(n => n.id === professionalMenu.id)).toBe(true)
  })
  it('enforces credentials, funds and current employment; malformed records do not crash menus', () => {
    const g = worker('medicine'); g.character.education.degrees = []
    expect(startProfessionalAssignment(g, 'medicine', 'careful')).toBe(false)
    const h = worker('trade'); startProfessionalAssignment(h, 'trade', 'fast'); h.character.money = 0
    expect(prepareProfessionalWork(h, 'trade')).toBe(false)
    expect(specializeProfession(h, 'trade', 'Installation')).toBe(false)
    h.character.job = null; h.year++; yearlyProfessions(h)
    expect(professionalRecord(h, 'trade').assignment).toBeNull()
    h.flags.professions = { trade: { skill: -9, assignment: { title: 5 }, history: [null] } }
    expect(professionalRecord(h, 'trade').skill).toBe(0)
    expect(() => professionalMenu.children(h)).not.toThrow()
  })
  it('produces both successes and professional setbacks across seeds', () => {
    const results = new Set<number>()
    for (let i = 1; i < 30; i++) { const g = worker('law', i); startProfessionalAssignment(g, 'law', 'fast'); g.year++; yearlyProfessions(g); results.add(professionalRecord(g, 'law').completed) }
    expect(results.size).toBe(2)
  })
})
