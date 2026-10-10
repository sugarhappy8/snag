import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createPerson } from '../src/game/people'
import { expandNpcCompany, initializeNpc, investInNpc, liquidateNpcEstate, npcBusinessYear, npcCompany, npcLife, npcLifeNodes, npcWorth, startNpcCompany, yearlyNpcLife } from '../src/game/npc-lives'
import { saveNpcLife, npcEducationSkill } from '../src/game/npc-state'
import { initializeBirthParent, birthBackgroundFor, yearlyBackground } from '../src/game/birth-background'
import { initializeRoyalBirth, royalEligible, royalMenu, royalRule, royalStatus, yearlyRoyalty, type RoyalStatus } from '../src/game/royalty'
import { continueAsChild, createNewLife } from '../src/game/life'
import { nextRandom } from '../src/game/rng'
import { investmentHoldings, sellHolding, yearlyInvestments } from '../src/game/investments'
import { planHire, planBlock } from '../src/game/business/nepo-actions'
import { newBiz } from '../src/game/business/founding'
import { bestPlan, simulateYear } from '../src/game/business/economy'
import { askOdds, presentAsk } from '../src/game/business/nepo-asks'
import { typicalIncome } from '../src/game/events/wealth-core'
import type { GameState, Json } from '../src/game/types'

