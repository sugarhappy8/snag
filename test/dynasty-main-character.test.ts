import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createPerson } from '../src/game/people'
import { continueAsChild } from '../src/game/life'
import { hasMainCharacter, npcHasMainCharacter, refreshFamilyTalents } from '../src/game/talents'
import { initializeNpc, npcCompany, npcLife, npcLifeNodes, npcWorth, startNpcCompany, yearlyNpcLife } from '../src/game/npc-lives'
import { saveNpcLife } from '../src/game/npc-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { marketCtxFor, planFor, refreshValue, startupCost } from '../src/game/business/economy'
import { formGroup, groupDividend } from '../src/game/business/conglomerate-actions'
import { diluteGroupEquity, groupById, groupsOf, groupStake, groupValue, liveGroup, saveGroup, syncMembers } from '../src/game/business/conglomerate-state'
import { familyGroupStake, payFamilyBusinessProceeds, settleLateFamilyOwners } from '../src/game/business/dynasty-ownership'
import { groupBuybackQuote } from '../src/game/business/group-buyback'
import { bizOf, readBiz } from '../src/game/business/state'
import { planHire } from '../src/game/business/nepo-actions'
import { ceilingOf, startSkill } from '../src/game/business/nepo-model'
import { manageBlock } from '../src/game/business/gate'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { detach } from '../src/game/business/conglomerate-state'
import type { GameState } from '../src/game/types'

function family(seed = 71) {
  const g = makeTestGame(seed, { age: 55, money: 2_000_000, talents: ['MainCharacter'] })
  const a = createPerson(g, { relation: 'child', age: 28, firstName: 'Ada', money: 10_000, occupation: 'Engineer', relationship: 95 })
  const b = createPerson(g, { relation: 'child', age: 24, firstName: 'Ben', money: 10_000, occupation: 'Clerk', relationship: 95 })
  return { g, a, b }
}
function holding() {
  const { g, a, b } = family()
  for (const name of ['First Division', 'Second Division']) {
    const state = newBiz(g, 'cafe', 'us', 'Chicago', { cash: 4_000_000, founded: 2020, ceo: 'manager',
      manager: { firstName: 'Trusted', lastName: 'Manager', gender: 'female', skill: 93, salary: 100_000, since: 2020 } })
    state.valuation = 5_000_000
    g.assets.push(createBusinessAsset(g, name, state, 200_000))
  }
  expect(formGroup(g, g.assets.map(x => x.id), 'Dynasty Holdings')).toBe(true)
  const id = groupsOf(g)[0].core.id
  const grp = liveGroup(g, id)!
  grp.core.ceo = 'manager'; grp.core.manager = { firstName: 'Group', lastName: 'Chief', gender: 'male', skill: 95, salary: 200_000, since: 2020 }
  grp.core.treasuryId = grp.members[0].a.id
  saveGroup(g, grp)
  g.queue = []; g.character.money = 2_000_000
  return { g, a, b, id }
}
function die(g: GameState) { g.character.alive = false; g.character.causeOfDeath = 'Old Age' }

