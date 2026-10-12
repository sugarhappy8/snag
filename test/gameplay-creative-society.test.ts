import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createPerson } from '../src/game/people'
import { initializeNpc } from '../src/game/npc-lives'
import { npcLife, saveNpcLife } from '../src/game/npc-state'
import { setInstrumentSkill } from '../src/game/special/common'
import { developMusicMaster, licenseMusicMaster, musicMaster, musicMasterNodes, releaseMusicMaster, sellMusicMaster, startMusicMaster, yearlyMusicRights } from '../src/game/special/music-rights'
import { sharedAvailability, sharedProjects, sharedProjectsMenu, startSharedProject, workSharedProject, yearlySharedProjects, type SharedKind } from '../src/game/activities/shared-projects'
import { commitGivingProgram, establishGivingFund, givingFund, yearlyGivingFund } from '../src/game/activities/giving-fund'
import { continueAsChild } from '../src/game/life'
import { world, kid } from './nepo-kit'
import { hireRelative, designateSuccessor } from '../src/game/business/nepo-actions'
import { readJob, writeJob } from '../src/game/business/nepo-job'
import { bizOf } from '../src/game/business/state'
import { adoptSuccessionReview, successionReadiness, successionReviewMenu } from '../src/game/business/succession-review'
import { successorManager } from '../src/game/business/nepo-succession'

function musician() { const g = makeTestGame(33, { age: 35, money: 1000000 }); setInstrumentSkill(g, 'Voice', 85); return g }
function master() {
  const g = musician(), a = startMusicMaster(g, 'Northern Lights')!
  for (let i = 0; i < 3; i++) { if (i) { g.year++; g.character.age++; g.yearActions = {} } expect(developMusicMaster(g, a.id, 'producer')).toBe(true) }
  expect(releaseMusicMaster(g, a.id)).toBe(true)
  return { g, a }
}
describe('owned recordings', () => {
  it('requires ability, funding and real production years; menus are pure', () => {
    const g = makeTestGame(1, { age: 35, money: 100000 }); expect(startMusicMaster(g, 'No skill')).toBeNull()
    setInstrumentSkill(g, 'Voice', 80); const a = startMusicMaster(g, 'Record')!
    expect(developMusicMaster(g, a.id, 'craft')).toBe(true); expect(developMusicMaster(g, a.id, 'producer')).toBe(false)
    expect(releaseMusicMaster(g, a.id)).toBe(false)
    const before = JSON.stringify(g); musicMasterNodes(g, a); expect(JSON.stringify(g)).toBe(before)
    g.year++; g.yearActions = {}; g.character.money = 0; expect(developMusicMaster(g, a.id, 'producer')).toBe(false)
  })
  it('recoups advances, pays each year once and reverts after five paid years', () => {
    const { g, a } = master(), opening = g.character.money
    expect(licenseMusicMaster(g, a.id)).toBe(true); const advance = musicMaster(a)!.advance
    expect(g.character.money).toBe(opening + advance); expect(licenseMusicMaster(g, a.id)).toBe(false)
    const expiry = musicMaster(a)!.licenseUntil, clone = JSON.parse(JSON.stringify(g))
    for (const gg of [g, clone]) for (let y = 0; y < 5; y++) { gg.year++; yearlyMusicRights(gg) }
    expect(g).toEqual(clone); expect(g.year).toBe(expiry); expect(musicMaster(a)!.licenseUntil).toBe(0)
    expect(g.character.money - opening).toBe(musicMaster(a)!.receipts)
    const cash = g.character.money; yearlyMusicRights(g); expect(g.character.money).toBe(cash)
    expect(sellMusicMaster(g, a.id)).toBe(true); expect(g.assets).not.toContain(a)
    const soldCash = g.character.money; g.year++; yearlyMusicRights(g); expect(g.character.money).toBe(soldCash)
  })
  it('does not expose international distribution before the shared radio-era gate', () => {
    const { g, a } = master(); const m = musicMaster(a)!; m.stage = 'ready'; a.details.musicMaster = m as never
    g.year = 1900; g.yearActions = {}; expect(releaseMusicMaster(g, a.id, true)).toBe(false)
  })
})

