// CV entries derived from the home-computer state (coding skill and languages, shipped
// projects, ventures and exits, freelance work, contests and certificates), plus the
// "self-taught developer" check careers.ts uses for software/IT jobs.
//
// Light on imports on purpose: cv.ts and careers.ts import this file.
import type { CvEntry, GameState } from '../types'
import { getCountry } from '../world'
import { getProjectKind, projectDetail, VENTURE_DEFS, ventureUnits } from './dev-kinds'
import { between, devState, freelanceRating, money, readVenture, ventureAssets } from './dev-state'
import { codingSkill, codingSkillLabel, knownLanguages } from './skills'

function wealth(g: GameState): number {
  return Math.max(0.25, getCountry(g.character.countryId).wealth ?? 1)
}

/** Every CV entry from the computer side (ids start with 'd:dev:'). */
export function devCvEntries(g: GameState): CvEntry[] {
  const c = g.character
  const out: CvEntry[] = []
  const s = devState(g)
  const skill = codingSkill(g)
  if (skill >= 10) {
    const langs = knownLanguages(g).slice(0, 4)
    out.push({
      id: 'd:dev:skill',
      kind: 'skill',
      title: langs.length ? `Programming (${langs.join(', ')})` : 'Programming',
      org: '',
      startAge: c.age,
      detail: `${codingSkillLabel(skill)} · skill ${skill}/100`,
      strength: between(Math.round(skill / 11), 1, 9),
      embellished: false,
      tags: ['tech'],
    })
  }
  ;[...s.projects]
    .filter((p) => p.q >= 40)
    .sort((a, b) => b.q - a.q)
    .slice(0, 3)
    .forEach((p, i) => {
      const kind = getProjectKind(p.kind)
      out.push({
        id: `d:dev:project:${i}`,
        kind: 'project',
        title: kind ? kind.cvTitle(p.name) : p.name,
        org: 'Personal project',
        startAge: p.age,
        endAge: p.age,
        detail: projectDetail(p),
        strength: between(Math.round(p.q / 12) + (p.users >= 50_000 ? 1 : 0), 2, 8),
        embellished: false,
        tags: p.kind === 'game' || p.kind === 'scratch' || p.kind === 'mod' ? ['tech', 'arts'] : ['tech'],
      })
    })
  ventureAssets(g).forEach((a, i) => {
    const v = readVenture(g, a)
    const d = VENTURE_DEFS[v.type]
    const rel = v.revenue / (40_000 * wealth(g))
    const strength = v.stage === 'building' ? 3 : between(4 + (rel >= 0.25 ? 1 : 0) + (rel >= 1 ? 1 : 0) + (rel >= 5 ? 1 : 0) + (rel >= 25 ? 1 : 0), 3, 9)
    const numbers = v.stage === 'building' ? 'in development' : `${ventureUnits(v, v.users)}${v.type === 'saas' ? ` • ${money(v.mrr)} MRR` : v.revenue > 0 ? ` • ${money(v.revenue)} a year` : ''}`
    out.push({
      id: `d:dev:venture:${i}`,
      kind: 'experience',
      title: v.cofounder ? 'Co-founder' : 'Founder',
      org: a.name,
      startAge: a.purchasedAge,
      detail: `${d.label} • ${numbers}`,
      strength,
      embellished: false,
      tags: v.type === 'store' ? ['business'] : ['tech', 'business'],
    })
  })
  s.exits.forEach((e, i) => {
    const rel = e.amount / (100_000 * wealth(g))
    out.push({
      id: `d:dev:exit:${i}`,
      kind: 'experience',
      title: 'Founder (acquired)',
      org: e.name,
      startAge: e.age,
      endAge: e.age,
      detail: `Sold to ${e.buyer} for ${money(e.amount)}`,
      strength: between(6 + (rel >= 1 ? 1 : 0) + (rel >= 10 ? 1 : 0) + (rel >= 100 ? 1 : 0), 6, 9),
      embellished: false,
      tags: e.type === 'store' ? ['business'] : ['tech', 'business'],
    })
  })
  const f = s.freelance
  if (f.gigs >= 3) {
    const r = freelanceRating(s)
    out.push({
      id: 'd:dev:freelance',
      kind: 'experience',
      title: 'Freelance developer',
      org: 'Self-employed',
      startAge: f.firstAge || c.age,
      ...(f.lastAge < c.age - 1 ? { endAge: f.lastAge } : {}),
      detail: `${f.gigs} client jobs${r > 0 ? ` • ${r.toFixed(1)}★ average` : ''}`,
      strength: between(Math.round(2 + f.gigs / 8 + (r > 0 ? r - 3.5 : 0)), 2, 7),
      embellished: false,
      tags: ['tech'],
    })
  }
  s.awards.forEach((a, i) => {
    out.push({ id: `d:dev:award:${i}`, kind: 'award', title: a.title, org: a.org, startAge: a.age, endAge: a.age, detail: a.detail, strength: a.strength, embellished: false, tags: ['tech'] })
  })
  s.certs.forEach((a, i) => {
    out.push({ id: `d:dev:cert:${i}`, kind: 'certification', title: a.title, org: a.org, startAge: a.age, endAge: a.age, detail: a.title.startsWith('Coding bootcamp') ? 'Twelve-week intensive program' : 'Completed', strength: a.strength, embellished: false, tags: ['tech'] })
  })
  return out
}

/** How much real work you can show an employer: good projects, ventures, exits, freelance, awards, bootcamps. */
export function codingPortfolio(g: GameState): number {
  const s = devState(g)
  const good = Math.min(4, s.projects.filter((p) => p.q >= 50).length)
  const live = ventureAssets(g).filter((a) => {
    const v = readVenture(g, a)
    return v.type !== 'store' && v.stage === 'live'
  }).length
  const exits = s.exits.filter((e) => e.type !== 'store').length
  const gigs = (s.freelance.gigs >= 5 ? 1 : 0) + (s.freelance.gigs >= 20 ? 1 : 0)
  const awards = s.awards.filter((a) => a.strength >= 5).length
  const bootcamps = s.certs.filter((x) => x.title.startsWith('Coding bootcamp')).length
  return good + live + exits + gigs + awards + bootcamps
}

/**
 * Self-taught developers: strong coding skill plus a portfolio stand in for the degree on
 * software/IT jobs (the age and every other requirement still apply).
 */
export function selfTaughtDev(g: GameState, def: { industry: string; edu: string }): boolean {
  if (def.industry !== 'tech') return false
  if (!['none', 'highschool', 'community', 'bachelor'].includes(def.edu)) return false
  const skill = codingSkill(g)
  const portfolio = codingPortfolio(g)
  return (skill >= 60 && portfolio >= 2) || (skill >= 75 && portfolio >= 1)
}

export const SELF_TAUGHT_NOTE = 'Self-taught? Coding skill 60+ and a portfolio count too'
