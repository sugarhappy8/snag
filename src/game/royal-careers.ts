// Fictional appointments for the game's fictional royal branches, not real officeholders.
// Resolve from durable NPC qualifications so changing a label never grants a degree or money.
import { seeded } from './assets'
import { royalRule } from './royalty'
import type { NpcLife } from './npc-state'
import type { GameState, Person } from './types'

export interface RoyalAppointment { id: string; title: string; employer: string; pay: number }
type Track = 'government' | 'academic' | 'patronage' | 'court'
function track(g: GameState, p: Person): Track {
  return seeded(`royal-career|${g.lifeId.replace(/-g\d+$/, '')}|${p.id}`).pick(['government', 'government', 'academic', 'patronage', 'court'])
}

/** Initial adult backstory only. Never run on load or grant qualifications annually for free. */
export function initializeRoyalEducation(g: GameState, p: Person, l: NpcLife): void {
  if (p.age < 22 || g.year < (p.data.royalCountry === 'ae' ? 1976 : 1950)) return
  const academic = track(g, p) === 'academic'
  l.education = Math.max(l.education, academic && p.age >= 30 && p.stats.smarts >= 70 ? 3 : academic && p.age >= 25 && p.stats.smarts >= 60 ? 2 : 1)
  l.experience = Math.max(0, p.age - (l.education === 3 ? 28 : l.education === 2 ? 24 : 22))
  l.skill = Math.min(85, Math.max(l.skill, p.stats.smarts * .4 + l.experience * .9))
  for (let level = 1; level <= l.education; level++) {
    const degree = `${['', "Bachelor's", "Master's", 'Doctorate'][level]} in ${l.field}`
    if (!l.achievements.includes(degree)) l.achievements.push(degree)
  }
}

export function royalCourtActive(g: GameState, p: Person): boolean {
  const country = typeof p.data.royalCountry === 'string' ? p.data.royalCountry : ''
  const rule = royalRule(country, g.year)
  const personal = p.data.royalty
  return !!rule && typeof p.data.royalHouse === 'string'
    && (rule.house === p.data.royalHouse || country === 'ae' || country === 'gb')
    && !(personal && typeof personal === 'object' && !Array.isArray(personal) && personal.status === 'former')
}