describe('persistent shared life', () => {
  function family() {
    const g = makeTestGame(37, { age: 45, money: 100000 }); g.character.stats.smarts = 90
    g.character.education.degrees.push({ kind: 'bachelor', name: 'Engineering', major: 'Engineering', school: 'College', age: 22 })
    const p = createPerson(g, { relation: 'child', age: 20, firstName: 'Alex', livesWithPlayer: true }); p.relationship = 90; p.stats.health = 90
    const l = initializeNpc(g, p); l.skill = 30; l.field = 'Engineering'; l.ambition = 90; saveNpcLife(p, l)
    return { g, p }
  }
  it.each<SharedKind>(['mentorship', 'garden', 'familyHistory', 'amateurSport'])('%s completes with real NPC memories and persistent progress', kind => {
    const { g, p } = family()
    for (let tries = 0; tries < 20 && !sharedProjects(g).length; tries++) { startSharedProject(g, p.id, kind); if (!sharedProjects(g).length) { g.year++; g.yearActions = {} } }
    const q = sharedProjects(g)[0]; expect(q).toBeTruthy(); const education = npcLife(p)!.education, skill = npcLife(p)!.skill
    for (let y = 0; y < 3 && !sharedProjects(g)[0].completed; y++) { expect(workSharedProject(g, q.id)).toBe(true); expect(workSharedProject(g, q.id)).toBe(false); g.year++; g.character.age++; yearlySharedProjects(g) }
    expect(sharedProjects(g)[0].completed).toBe(true); expect(p.notes.some(s => s.includes('completed'))).toBe(true)
    expect(npcLife(p)!.education).toBe(education); if (kind === 'mentorship') expect(npcLife(p)!.skill).toBeGreaterThan(skill)
    expect(g.character.cv?.some(e => e.source === 'shared-project')).toBe(true)
    const before = JSON.stringify(g); yearlySharedProjects(g); sharedProjectsMenu.children(g); expect(JSON.stringify(g)).toBe(before)
  })
  it('respects location, qualifications and insufficient money', () => {
    const { g, p } = family(), l = npcLife(p)!
    l.country = 'jp'; l.city = 'Tokyo'; p.data.countryId = 'jp'; p.livesWithPlayer = false; saveNpcLife(p, l)
    expect(sharedAvailability(g, p, 'garden')).toMatch(/elsewhere/)
    p.livesWithPlayer = true; g.character.education.degrees = []
    expect(sharedAvailability(g, p, 'mentorship')).toMatch(/education/)
    g.flags.sharedProjects = [{ id: 'q', kind: 'garden', person: p.id, year: g.year, progress: 0, effort: false, lastYear: g.year, spent: 0, completed: false, note: '' }]
    g.character.money = 0; expect(workSharedProject(g, 'q')).toBe(false)
  })
})

describe('wealth with commitments', () => {
  it('conserves restricted funds, finishes a program, and never pays personal cash', () => {
    const g = makeTestGame(50, { age: 45, money: 50000 })
    expect(establishGivingFund(g, 10000)).toBe(true); expect(g.character.money).toBe(39500)
    expect(g.counters.donated).toBe(1); expect(g.counters.moneyDonated).toBe(10000)
    expect(commitGivingProgram(g, 'education', 4000)).toBe(false)
    expect(commitGivingProgram(g, 'education', 2000)).toBe(true)
    for (let y = 0; y < 3; y++) { g.year++; yearlyGivingFund(g); const copy = JSON.stringify(g); yearlyGivingFund(g); expect(JSON.stringify(g)).toBe(copy) }
    const f = givingFund(g)!; expect(f.yearsLeft).toBe(0); expect(f.granted).toBe(6000)
    expect(f.balance + f.administration + f.granted).toBe(f.contributed + 500)
    expect(g.character.money).toBe(39500)
  })
  it('passes giving stewardship and retained IP through the real estate flow, not personal training', () => {
    const { g, a } = master(); establishGivingFund(g, 10000); commitGivingProgram(g, 'health', 1000)
    const p = createPerson(g, { relation: 'child', age: 25, firstName: 'Heir', livesWithPlayer: true }); p.relationship = 90
    g.character.willBeneficiaries = [p.id]; g.flags.professions = { medicine: { skill: 95 } }; g.character.alive = false
    const next = continueAsChild(g, p.id)
    expect(next).not.toBe(g); expect(next.flags.professions).toBeUndefined(); expect(givingFund(next)?.balance).toBe(10000)
    // The sole heir retains solvent property; rights remain attached to that asset.
    expect(next.assets.some(x => x.id === a.id && musicMaster(x))).toBe(true)
    expect(next.character.education.degrees.some(d => d.kind === 'md')).toBe(false)
    expect(next.flags.instruments).toBeUndefined()
  })
  it('opt-in succession policy requires actual readiness but preserves ownership designations', () => {
    const { g, a, b } = world(105); g.character.money = 100000
    const p = kid(g, 25, { smarts: 80 }); hireRelative(g, a, b, p, { rank: 2 }, { quiet: true }); designateSuccessor(g, a, bizOf(g, a), p)
    expect(adoptSuccessionReview(g, a.id)).toBe(true)
    expect(successorManager(g, a, bizOf(g, a), () => 50000)).toBeNull()
    const job = readJob(p)!; job.skill = 80; job.since = g.year - 6; writeJob(p, job)
    expect(successionReadiness(g, a, bizOf(g, a))).toBeNull(); expect(successorManager(g, a, bizOf(g, a), () => 50000)?.personId).toBe(p.id)
  })
  it('keeps the succession review out of the way until succession is a real question', () => {
    // Playtest: a day-old café already showed "Existing succession rules; enhanced policy not adopted…".
    const { g, a, b } = world(106, { age: 30 }); g.character.money = 100000
    b.founded = g.year
    const menu = successionReviewMenu(a)
    expect(menu.visible?.(g)).toBe(false)
    g.character.age = 46
    expect(menu.visible?.(g)).toBe(true)
    g.character.age = 30; b.founded = g.year - 6
    expect(menu.visible?.(g)).toBe(true)
    b.founded = g.year
    const p = kid(g, 25, { smarts: 80 }); hireRelative(g, a, b, p, { rank: 2 }, { quiet: true })
    expect(menu.visible?.(g)).toBe(true)
    const text = menu.children(g).map(n => n.type === 'info' ? String(n.text) : n.type === 'action' ? `${n.label} ${String(n.subtitle)}` : '').join('\n')
    expect(text).toMatch(/^Off: your named successor takes over when you step back, ready or not\./)
    expect(text).not.toMatch(/enhanced policy|transfers ownership, not competence|Succession Planning/)
  })
})
