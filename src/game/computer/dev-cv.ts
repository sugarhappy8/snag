// CV entries derived from the home-computer state (coding skill and languages, shipped
// projects, ventures and exits, freelance work, contests and certificates), plus the
// "self-taught developer" check careers.ts uses for software/IT jobs.
//
// Light on imports on purpose: cv.ts and careers.ts import this file.
import { genreDef, scopeDef } from '../special/gamedev-data'
import { artSkill, designSkill, gdPeek, type GdCredit } from '../special/gamedev-state'
import type { CvEntry, GameState } from '../types'
import { getCountry } from '../world'
import { getProjectKind, projectDetail, VENTURE_DEFS, ventureUnits } from './dev-kinds'
import { allVentureAssets, between, devState, freelanceRating, money, plural, readVenture, shortCount } from './dev-state'
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
  allVentureAssets(g).forEach((a, i) => {
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
  out.push(...gameCvEntries(g))
  return out
}

/** How impressive a shipped game reads: critics, sales and the size of the game. */
function creditStrength(x: GdCredit): number {
  const sales = x.copies >= 5_000_000 ? 2 : x.copies >= 250_000 ? 1 : 0
  return between(Math.round(x.critic / 14) + sales + (scopeDef(x.scope).index >= 3 ? 1 : 0) + (x.awards.length ? 1 : 0), 2, 10)
}

/** Game Industry entries (ids 'd:dev:gd:'): design and art skills, shipped games, awards, jams. */
export function gameCvEntries(g: GameState): CvEntry[] {
  const p = gdPeek(g)
  if (!p) return []
  const c = g.character
  const out: CvEntry[] = []
  const design = designSkill(g, p)
  const art = artSkill(g, p)
  if (design >= 20) out.push({ id: 'd:dev:gd:design', kind: 'skill', title: 'Game design', org: '', startAge: c.age, detail: `Skill ${design}/100`, strength: between(Math.round(design / 12), 1, 8), embellished: false, tags: ['tech', 'arts'] })
  if (art >= 20) out.push({ id: 'd:dev:gd:art', kind: 'skill', title: 'Digital art & animation', org: '', startAge: c.age, detail: `Skill ${art}/100`, strength: between(Math.round(art / 12), 1, 8), embellished: false, tags: ['arts', 'media'] })
  ;[...p.games]
    .filter((x) => !x.free)
    .sort((a, b) => creditStrength(b) - creditStrength(a) || b.year - a.year)
    .slice(0, 4)
    .forEach((x, i) => {
      out.push({
        id: `d:dev:gd:credit:${i}`,
        kind: 'project',
        title: x.own ? `Released "${x.title}", ${genreDef(x.genre).noun.replace(/^an? /, '')}` : `${x.role} on "${x.title}"`,
        org: x.own ? (x.publisher ? `Published by ${x.publisher}` : 'Self-published') : x.studio,
        startAge: x.age,
        endAge: x.age,
        detail: `Critic score ${x.critic} • ${shortCount(x.copies)} copies${x.awards.length ? ` • ${x.awards[0]}` : ''}`,
        strength: creditStrength(x),
        embellished: false,
        tags: ['tech', 'arts', 'media'],
      })
    })
  p.awards.slice(-4).forEach((a, i) => {
    const worst = /Rusty Cartridge/.test(a)
    out.push({ id: `d:dev:gd:award:${i}`, kind: 'award', title: a.replace(/(: | for ").*$/, ''), org: a.includes('"') ? a.slice(a.indexOf('"')) : '', startAge: c.age, detail: worst ? 'Technically an award' : 'Game industry award', strength: worst ? 1 : /Pixel Crown/.test(a) ? 9 : 6, embellished: false, tags: ['arts', 'media'] })
  })
  if (p.jams >= 3) out.push({ id: 'd:dev:gd:jams', kind: 'activity', title: 'Game jam regular', org: '', startAge: c.age, detail: plural(p.jams, 'jam'), strength: between(2 + Math.floor(p.jams / 5), 2, 5), embellished: false, tags: ['tech', 'arts'] })
  return out
}

/** How much real work you can show an employer: good projects, ventures, exits, freelance, awards, bootcamps. */
export function codingPortfolio(g: GameState): number {
  const s = devState(g)
  const good = Math.min(4, s.projects.filter((p) => p.q >= 50).length)
  const live = allVentureAssets(g).filter((a) => {
    const v = readVenture(g, a)
    return v.type !== 'store' && v.stage === 'live'
  }).length
  const games = Math.min(3, gdPeek(g)?.games.filter((x) => x.own && !x.free && x.critic >= 50).length ?? 0)
  const exits = s.exits.filter((e) => e.type !== 'store').length
  const gigs = (s.freelance.gigs >= 5 ? 1 : 0) + (s.freelance.gigs >= 20 ? 1 : 0)
  const awards = s.awards.filter((a) => a.strength >= 5).length
  const bootcamps = s.certs.filter((x) => x.title.startsWith('Coding bootcamp')).length
  return good + live + games + exits + gigs + awards + bootcamps
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