/** Pay is a bounded multiple of local typical income, never access to state assets. */
export function royalAppointment(g: GameState, p: Person, l: NpcLife): RoyalAppointment | null {
  if (!royalCourtActive(g, p)) return null
  const country = String(p.data.royalCountry), rule = royalRule(country, g.year)!
  const house = country === 'gb' ? rule.house : String(p.data.royalHouse)
  const territory = typeof p.data.royalTerritory === 'string' ? p.data.royalTerritory : ''
  const court = `${house} court`, local = territory || 'Emirate'
  const role = (id: string, title: string, employer = court, pay = 1): RoyalAppointment => ({ id, title, employer, pay })
  if (p.age < 18) return role('school', p.age < 5 ? 'Royal Child' : 'Royal Student', 'Royal household education', 0)
  if (l.country !== country) return role('abroad', 'Royal Family Representative Abroad', `${house} private family office`, 0)
  if (p.data.royalSovereign === true) return role('sovereign', String(p.data.royalRole || 'Reigning Monarch'), court, 4)
  if (p.age >= 70) return role('retired', 'Retired Royal Patron', `${house} charitable patronages`, .3)
  if (/University Student/.test(p.occupation)) return role('university', 'University Student (Royal Family)', 'University', 0)
  if (p.age < 22) return role('trainee', 'Royal Household Trainee', court, .5)

  const path = track(g, p)
  if (country === 'ae') {
    // Federal cabinet: 1971; UAE University: 1976; first female cabinet minister: 2004.
    // Earlier lives use local diwan duties, not an anachronistic federal ministry.
    if (path === 'academic' && g.year >= 1976) {
      if (l.education >= 3 && l.experience >= 8 && p.age >= 35 && l.skill >= 50)
        return role('dean', `University Dean of ${l.field}`, 'National university', 2.5)
      if (p.age >= 40 && l.education >= 1 && l.skill >= 40)
        return role('chancellor', 'University Council Chair', 'National university', 2)
      if (l.education >= 2) return role('lecturer', `University Lecturer in ${l.field}`, 'National university', 1.4)
      return role('education', 'Education Foundation Director', `${local} education foundation`, 1.2)
    }
    if (path === 'government' && g.year >= 1971 && (p.gender === 'male' || g.year >= 2004)) {
      const portfolio = l.field === 'Finance' || l.field === 'Mathematics' ? 'Finance' : l.field === 'Medicine' ? 'Health' : l.field === 'Engineering' ? 'Public Works' : l.field === 'Law' ? 'Justice' : l.field === 'Computer Science' && g.year >= 1995 ? 'Technology' : 'Education'
      if (p.age >= 35 && l.education >= 1 && l.experience >= 10 && l.skill >= 40)
        return role('minister', `Minister of ${portfolio}`, `Ministry of ${portfolio}`, 3)
      if (p.age >= 30 && l.education >= 1 && l.experience >= 6)
        return role('undersecretary', `${portfolio} Ministry Undersecretary`, `Ministry of ${portfolio}`, 2)
      return role('ministry-adviser', `${portfolio} Ministry Adviser`, `Ministry of ${portfolio}`, 1.5)
    }
    if (path === 'patronage' || p.data.royalConsort === true)
      return role('foundation', 'Royal Charitable Foundation Chair', `${local} family foundation`, 1)
    if (g.year >= 1971 && p.age >= 35 && l.experience >= 10)
      return role('department', 'Emirate Department Chair', `${local} administration`, 2)
    return role('diwan', p.age >= 30 ? "Ruler's Court Adviser" : 'Diwan Affairs Officer', `${local} ruler's diwan`, 1.3)
  }

  if (country === 'jp') {
    return path === 'academic'
      ? role('culture', 'Imperial Cultural Patron', 'Imperial cultural institutions', .8)
      : role('imperial', p.data.royalConsort === true ? 'Imperial Household Patron' : 'Imperial Family Representative', 'Imperial household', 1)
  }
  // Constitutional crowns do not turn royal relatives into party-political ministers.
  const governingHouse = ['sa', 'qa', 'kw', 'jo', 'ma'].includes(country) || rule.system === 'absolute'
  if (governingHouse && path === 'government' && p.data.royalConsort !== true) {
    if (p.age >= 35 && l.education >= 1 && l.experience >= 10 && l.skill >= 40)
      return role('government', 'Royal Government Adviser', 'Royal government affairs office', 2.5)
    return role('court-affairs', 'Royal Court Affairs Officer', court, 1.3)
  }
  if (path === 'academic') return role('education-patron', 'Royal Education Patron', `${house} education patronages`, .8)
  if (path === 'patronage' || p.data.royalConsort === true)
    return role('charity', p.age >= 30 ? 'Royal Charitable Foundation Chair' : 'Royal Charity Patron', `${house} charitable foundation`, 1)
  return role('duties', p.age >= 30 ? 'Senior Working Royal' : 'Royal Public Duties Representative', court, 1.5)
}

/** Existing study commitments still cost time and tuition; appointments cannot mint degrees. */
export function studyForRoyalCareer(g: GameState, p: Person, l: NpcLife): boolean {
  if (p.age >= 70 || p.data.royalSovereign === true || l.country !== p.data.royalCountry) return false
  if (/University Student/.test(p.occupation)) return true
  if (g.year < (p.data.royalCountry === 'ae' ? 1976 : 1950)) return false
  return (p.age >= 18 && p.age <= 21 && l.education === 0)
    || (track(g, p) === 'academic' && l.education >= 1 && l.education < 3 && p.age < 35 && p.stats.smarts >= 60)
}