function friend() {
  const g = makeTestGame(52,{age:35,money:20_000_000})
  const p = createPerson(g,{relation:'friend',firstName:'Adam',age:30,money:3_000_000,occupation:'Engineer',relationship:90,stats:{smarts:88},traits:['ambitious','loyal']})
  const l = initializeNpc(g,p)
  return {g,p,l}
}
const royal = (country: string, extras: Partial<RoyalStatus> = {}): RoyalStatus => ({country,house:royalRule(country,2000)?.house ?? 'Shah',territory:'',title:'Prince',born:1980,rank:'child',line:1,maleLine:true,status:'active',reputation:80,duties:0,lastYear:1999,predecessorAge:60,parentId:'father',allowance:0,...extras})
describe('persistent independent NPC lives', () => {
  it('funds forecast-positive expansion from company cash, with no unlimited growth', () => {
    const {g,p,l}=friend();startNpcCompany(g,p,'cafe')
    const b=npcCompany(p,g.year)!.b;l.skill=99;b.cash=20000000;b.brand=95;b.quality=95
    const plan=bestPlan(g,b);b.price=plan.price;b.production=plan.production
    simulateYear(g,b,g.year,0,1)
    const before=b.cash, sites=b.outlets.reduce((n,o)=>n+o.count,0)
    const spent=expandNpcCompany(g,b,l)
    expect(spent).toBeGreaterThan(0);expect(b.cash).toBe(before-spent)
    expect(b.outlets.reduce((n,o)=>n+o.count,0)).toBe(sites+1)
    b.cash=0;expect(expandNpcCompany(g,b,l)).toBe(0)
  })
  it('connects new qualifications to relevant recruitment instead of automatic excellence', () => {
    const {g,p,l}=friend();p.occupation='Unemployed';l.education=2;l.field='Computer Science';l.achievements=["Master's in Computer Science"];saveNpcLife(p,l)
    const b=newBiz(g,'software','us','Chicago',{cash:3000000,founded:2020}), base=askOdds(g,b,p)
    p.data.npcRecruitmentYear=g.year
    expect(askOdds(g,b,p)).toBeGreaterThan(base)
    expect(planHire(g,b,p,{rank:1}).focus).toBe('quality')
    const a={id:'software',kind:'business' as const,name:'Research Co',emoji:'🏢',purchasePrice:1,value:1,condition:100,purchasedAge:30,upkeep:0,details:b as unknown as Record<string,Json>};g.assets.push(a)
    presentAsk(g,a,b,[{pid:p.id,want:1}])
    expect(JSON.stringify(g.queue)).toContain("Master's in Computer Science")
  })
  it('progresses education to a relevant skill and keeps history on reload', () => {
    const {g,p,l} = friend(); p.age = 18; p.occupation = 'University Student'; l.education=0; l.study=0; l.field='Engineering'; saveNpcLife(p,l)
    for(let y=2026;y<2030;y++){g.year=y;p.age++;yearlyNpcLife(g,p)}
    const live=npcLife(p)!
    expect(live.education).toBe(1)
    expect(live.achievements).toContain("Bachelor's in Engineering")
    expect(live.skill).toBeLessThan(95)
    expect(npcEducationSkill(p,'quality')).toBeGreaterThan(npcEducationSkill(p,'sales'))
    const clone=JSON.parse(JSON.stringify(g)) as GameState
    expect(npcLife(clone.people[0])).toEqual(live)
    const before=JSON.stringify(clone);yearlyNpcLife(clone,clone.people[0]);expect(JSON.stringify(clone)).toBe(before)
  })
  it('never adds a second salary over existing family payroll', () => {
    const {g,p,l}=friend(); p.data.nepo={assetId:'boss',rank:2,focus:'ops',kind:'real',title:'Engineer',since:2020,rankSince:2020,pay:100000,skill:75,mood:80,perf:70,raised:0,unpaid:0,part:false,groom:false,burn:0}
    l.investments=0;saveNpcLife(p,l)
    const money=p.money;yearlyNpcLife(g,p);expect(p.money).toBe(money)
  })
  it('requires actual savings, charges startup capital and obeys technology availability', () => {
    const {g,p}=friend(), before=p.money
    expect(startNpcCompany(g,p,'cafe')).toBe(true)
    expect(p.money).toBeLessThan(before)
    expect(npcCompany(p,g.year)!.b.cash).toBeGreaterThan(0)
    expect(startNpcCompany(g,p,'cafe')).toBe(false)
    const old=friend();old.g.year=1920;expect(startNpcCompany(old.g,old.p,'aiLab')).toBe(false)
    const poor=friend();poor.p.money=10;expect(startNpcCompany(poor.g,poor.p,'cafe')).toBe(false)
  })
  it('subscribes cash into NPC firms without paying it to founders or printing profit', () => {
    const {g,p}=friend();startNpcCompany(g,p,'cafe')
    const before=npcCompany(p,g.year)!, cash=before.b.cash, personal=g.character.money, founder=p.money
    const amount=before.b.valuation*.1
    expect(investInNpc(g,p.id,amount)).toBe(true)
    const after=npcCompany(p,g.year)!
    expect(after.b.cash).toBeCloseTo(cash+Math.round(amount))
    expect(p.money).toBe(founder);expect(g.character.money).toBeCloseTo(personal-Math.round(amount))
    const holding=g.assets[0];expect(holding.details.type).toBe('npcEquity')
    expect(after.b.share+Number(holding.details.share)).toBeCloseTo(1)
    expect(after.b.yearIncome).toBe(0)
    expect(investmentHoldings(g)).toHaveLength(0)
    const heldValue=holding.value;yearlyInvestments(g);expect(holding.value).toBe(heldValue)
    expect(sellHolding(g,holding.id,'all')).toBe(false)
    expect(investInNpc(g,p.id,amount)).toBe(false)
  })
  it('acquisition pays the founder and transfers exactly one playable company', () => {
    const {g,p}=friend();startNpcCompany(g,p,'cafe');const c=npcCompany(p,g.year)!, personal=g.character.money, cash=c.b.cash, founder=p.money
    expect(investInNpc(g,p.id,1,true)).toBe(true)
    expect(npcCompany(p,g.year)).toBeNull()
    expect(g.assets.filter(a=>a.id===c.a.id)).toHaveLength(1)
    expect(g.assets[0].details.cash).toBe(cash)
    expect(p.money-founder).toBeCloseTo(personal-g.character.money)
    expect(investInNpc(g,p.id,1,true)).toBe(false)
  })
  it('settles an NPC business only once and allows real losses', () => {
    const {g,p,l}=friend();startNpcCompany(g,p,'cafe');g.year++
    npcBusinessYear(g,p,l)
    const before=JSON.stringify(g);npcBusinessYear(g,p,l);expect(JSON.stringify(g)).toBe(before)
    const c=npcCompany(p,g.year)!
    c.b.cash=0;c.b.debt=100_000_000;c.b.production=0;p.data.npcCompany=c.a as unknown as Json
    g.year++;npcBusinessYear(g,p,l);expect(npcCompany(p,g.year)).toBeNull()
  })
  it('qualifications do not force someone to accept a pay cut', () => {
    const {g,p,l}=friend();l.income=1_000_000;saveNpcLife(p,l)
    const b=newBiz(g,'software','us','Chicago'), plan=planHire(g,b,p,{rank:1,focus:'quality'})
    expect(planBlock(g,b,p,plan)).toMatch(/declines/)
  })
  it('life profile reads are pure and do not expose distant private financial details', () => {
    const {g,p}=friend();p.relationship=10
    const before=JSON.stringify(g), rows=npcLifeNodes(g,p)
    expect(JSON.stringify(rows)).toMatch(/not known/)
    expect(JSON.stringify(g)).toBe(before)
  })
  it('liquidates financial assets into an estate once, paying off debt first', () => {
    const {g,p,l}=friend();p.money=100;l.investments=1000;l.housing=5000;l.debt=700;saveNpcLife(p,l)
    expect(npcWorth(p,g.year)).toBe(5400)
    liquidateNpcEstate(g,p);expect(p.money).toBe(5400)
    liquidateNpcEstate(g,p);expect(p.money).toBe(5400)
  })
  it('carries actual degrees, own businesses, private wealth and other NPC histories to an heir', () => {
    const {g,p,l}=friend();p.relation='child';l.education=2;l.field='Mathematics';l.investments=20000;saveNpcLife(p,l)
    startNpcCompany(g,p,'cafe')
    const c=npcCompany(p,g.year)!
    const other=createPerson(g,{relation:'sibling',age:40,money:10000});const ol=initializeNpc(g,other);ol.history=['2020: started a business'];saveNpcLife(other,ol)
    g.character.alive=false;g.character.causeOfDeath='Old age'
    const heir=continueAsChild(g,p.id)
    expect(heir.character.id).toBe(p.id)
    expect(heir.character.education.degrees.some(d=>d.kind==='master'&&d.major==='Mathematics')).toBe(true)
    expect(heir.assets.filter(a=>a.id===c.a.id)).toHaveLength(1)
    expect(npcLife(heir.people.find(x=>x.id===other.id)!)?.history).toContain('2020: started a business')
  })
  it('keeps an adult heir in their actual country with their existing passports', () => {
    const {g,p,l}=friend();p.relation='child';p.data.countryId='gb';p.data.citizenships=['us','gb'];l.country='gb';l.city='London';saveNpcLife(p,l)
    g.character.alive=false
    const heir=continueAsChild(g,p.id)
    expect(heir.character.countryId).toBe('gb');expect(heir.character.city).toBe('London');expect(heir.character.citizenships).toEqual(['us','gb'])
  })
  it('does not invent a university qualification from an heir job title', () => {
    const {g,p,l}=friend();p.relation='child';p.occupation='Engineer';l.education=0;saveNpcLife(p,l)
    g.character.alive=false
    const heir=continueAsChild(g,p.id)
    expect(heir.character.education.degrees.some(d=>d.kind==='bachelor')).toBe(false)
    expect(heir.character.education.completed).not.toContain('university')
  })
})

