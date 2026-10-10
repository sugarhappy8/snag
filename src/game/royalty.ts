// Fictional members of historically attested dynasties. Annual resolution is deliberately
// coarser than real constitutional law; no claim to reproduce the actual royal family tree.
import { addHidden, addMoney, addStat, log, notice, useYearAction } from './core'
import { typicalIncome } from './events/wealth-core'
import { chance, randInt } from './rng'
import { seeded } from './assets'
import type { GameState, Gender, Json, MenuNode, Person } from './types'
import { clampN, money, num, rec } from './business/util'
import { getCountry } from './world'

interface RoyalRule { from: number; until: number; house: string; system: 'constitutional' | 'absolute' | 'elective'; succession: 'male' | 'preference' | 'eldest' | 'council'; constitutional?: number; equalFrom?: number }
const FOREVER = 10000
export const ROYAL_RULES: Record<string, RoyalRule[]> = {
  gb: [{ from: 1900, until: FOREVER, house: 'Windsor', system: 'constitutional', succession: 'preference', equalFrom: 2012 }],
  jp: [{ from: 1900, until: FOREVER, house: 'Imperial House of Japan', system: 'absolute', succession: 'male', constitutional: 1947 }],
  sa: [{ from: 1932, until: FOREVER, house: 'Al Saud', system: 'absolute', succession: 'council' }],
  ae: [{ from: 1900, until: FOREVER, house: 'Ruling houses of the emirates', system: 'elective', succession: 'council' }],
  np: [{ from: 1900, until: 2007, house: 'Shah', system: 'absolute', succession: 'male', constitutional: 1990 }],
  es: [{ from: 1900, until: 1930, house: 'Borbón', system: 'constitutional', succession: 'preference' }, { from: 1975, until: FOREVER, house: 'Borbón', system: 'constitutional', succession: 'preference' }],
  se: [{ from: 1900, until: FOREVER, house: 'Bernadotte', system: 'constitutional', succession: 'male', equalFrom: 1980 }],
  dk: [{ from: 1900, until: FOREVER, house: 'Glücksburg', system: 'constitutional', succession: 'male', equalFrom: 2009 }],
  no: [{ from: 1905, until: FOREVER, house: 'Glücksburg', system: 'constitutional', succession: 'preference', equalFrom: 1990 }],
  nl: [{ from: 1900, until: FOREVER, house: 'Orange-Nassau', system: 'constitutional', succession: 'preference', equalFrom: 1983 }],
  be: [{ from: 1900, until: FOREVER, house: 'Belgian Royal House', system: 'constitutional', succession: 'male', equalFrom: 1991 }],
  ma: [{ from: 1900, until: FOREVER, house: 'Alaouite', system: 'absolute', succession: 'male', constitutional: 1962 }],
  jo: [{ from: 1921, until: FOREVER, house: 'Hashemite', system: 'constitutional', succession: 'male' }],
  kw: [{ from: 1900, until: FOREVER, house: 'Al Sabah', system: 'constitutional', succession: 'council' }],
  qa: [{ from: 1900, until: FOREVER, house: 'Al Thani', system: 'absolute', succession: 'council' }],
  my: [{ from: 1957, until: FOREVER, house: 'Johor', system: 'elective', succession: 'council' }],
  th: [{ from: 1900, until: FOREVER, house: 'Chakri', system: 'absolute', succession: 'council', constitutional: 1932 }],
  it: [{ from: 1900, until: 1945, house: 'Savoy', system: 'constitutional', succession: 'male' }],
  ru: [{ from: 1900, until: 1916, house: 'Romanov', system: 'absolute', succession: 'male' }],
  pt: [{ from: 1900, until: 1909, house: 'Braganza', system: 'constitutional', succession: 'male' }],
  cn: [{ from: 1900, until: 1911, house: 'Aisin-Gioro', system: 'absolute', succession: 'male' }],
  kr: [{ from: 1900, until: 1909, house: 'Yi', system: 'absolute', succession: 'male' }],
  ir: [{ from: 1900, until: 1924, house: 'Qajar', system: 'absolute', succession: 'male' }, { from: 1925, until: 1978, house: 'Pahlavi', system: 'absolute', succession: 'male' }],
}
export function royalRule(country: string, year: number): RoyalRule | null {
  const found = ROYAL_RULES[country]?.find(r => year >= r.from && year <= r.until)
  if (!found) return null
  const rule = { ...found }
  if (rule.constitutional && year >= rule.constitutional) rule.system = 'constitutional'
  if (country === 'dk' && year >= 1953 && year < 2009) rule.succession = 'preference'
  if (rule.equalFrom && year >= rule.equalFrom) rule.succession = 'eldest'
  if (country === 'gb' && year < 1917) rule.house = year === 1900 ? 'Hanover' : 'Saxe-Coburg and Gotha'
  return rule
}
export interface RoyalStatus { country: string; house: string; territory: string; title: string; born: number; rank: 'extended' | 'child' | 'heir' | 'ruler'; line: number; maleLine: boolean; status: 'active' | 'former'; reputation: number; duties: number; lastYear: number; predecessorAge: number; parentId: string; allowance: number }
export function royalStatus(g: GameState): RoyalStatus | null { return readRoyal(g.flags.royalty) }
function readRoyal(raw: Json | undefined): RoyalStatus | null {
  const x = rec(raw)
  if (!x || typeof x.country !== 'string' || typeof x.house !== 'string') return null
  return { country: x.country, house: x.house, territory: typeof x.territory === 'string' ? x.territory : '', title: typeof x.title === 'string' ? x.title : 'Royal family member', born: num(x.born),
    rank: x.rank === 'ruler' || x.rank === 'child' || x.rank === 'heir' ? x.rank : 'extended', line: Math.round(clampN(num(x.line, 20), 0, 1000)), maleLine: x.maleLine === true,
    status: x.status === 'former' ? 'former' : 'active', reputation: clampN(num(x.reputation, 60), 0, 100), duties: clampN(num(x.duties), 0, 4), lastYear: num(x.lastYear, -1), predecessorAge: clampN(num(x.predecessorAge, 45), 18, 120), parentId: typeof x.parentId === 'string' ? x.parentId : '', allowance: Math.max(0, num(x.allowance)) }
}
export function royalEligible(r: RoyalStatus, gender: Gender, year: number): boolean {
  const rule = royalRule(r.country, year)
  if (!rule || r.status !== 'active') return false
  if (rule.succession === 'male' || ['sa','ae','my','kw','qa','jo'].includes(r.country)) return gender === 'male' && r.maleLine
  return true
}
function titleFor(country: string, gender: Gender, ruler = false, year = 2026, extended = false): string {
  const male = gender === 'male'
  if (country === 'ae' || country === 'kw' || country === 'qa') return ruler ? country === 'ae' ? 'Ruling Sheikh' : 'Emir' : male ? 'Sheikh' : 'Sheikha'
  if (country === 'jp') return ruler ? 'Emperor' : extended ? male ? 'Ō' : 'Nyoō' : male ? 'Shinnō' : 'Naishinnō'
  if (country === 'cn') return ruler ? 'Emperor' : male ? 'Imperial Prince' : 'Imperial Princess'
  if (country === 'kr') return ruler ? 'Emperor' : male ? 'Hwangja (Imperial Prince)' : 'Hwangnyeo (Imperial Princess)'
  if (country === 'my') return ruler ? 'Sultan of Johor' : 'Tunku'
  if (country === 'ma') return ruler ? year < 1957 ? 'Sultan' : 'King' : male ? 'Moulay' : 'Lalla'
  if (country === 'th') return ruler ? 'King' : extended ? 'Mom Chao' : 'Chao Fa'
  if (country === 'ir') return ruler ? 'Shah' : male ? 'Shahzadeh' : 'Shahdokht'
  if (country === 'ru') return ruler ? 'Emperor' : male ? 'Grand Duke' : 'Grand Duchess'
  if (country === 'jo' && ruler && year < 1946) return 'Emir'
  return ruler ? male ? 'King' : 'Queen' : male ? 'Prince' : 'Princess'
}
export type RoyalBirthChoice = 'random' | 'royal' | 'nonRoyal'