describe('Main Character Syndrome dynasty', () => {
  it('passes to every child at birth, including adoption, stepchildren and descendants, never unrelated NPCs', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { g, a, b } = family(seed)
      expect(npcHasMainCharacter(a)).toBe(true); expect(npcHasMainCharacter(b)).toBe(true)
      const step = createPerson(g, { relation: 'stepchild', age: 4, biological: false })
      const adopted = createPerson(g, { relation: 'child', age: 2, biological: false })
      const grandchild = createPerson(g, { relation: 'grandchild', age: 0, data: { parentId: a.id } })
      expect([step, adopted, grandchild].every(npcHasMainCharacter)).toBe(true)
      expect(JSON.stringify(npcLifeNodes(g, grandchild))).toContain('Main Character Syndrome')
      expect(npcHasMainCharacter(createPerson(g, { relation: 'friend', age: 28 }))).toBe(false)
    }
  })
  it('repairs existing children and grandchildren without randomness or money grants, including after JSON reload', () => {
    const { g, a } = family()
    const grandchild = createPerson(g, { relation: 'grandchild', age: 1, data: { childOf: a.id } })
    delete a.data.talents; delete grandchild.data.talents
    g.people.reverse()
    const rng = g.rng, cash = g.people.map(x => x.money)
    refreshFamilyTalents(g)
    expect(npcHasMainCharacter(a) && npcHasMainCharacter(grandchild)).toBe(true)
    expect(g.rng).toBe(rng); expect(g.people.map(x => x.money)).toEqual(cash)
    const clone = JSON.parse(JSON.stringify(g)) as GameState, once = structuredClone(clone)
    refreshFamilyTalents(clone); expect(clone).toEqual(once)
  })
  it('ordinary families do not suddenly acquire the talent', () => {
    const g = makeTestGame()
    const child = createPerson(g, { relation: 'child', age: 18 })
    refreshFamilyTalents(g); expect(npcHasMainCharacter(child)).toBe(false)
  })
  it('masters schoolwork with age limits and work at adult level before becoming playable', () => {
    const { g, a, b } = family()
    a.age = 10; a.money = 0; a.occupation = 'Student'
    const adult = initializeNpc(g, b); adult.ambition = 20; adult.investments = 0; saveNpcLife(b, adult)
    const parentMoney = g.character.money
    yearlyNpcLife(g, a); yearlyNpcLife(g, b)
    expect(npcLife(a)!.skill).toBeGreaterThan(50); expect(npcLife(a)!.skill).toBeLessThan(100)
    expect(a.stats.smarts).toBe(100); expect(a.money).toBe(0)
    expect(npcLife(b)!.skill).toBe(100); expect(g.character.money).toBe(parentMoney)
    const before = structuredClone(g); yearlyNpcLife(g, b); expect(g).toEqual(before)
    die(g)
    const next = continueAsChild(g, b.id)
    expect(hasMainCharacter(next)).toBe(true)
    expect(next.character.talents).toEqual(['MainCharacter'])
  })
  it('uses mastery in family leadership recruitment too, without inventing a salary or bypassing childhood ceilings', () => {
    const { g, a, b } = family(), company = newBiz(g, 'software', 'us', 'Chicago')
    const before = JSON.stringify(g)
    for (const focus of ['ops', 'sales', 'quality', 'finance'] as const) expect(planHire(g, company, a, { rank: 5, focus }).skill).toBe(100)
    expect(startSkill(a)).toBe(100); expect(ceilingOf(a)).toBe(100)
    expect(JSON.stringify(g)).toBe(before)
    b.age = 12; expect(startSkill(b)).toBeLessThan(100)
    expect(planHire(g, company, a, { kind: 'cushy', rank: 5 }).skill).toBe(25)
  })
  it('high ambition launches a funded rival; low ambition keeps the same talent without forcing entrepreneurship', () => {
    const { g, a } = family()
    a.money = 5_000_000; a.occupation = 'Engineer'
    const l = initializeNpc(g, a); l.ambition = 100; saveNpcLife(a, l)
    const state = newBiz(g, 'cafe', 'us', 'Chicago', { cash: 1_000_000 })
    const asset = createBusinessAsset(g, 'Parent Café', state, 100_000); g.assets.push(asset); refreshValue(asset, state)
    const original = structuredClone(g)
    for (let n = 0; n < 20 && !npcCompany(a, g.year); n++) { yearlyNpcLife(g, a); if (!npcCompany(a, g.year)) { g.year++; a.age++ } }
    expect(npcCompany(a, g.year)?.b.industry).toBe('cafe')
    expect(a.data.rivalOf).toBe(asset.id); expect(a.money).toBeLessThan(5_000_000)
    expect(npcCompany(a, g.year)?.b.manager?.skill).toBe(100)
    expect(npcLife(a)!.history.join(' ')).toContain('launched a rival')
    const replay = JSON.parse(JSON.stringify(original)) as GameState, kid = replay.people[0]
    for (let n = 0; n < 20 && !npcCompany(kid, replay.year); n++) { yearlyNpcLife(replay, kid); if (!npcCompany(kid, replay.year)) { replay.year++; kid.age++ } }
    expect(replay).toEqual(g)
    const quiet = original.people[0], quietLife = npcLife(quiet)!; quietLife.ambition = 10; saveNpcLife(quiet, quietLife)
    for (let n = 0; n < 15; n++) { yearlyNpcLife(original, quiet); original.year++; quiet.age++ }
    expect(npcCompany(quiet, original.year)).toBeNull(); expect(npcHasMainCharacter(quiet)).toBe(true)
    expect(JSON.stringify(npcLifeNodes(g, a))).toContain('Ambition')
  })
  it('cannot start a business without savings, invent an unavailable industry or compete with itself', () => {
    const { g, a } = family()
    a.money = 1; expect(startNpcCompany(g, a, 'cafe')).toBe(false)
    a.money = 2_000_000; g.year = 1920; expect(startNpcCompany(g, a, 'aiLab')).toBe(false)
    g.year = 2026; const before = a.money
    expect(startNpcCompany(g, a, 'cafe')).toBe(true)
    const cost = startupCost('cafe', 'us', npcCompany(a, g.year)!.b.city)
    expect(before - a.money).toBeCloseTo(cost.capital * 1.5 + cost.fee + cost.permits)
    const own = npcCompany(a, g.year)!.b, ctx = marketCtxFor(g, own, g.year)
    expect(ctx.rivals.some(x => x.id.startsWith('npc:'))).toBe(false)
    const target = newBiz(g, 'cafe', 'us', 'Chicago', { cash: 500_000 })
    const rivalCtx = marketCtxFor(g, target, g.year)
    expect(rivalCtx.rivals.some(x => x.name === npcCompany(a, g.year)!.a.name)).toBe(true)
    const snapshot = JSON.stringify(g)
    planFor(g, target, g.year); expect(JSON.stringify(g)).toBe(snapshot)
    const without = structuredClone(g); delete without.people[0].data.npcCompany
    expect(planFor(g, target, g.year).demand).toBeLessThan(planFor(without, target, g.year).demand)
    const overseas = newBiz(g, 'cafe', 'jp', 'Tokyo', { cash: 500_000 })
    expect(marketCtxFor(g, overseas, g.year).rivals.some(x => x.id.startsWith('npc:'))).toBe(false)
    target.production = 100_000
    g.assets.push(createBusinessAsset(g, 'Parent Competitor', target, 100_000))
    expect(marketCtxFor(g, own, g.year).rivals.some(x => x.id.startsWith('owned:'))).toBe(true)
  })
})