describe('historical royalty and birth circumstances', () => {
  it('keeps a reigning royal parent out of ordinary layoffs and ends that role on abolition', () => {
    const {g,p,l}=friend();g.year=2007;p.data.countryId='np';p.data.royalCountry='np';p.data.royalHouse='Shah';p.data.royalRole='King';p.data.royalSovereign=true;l.lastYear=2006;saveNpcLife(p,l)
    yearlyNpcLife(g,p);expect(p.occupation).toBe('King');expect(npcLife(p)!.employer).toBe('Shah court')
    g.year=2008;yearlyNpcLife(g,p);expect(p.data.royalSovereign).toBe(false);expect(p.occupation).not.toBe('King')
  })
  it('requires a local reigning monarchy, including abolished regimes and restoration gaps', () => {
    expect(royalRule('us',1900)).toBeNull();expect(royalRule('fr',2026)).toBeNull()
    expect(royalRule('np',2007)).not.toBeNull();expect(royalRule('np',2008)).toBeNull()
    expect(royalRule('es',1940)).toBeNull();expect(royalRule('es',1976)).not.toBeNull()
    expect(royalRule('kr',1905)).not.toBeNull();expect(royalRule('kr',1950)).toBeNull()
    expect(royalRule('sa',1920)).toBeNull()
  })
  it('royal generation is a rare reproducible engine roll, not a server result', () => {
    let rare=0, hits=0
    for(let seed=0;seed<100000;seed++) if(nextRandom(seed)[0]<.0001){rare=seed;hits++}
    expect(hits).toBeGreaterThan(0);expect(hits).toBeLessThan(40)
    const g=makeTestGame(rare,{countryId:'ae',birthCountryId:'ae'}), p=createPerson(g,{relation:'parent',age:40,gender:'male'})
    g.rng=rare;const same=structuredClone(g)
    expect(initializeRoyalBirth(g)).toBe(true);expect(initializeRoyalBirth(same)).toBe(true)
    expect(royalStatus(g)).toEqual(royalStatus(same));expect(royalStatus(g)!.parentId).toBe(p.id)
    expect(royalStatus(g)!.title).toBe('Sheikh');expect(royalStatus(g)!.territory).not.toBe('')
    expect(g.character.money).toBe(0)
  })
  it('checks male-line rules and constitutional changes', () => {
    expect(royalEligible(royal('jp'),'female',2026)).toBe(false)
    expect(royalEligible(royal('jp',{maleLine:false}),'male',2026)).toBe(false)
    expect(royalEligible(royal('gb'),'female',2026)).toBe(true)
    expect(royalRule('jp',1950)!.system).toBe('constitutional')
    expect(royalRule('se',1985)!.succession).toBe('eldest')
  })
  it('ends official allowances when a monarchy is abolished without seizing private cash', () => {
    const g=makeTestGame(1,{age:30,countryId:'np',money:3000});g.year=2008;g.flags.royalty=royal('np',{lastYear:2007,duties:3}) as unknown as Json
    yearlyRoyalty(g);expect(royalStatus(g)!.status).toBe('former');expect(royalStatus(g)!.allowance).toBe(0);expect(g.character.money).toBe(3000)
    const before=JSON.stringify(g);yearlyRoyalty(g);expect(JSON.stringify(g)).toBe(before)
  })
  it('pays adults for duties once, never grants a child an unexplained allowance', () => {
    const g=makeTestGame(1,{age:13,countryId:'gb'});g.year=2000;g.flags.royalty=royal('gb',{duties:3}) as unknown as Json
    yearlyRoyalty(g);expect(g.character.money).toBe(0)
    g.year++;g.character.age=18;const r=royalStatus(g)!;r.duties=3;g.flags.royalty=r as unknown as Json
    yearlyRoyalty(g);expect(g.character.money).toBeGreaterThan(0)
    const money=g.character.money;yearlyRoyalty(g);expect(g.character.money).toBe(money)
    const before=JSON.stringify(g);if(royalMenu.type==='menu')royalMenu.children(g);expect(JSON.stringify(g)).toBe(before)
  })
  it('can succeed to a constitutional crown but never inherits UAE federal presidency', () => {
    const g=makeTestGame(2,{age:25,countryId:'gb'});g.year=2000
    const p=createPerson(g,{relation:'parent',age:70,gender:'male'});p.alive=false
    g.flags.royalty=royal('gb',{parentId:p.id}) as unknown as Json
    yearlyRoyalty(g);expect(royalStatus(g)!.rank).toBe('ruler');expect(royalStatus(g)!.title).toBe('King')
    g.flags.royalty=royal('ae',{house:'Al Maktoum',territory:'Dubai'}) as unknown as Json
    const rows=royalMenu.type==='menu'?royalMenu.children(g):[]
    expect(JSON.stringify(rows)).toMatch(/presidency/)
  })
  it('varies ordinary backgrounds by country and era and keeps extreme wealth rare', () => {
    const rich=makeTestGame(1,{countryId:'us'}), poor=makeTestGame(1,{countryId:'ng'});poor.year=1900
    expect(birthBackgroundFor(rich,0)).toBe(0);expect(birthBackgroundFor(rich,.999999)).toBe(7)
    const count=(g:GameState,tier:number)=>Array.from({length:10000},(_,i)=>birthBackgroundFor(g,i/10000)).filter(x=>x===tier).length
    expect(count(rich,7)).toBeLessThan(5);expect(count(poor,0)).toBeGreaterThan(count(rich,0))
  })
  it('backs parent wealth with actual private assets and never funds the newborn directly', () => {
    const g=makeTestGame(2,{countryId:'kr',money:0});g.year=1950;g.flags.birthBackground=7
    const p=createPerson(g,{relation:'parent',age:35,livesWithPlayer:true});initializeBirthParent(g,p)
    expect(npcWorth(p,g.year)/typicalIncome(g)).toBeGreaterThan(10000)
    expect(npcLife(p)!.investments).toBeGreaterThan(p.money)
    expect(npcCompany(p,g.year)).not.toBeNull();expect(g.character.money).toBe(0)
  })
  it('uses current family finances for childhood opportunities, not the birth tier', () => {
    const g=makeTestGame(2,{age:10});g.flags.birthBackground=0
    const p=createPerson(g,{relation:'parent',age:35,livesWithPlayer:true,money:2_000_000});initializeNpc(g,p)
    const before=p.money,smarts=g.character.stats.smarts
    yearlyBackground(g);expect(p.money).toBeLessThan(before);expect(g.character.stats.smarts).toBe(smarts+1)
    const cash=p.money;yearlyBackground(g);expect(p.money).toBe(cash)
  })
  it('fresh lives are deterministic and stay JSON-compatible', () => {
    const a=createNewLife({seed:808,year:1900,countryId:'jp'}),b=createNewLife({seed:808,year:1900,countryId:'jp'})
    expect(a).toEqual(b);expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  })
})