/** Stamp only documented dynastic relatives, not unrelated step-family or adopted children. */
export function markRoyalFamily(g: GameState): void {
  const royal = royalStatus(g)
  const mark = (p: Person, r: RoyalStatus) => {
    p.data.royalHouse = r.house; p.data.royalCountry = r.country; p.data.royalTerritory = r.territory
  }
  if (royal) {
    const father = g.people.find(p => p.id === royal.parentId && p.relation === 'parent' && !p.data.adoptive)
      ?? g.people.find(p => p.relation === 'parent' && !p.data.adoptive && p.data.royalConsort !== true && p.data.royalHouse === royal.house)
    if (father) {
      mark(father, royal)
      for (const p of g.people) {
        if (p.relation === 'parent' && p.id !== father.id && !p.data.adoptive) { mark(p, royal); p.data.royalConsort = true }
        if (p.biological !== false && (p.relation === 'sibling' || p.relation === 'halfSibling' && Array.isArray(p.data.parentIds) && p.data.parentIds.includes(father.id))) mark(p, royal)
      }
    }
  }
  for (const p of g.people) {
    const own = readRoyal(p.data.royalty)
    if (own) mark(p, own)
  }
}

/** Custom lives may choose royalty; random lives retain the rare seeded roll. */
export function initializeRoyalBirth(g: GameState, choice: RoyalBirthChoice = 'random'): boolean {
  const country = g.character.birthCountryId, rule = royalRule(country, g.year)
  if (!rule || choice === 'nonRoyal' || (choice !== 'royal' && !chance(g, .0001))) return false
  const father = g.people.find(p => p.relation === 'parent' && p.gender === 'male' && !p.data.adoptive)
  if (!father) return false
  const direct = chance(g, .12)
  const territories = [['Abu Dhabi','Al Nahyan'],['Dubai','Al Maktoum'],['Sharjah','Al Qasimi'],['Ajman','Al Nuaimi'],['Ras Al Khaimah','Al Qasimi'],['Fujairah','Al Sharqi'],['Umm Al Quwain','Al Mualla']]
  const emirate = territories[randInt(g, 0, territories.length - 1)]
  const siblings = g.people.filter(p => ['sibling','halfSibling'].includes(p.relation) && p.age > 0)
  const ahead = siblings.filter(p => (rule.succession === 'male' || ['sa','ae','my','kw','qa','jo'].includes(country)) ? p.gender === 'male' : rule.succession === 'preference' && g.character.gender === 'male' ? p.gender === 'male' : true)
  const line = direct ? ahead.length + 1 : randInt(g, 12, 60)
  const r: RoyalStatus = { country, house: country === 'ae' ? emirate[1] : rule.house, territory: country === 'ae' ? emirate[0] : country === 'my' ? 'Johor' : '', title: titleFor(country, g.character.gender, false, g.year, !direct), born: g.year,
    rank: direct ? 'child' : 'extended', line, maleLine: true, status: 'active', reputation: 65, duties: 0, lastYear: g.year, predecessorAge: father.age, parentId: father.id, allowance: 0 }
  g.flags.royalty = r as unknown as Json
  father.data.royalHouse = r.house
  father.data.royalRole = direct ? titleFor(country, 'male', true, g.year) : 'Extended dynastic family member'
  if (direct) {
    father.data.royalSovereign = true
    father.data.royalCountry = country
    father.occupation = String(father.data.royalRole)
  }
  markRoyalFamily(g)
  g.flags.royalPrivateHoldings = 'Family property is private; palaces, public funds and sovereign assets are not personal property.'
  log(g, `I was born into ${r.house}${r.territory ? ` of ${r.territory}` : ''}, a ${direct ? 'close' : 'distant'} branch of a ruling family. My title is ${r.title}. This brings duties and expectations, not ownership of the state's wealth.`, 'event')
  return true
}
export function yearlyRoyalty(g: GameState): void {
  const r = royalStatus(g)
  if (!r || !g.character.alive || r.lastYear >= g.year) return
  r.lastYear = g.year; r.allowance = 0
  const rule = royalRule(r.country, g.year)
  if (rule && r.country === 'gb') r.house = rule.house
  if (!rule || (rule.house !== r.house && r.country !== 'ae' && r.country !== 'gb')) {
    if (r.status === 'active') { r.status = 'former'; r.rank = 'extended'; r.line = 0; log(g, 'Our dynasty no longer rules. Official allowances and succession privileges ended; privately owned property remains separate.', 'bad') }
  }
  if (r.country === 'jp' && g.year >= 1947 && g.character.gender === 'female' && g.people.some(p => p.alive && p.relation === 'spouse' && !p.data.royalHouse)) { r.status = 'former'; r.line = 0 }
  if (r.status === 'active' && rule) {
    r.predecessorAge += 1
    const s = seeded(`court|${g.lifeId}|${g.year}`)
    r.reputation = clampN(r.reputation + r.duties * 3 - (g.character.age >= 18 ? 2 : 0) - (g.character.criminalRecord.some(x => x.age === g.character.age - 1 && x.convicted) ? 25 : 0), 0, 100)
    if (g.character.age >= 18 && r.duties > 0 && !g.character.prison && g.character.countryId === r.country) {
      r.allowance = Math.round(typicalIncome(g, r.country) * (r.rank === 'ruler' ? 4 : r.rank === 'extended' ? .5 : 1.5) * Math.min(1, r.duties / 2) * r.reputation / 100)
      addMoney(g, r.allowance)
      log(g, `Royal duties allowance: ${money(r.allowance)} ${r.allowance > 0 ? 'paid for this year’s official work' : 'withheld'}.`)
    }
    const parent = g.people.find(p => p.id === r.parentId)
    if (r.rank === 'child' || r.rank === 'heir') {
      const preference = rule.succession === 'preference' || (r.country === 'gb' && r.born < 2012)
      const ahead = g.people.filter(p => p.alive && p.relation === 'sibling' && p.biological !== false && royalEligible(r, p.gender, g.year) && (preference ? p.gender === 'male' && g.character.gender === 'female' || p.gender === g.character.gender && p.age > g.character.age : p.age > g.character.age))
      r.line = ahead.length + 1
    }
    const vacancy = r.rank === 'child' || r.rank === 'heir' ? parent && !parent.alive : r.predecessorAge > 70 && s.chance(.04)
    if (r.rank !== 'ruler' && vacancy && g.character.age >= 18 && royalEligible(r, g.character.gender, g.year)) {
      const preference = rule.succession === 'preference' || (r.country === 'gb' && r.born < 2012)
      const malePreference = preference && g.character.gender === 'female' && g.people.some(p => p.alive && p.gender === 'male' && p.relation === 'sibling')
      const council = rule.succession === 'council'
      if (r.line <= 1 && !malePreference && (!council || (r.reputation >= 75 && s.chance(.25)))) {
        r.rank = 'ruler'; r.title = titleFor(r.country, g.character.gender, true, g.year)
        log(g, `I was recognized as ${r.title}${r.territory ? ` of ${r.territory}` : ''}. ${rule.system === 'constitutional' ? 'Constitutional limits still bind the crown.' : r.country === 'ae' ? 'Federal leadership is elected separately, not inherited with this emirate.' : 'The court expects careful stewardship.'}`, 'event')
      } else { r.line = Math.max(2, r.line - 1); r.parentId = ''; r.predecessorAge = 45; r.rank = 'extended' }
    }
    for (const child of g.people.filter(p => p.alive && p.relation === 'child' && p.biological !== false)) {
      if (['jp','sa','ae','jo','kw','qa','my'].includes(r.country) && g.character.gender !== 'male') continue
      const birth = g.year - child.age
      if (!royalRule(r.country, birth)) continue
      const previous = readRoyal(child.data.royalty)
      if (previous?.status === 'former') continue
      const eligible = { ...r, maleLine: r.maleLine && g.character.gender === 'male' }
      const preference = rule.succession === 'preference' || (r.country === 'gb' && birth < 2012)
      const ahead = g.people.filter(p => p.relation === 'child' && p.alive && p.biological !== false && royalEligible(eligible, p.gender, g.year) && (preference ? p.gender === 'male' && child.gender === 'female' || p.gender === child.gender && p.age > child.age : p.age > child.age))
      child.data.royalty = { ...r, born: birth, rank: r.rank === 'ruler' ? 'child' : 'extended', title: titleFor(r.country, child.gender, false, birth, r.rank !== 'ruler'), line: r.rank === 'ruler' ? ahead.length + 1 : r.line + 2, parentId: g.character.id, maleLine: eligible.maleLine, allowance: 0, duties: 0 } as unknown as Json
    }
  }
  r.duties = 0; g.flags.royalty = r as unknown as Json
  markRoyalFamily(g)
}
export function inheritRoyalStatus(g: GameState, p: Person): void {
  const r = readRoyal(p.data.royalty)
  if (r) { r.lastYear = g.year - 1; g.flags.royalty = r as unknown as Json }
}
export const royalMenu: MenuNode = { type: 'menu', id: 'royal.court', label: 'Royal Family & Court', emoji: '👑', visible: g => !!royalStatus(g), children: g => {
  const r = royalStatus(g)
  if (!r) return []
  const rule = royalRule(r.country, g.year)
  const rows: MenuNode[] = [{ type: 'info', id: 'royal.profile', emoji: '👑', text: `${r.title} · ${r.house}${r.territory ? `, ${r.territory}` : ''} · ${r.status}. Public reputation ${Math.round(r.reputation)}/100. ${r.status === 'active' ? `${rule?.system ?? ''} monarchy; ${royalEligible(r, g.character.gender, g.year) ? `dynastic position ${r.line}` : 'not eligible for succession under the modeled rules'}.` : 'No sovereign power or official allowance.'} Family estates and state assets are not your bank balance. Fictional branch; succession is not guaranteed.${r.country === 'ae' ? ' Emirate rulership does not automatically confer the elected UAE presidency.' : ''}` }]
  for (const [id,label] of [['charity','Attend a Charity Patronage'],['diplomacy','Represent the Family Diplomatically'],['court','Attend Court & Family Council']] as const) rows.push({ type: 'action', id: `royal.${id}`, label, emoji: '🏛️', disabledReason: gg => { const live = royalStatus(gg); return !live || live.status !== 'active' || gg.character.age < 18 || gg.character.prison || gg.character.countryId !== live.country ? 'Official duties require an adult active royal at home, outside prison.' : null }, run: gg => {
    const live = royalStatus(gg)
    if (!live || live.status !== 'active' || gg.character.age < 18 || gg.character.prison || gg.character.countryId !== live.country || !useYearAction(gg, `royal.${id}`, 1)) return
    live.duties = Math.min(3, live.duties + 1); live.reputation = clampN(live.reputation + 2, 0, 100)
    addStat(gg, 'happiness', -1); addHidden(gg, 'fame', 1); gg.flags.royalty = live as unknown as Json
    notice(gg, label, `You completed a public duty for ${getCountry(live.country).name}. It took time and improved standing. Any official allowance is settled annually, not per click.`)
  } })
  rows.push({ type: 'action', id: 'royal.renounce', label: 'Renounce Official Royal Duties', emoji: '🚪', confirm: () => 'Permanently relinquish official allowances and succession expectations? Private property remains yours.', run: gg => { const live = royalStatus(gg); if (!live || !gg.character.alive || gg.character.age < 18) return; live.status = 'former'; live.line = 0; live.allowance = 0; gg.flags.royalty = live as unknown as Json } })
  return rows
} }