describe('intact conglomerate inheritance', () => {
  it('divides only ownership, preserving divisions, CEO, treasury and sibling wealth without double cash', () => {
    const { g, a, b, id } = holding(), old = groupById(g, id)!
    const cash = old.members.map(x => [x.a.id, x.b.cash]), value = groupValue(old)
    die(g)
    for (const child of [a, b]) {
      const next = continueAsChild(g, child.id), grp = groupById(next, id)!
      expect(grp.members).toHaveLength(2); expect(grp.core.share).toBe(.5)
      expect(grp.core.manager).toEqual(old.core.manager); expect(grp.core.treasuryId).toBe(old.core.treasuryId)
      expect(grp.members.map(x => [x.a.id, x.b.cash])).toEqual(cash)
      expect(groupStake(grp)).toBeCloseTo(value / 2, -1)
      const sibling = next.people.find(x => x.id === (child.id === a.id ? b.id : a.id))!
      expect(sibling.money).toBe(1_010_000); expect(next.character.money).toBe(1_010_000)
      expect(familyGroupStake(next, sibling.id)).toBeCloseTo(value / 2, -1)
      expect(npcWorth(sibling, next.year, next)).toBeGreaterThan(sibling.money)
      expect(groupBuybackQuote(next, grp, 100).available).toBe(0)
      const clone = JSON.parse(JSON.stringify(next)) as GameState
      expect(groupById(clone, id)?.core.familyShares).toEqual(grp.core.familyShares)
    }
  })
  it('supports minors and very small ownership stakes without a 1% share giveaway', () => {
    const { g, a, b, id } = holding(); a.age = 8; b.age = 6
    // The sitting group CEO holds 10% (an old save's grant): shares nobody holds would go back to the founder.
    const grp = liveGroup(g, id)!; grp.core.share = .012; grp.core.executiveEquity = .1; grp.core.manager!.equity = .1; syncMembers(grp); saveGroup(g, grp)
    die(g)
    const next = continueAsChild(g, a.id), inherited = groupById(next, id)!
    expect(inherited.core.share).toBe(.006)
    expect(inherited.core.familyShares).toEqual([{ id: b.id, share: .006 }])
    expect(inherited.core.executiveEquity).toBe(.1)
    expect(inherited.members.every(x => readBiz(next, x.a).share === .006)).toBe(true)
    expect(inherited.core.manager).not.toBeNull()
  })
  it('keeps an excluded heir from taking over the other child’s shares while the group keeps operating', () => {
    const { g, a, b, id } = holding(); g.character.willBeneficiaries = [b.id]; die(g)
    const next = continueAsChild(g, a.id), grp = groupById(next, id)!
    expect(grp.core.share).toBe(0); expect(grp.core.familyShares).toEqual([{ id: b.id, share: 1 }])
    expect(grp.members.every(x => x.a.value === 0)).toBe(true)
    expect(manageBlock(next, next.assets[0])).toContain('no ownership stake')
    expect(groupDividend(next, id, 10_000)).toBe(false)
    next.year++; next.character.age++; yearlyBusinessImpl(next)
    expect(groupById(next, id)?.members.length).toBeGreaterThanOrEqual(2)
    expect(groupById(next, id)?.core.familyShares?.find(x => x.id === b.id)?.share).toBe(1)
  })
  it('divides only the new deceased stake across another generation and protects older co-owners', () => {
    const { g, a, b, id } = holding(); die(g)
    const second = continueAsChild(g, a.id)
    const firstKid = createPerson(second, { relation: 'child', age: 22, money: 0 })
    const secondKid = createPerson(second, { relation: 'child', age: 20, money: 0 })
    die(second)
    const third = continueAsChild(second, firstKid.id), grp = groupById(third, id)!
    expect(grp.core.share).toBe(.25)
    expect(grp.core.familyShares).toEqual([{ id: b.id, share: .5 }, { id: secondKid.id, share: .25 }])
    expect(grp.members).toHaveLength(2); expect(hasMainCharacter(third)).toBe(true)
  })
  it('turns an inherited group CEO appointment into the playable chair rather than hiring the heir as their own manager', () => {
    const { g, a, id } = holding(), grp = liveGroup(g, id)!
    grp.core.manager!.personId = a.id; grp.core.manager!.firstName = a.firstName
    saveGroup(g, grp); die(g)
    const next = continueAsChild(g, a.id), inherited = groupById(next, id)!
    expect(inherited.core.ceo).toBe('owner'); expect(inherited.core.manager).toBeNull()
    expect(inherited.core.share).toBe(.5)
  })
  it('pays dividends to siblings and dilutes family equity proportionally on new share issues', () => {
    const { g, a, b, id } = holding(); die(g)
    const next = continueAsChild(g, a.id), sibling = next.people.find(x => x.id === b.id)!
    const before = sibling.money
    expect(groupDividend(next, id, 100_000)).toBe(true)
    expect(sibling.money - before).toBe(40_000)
    const grp = liveGroup(next, id)!; grp.core.share *= .75; diluteGroupEquity(grp, .75); syncMembers(grp); saveGroup(next, grp)
    expect(groupById(next, id)?.core.share).toBe(.375)
    expect(groupById(next, id)?.core.familyShares).toEqual([{ id: b.id, share: .375 }])
    expect(groupBuybackQuote(next, groupById(next, id)!, 100).available).toBe(.25)
    expect(bizOf(next, next.assets[0]).cash).toBeGreaterThan(0)
  })
  it('routes a late co-owner\'s dividends and stake to their heirs, never to the dead record', () => {
    const { g, a, b, id } = holding(); die(g)
    const next = continueAsChild(g, a.id), sibling = next.people.find(x => x.id === b.id)!
    sibling.alive = false; sibling.causeOfDeath = 'Old Age'
    const late = sibling.money, mine = next.character.money
    expect(groupDividend(next, id, 100_000)).toBe(true)
    // The heir is the only modeled relative left: the late sibling's half reaches them, taxed as income.
    expect(sibling.money).toBe(late)
    expect(next.character.money - mine).toBe(100_000)
    expect(next.flags.taxableIncome).toBe(100_000)
    const replay = structuredClone(next)
    settleLateFamilyOwners(next)
    const grp = groupById(next, id)!
    expect(grp.core.familyShares ?? []).toEqual([]); expect(grp.core.share).toBe(1)
    expect(grp.members.every(x => readBiz(next, x.a).share === 1)).toBe(true)
    expect(JSON.stringify(next.log)).toContain('passed to me as their heir')
    // The yearly business hook settles it too (older saves included).
    replay.year++; replay.character.age++; yearlyBusinessImpl(replay)
    expect(groupById(replay, id)!.core.familyShares ?? []).toEqual([])
  })
  it('sends a late co-owner with an unmodeled family of their own to outside heirs and pays charity explicitly', () => {
    const { g, a, b, id } = holding(); die(g)
    const next = continueAsChild(g, a.id), sibling = next.people.find(x => x.id === b.id)!
    const grp = liveGroup(next, id)!
    grp.core.familyShares = [{ id: b.id, share: .4 }, { id: 'charity', share: .1 }]; saveGroup(next, grp)
    sibling.alive = false; sibling.data.married = true; sibling.data.kids = 2
    const late = sibling.money, mine = next.character.money
    expect(groupDividend(next, id, 100_000)).toBe(true)
    expect(sibling.money).toBe(late); expect(next.character.money - mine).toBe(50_000)
    expect(JSON.stringify(next.log)).toContain('to charity')
    settleLateFamilyOwners(next)
    const after = groupById(next, id)!
    expect(after.core.share).toBe(.5); expect(after.core.familyShares).toEqual([{ id: 'charity', share: .1 }])
    expect(groupBuybackQuote(next, after, 100).available).toBeCloseTo(.4)
  })
  it('routes a dead co-owner\'s sale proceeds to the heirs of a spun-off company', () => {
    const { g, a, b, id } = holding(); die(g)
    const next = continueAsChild(g, a.id), grp = liveGroup(next, id)!, member = grp.members[0]
    detach(next, member.a, member.b, null)
    const sibling = next.people.find(x => x.id === b.id)!
    sibling.alive = false
    const late = sibling.money, mine = next.character.money
    payFamilyBusinessProceeds(next, readBiz(next, member.a), 1_000_000)
    expect(sibling.money).toBe(late); expect(next.character.money - mine).toBe(500_000)
  })
  it('retains family co-owners on spun-off companies and the next succession', () => {
    const { g, a, b, id } = holding(); die(g)
    const next = continueAsChild(g, a.id), grp = liveGroup(next, id)!, member = grp.members[0]
    detach(next, member.a, member.b, null)
    expect(readBiz(next, member.a).familyShares).toEqual([{ id: b.id, share: .5 }])
    const firstKid = createPerson(next, { relation: 'child', age: 20, money: 0 })
    createPerson(next, { relation: 'child', age: 18, money: 0 })
    die(next)
    const third = continueAsChild(next, firstKid.id), carried = third.assets.find(x => x.id === member.a.id)!
    expect(carried).toBeDefined(); expect(readBiz(third, carried).share).toBe(.25)
    expect(readBiz(third, carried).familyShares?.find(x => x.id === b.id)?.share).toBe(.5)
  })
})
