// Life after sports: coach the next generation (assistant → head coach → national team, or a
// sumo stable elder), or talk about it for a living as a commentator and pundit. Halls of Fame
// call five years after a great career, and the Trophy Cabinet keeps everything you won.
import { addHidden, count, earnIncome, log, scriptChoice, useYearAction } from '../core'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Job, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { addFame, bump, blocked, hire, leave, money, myJob, peek, promote, quitNote, say, short, syncTenure, tell, view } from './common'
import { honor, nationalTeam, plural, playingJob, sportsProfile, tidy, viewSports, wealth, type CareerLine } from './sports-core'

interface CoachJob {
  sport: string
  level: number
  team: string
  seasons: number
  bad: number
}

interface PunditJob {
  sport: string
  bad: number
}

const LEVELS = ['Assistant Coach', 'Head Coach', 'National Team Head Coach']

export function coachJob(g: GameState): Job | null {
  return myJob(g, 'sports.coach')
}

export function punditJob(g: GameState): Job | null {
  return myJob(g, 'sports.pundit')
}

function cj(job: Job): CoachJob {
  return view<CoachJob>(job.data)
}

function pj(job: Job): PunditJob {
  return view<PunditJob>(job.data)
}

/**
 * Every finished sports career, including ones left without a formal retirement (taking
 * another job) and team-sport retirements from older saves.
 */
export function pastCareers(g: GameState): CareerLine[] {
  const list = [...viewSports(g).careers]
  const current = g.character.job
  const has = (sport: string) => list.some((c) => c.sport === sport)
  const ind = peek<{ sports: Record<string, { seasons: number; titles: number; majors: number; startAge: number; retiredAge: number | null }> }>(g, 'sports.ind')
  for (const [id, r] of Object.entries(ind?.sports ?? {})) {
    if (!r || r.seasons <= 0) continue
    if (current?.defId === 'sports.ind' && current.data.sport === id) continue
    const name = id === 'motor' ? 'Motor Racing' : id === 'track' ? 'Track & Field' : id === 'tabletennis' ? 'Table Tennis' : id === 'skating' ? 'Figure Skating' : id === 'ski' ? 'Alpine Skiing' : id === 'surf' ? 'Surfing' : id === 'skate' ? 'Skateboarding' : id[0].toUpperCase() + id.slice(1)
    // A career left without retiring (another job, prison) ended after its last season.
    const to = r.retiredAge ?? Math.max(r.startAge, Math.min(g.character.age, r.startAge + r.seasons))
    if (!has(name)) list.push({ sport: name, kind: 'individual', from: r.startAge, to, best: r.majors ? plural(r.majors, 'major') : plural(r.titles, 'title'), legacy: Math.min(100, r.majors * 9 + r.titles * 1.5) })
  }
  const fight = peek<{ pro: Record<string, { w: number; l: number; d: number }>; startAge: number; retiredAge: number | null; lastFightAge: number }>(g, 'sports.fight')
  for (const [disc, r] of Object.entries(fight?.pro ?? {})) {
    if (!r || r.w + r.l + r.d <= 0) continue
    if (current?.defId === 'sports.fighter' && current.data.disc === disc) continue
    const name = disc === 'mma' ? 'MMA' : disc === 'muaythai' ? 'Muay Thai' : disc[0].toUpperCase() + disc.slice(1)
    const from = fight?.startAge ?? g.character.age
    const last = typeof fight?.lastFightAge === 'number' && fight.lastFightAge >= from ? fight.lastFightAge : g.character.age
    if (!has(name)) list.push({ sport: name, kind: 'combat', from, to: typeof fight?.retiredAge === 'number' ? fight.retiredAge : last, best: `${r.w}-${r.l}${r.d ? `-${r.d}` : ''} record`, legacy: Math.min(100, r.w * 2) })
  }
  const team = peek<{ sport: string | null; retiredAge: number | null; seasons: number; championships: number; peakGreatness: number }>(g, 'athlete')
  if (team && team.retiredAge !== null && team.sport && !list.some((c) => c.kind === 'team')) {
    const name = team.sport === 'football' ? 'American Football' : team.sport[0].toUpperCase() + team.sport.slice(1)
    list.push({ sport: name, kind: 'team', from: team.retiredAge - team.seasons, to: team.retiredAge, best: plural(team.championships, 'championship'), legacy: Math.min(100, team.championships * 10 + Math.max(0, team.peakGreatness - 50)) })
  }
  return list
}

function coachSalary(g: GameState, level: number, legacy: number): number {
  const w = Math.max(0.3, wealth(g))
  const base = level === 2 ? 150_000 + legacy * 20_000 : level === 1 ? 70_000 + legacy * 14_000 : 35_000 + legacy * 1_500
  return tidy(base * w)
}

function teamName(g: GameState, sport: string, level: number): string {
  if (level === 2) return `${nationalTeam(g)} (${sport})`
  if (sport === 'Sumo') return `${pick(g, ['Hanakaze', 'Kurogane', 'Momiji', 'Akatsuki'])}-beya`
  return `${g.character.city} ${pick(g, ['Academy', 'Athletic Club', 'Sports Club', 'High Performance Center'])}`
}

const coachScript = defineScript('sports.legacy.coach', (g, choice) => {
  if (choice === 'cancel') return
  const career = pastCareers(g).find((c) => c.sport === choice)
  if (!career) return
  const level = career.legacy >= 70 ? 1 : 0
  const team = teamName(g, career.sport, level)
  const sumo = career.sport === 'Sumo'
  const title = sumo ? 'Stable Elder (Oyakata)' : `${career.sport} ${LEVELS[level]}`
  const salary = coachSalary(g, level, career.legacy)
  const { quit } = hire(g, { defId: 'sports.coach', title, company: team, salary, level, performance: 60, data: { sport: career.sport, level, team, seasons: 0, bad: 0 } })
  log(g, `I became ${title.toLowerCase()} at ${team}.`, 'good')
  say(g, 'Coaching', `You're now ${sumo ? 'a stable elder' : `the ${LEVELS[level].toLowerCase()}`} at ${team}, earning ${money(salary)} a year. You bought a whistle. You will never take it off.${quitNote(quit)}`, '\u{1F4CB}', 'good')
})

const punditScript = defineScript('sports.legacy.pundit', (g, choice) => {
  if (choice === 'cancel') return
  const career = pastCareers(g).find((c) => c.sport === choice)
  if (!career) return
  const network = `${getCountry(g.character.countryId).demonym} Sports Network`
  const salary = tidy((45_000 + g.character.hidden.fame ** 2 * 150 + career.legacy * 3_000) * Math.max(0.3, wealth(g)))
  const { quit } = hire(g, { defId: 'sports.pundit', title: `${career.sport} Commentator`, company: network, salary, performance: 60, data: { sport: career.sport, bad: 0 } })
  log(g, `I became a ${career.sport.toLowerCase()} commentator on ${network}.`, 'good')
  say(g, 'On Air', `${network} hired you as a ${career.sport.toLowerCase()} commentator for ${money(salary)} a year. Your first broadcast featured you saying "at the end of the day" eleven times.${quitNote(quit)}`, '\u{1F399}\u{FE0F}', 'good')
})

function careerChoices(g: GameState): { id: string; label: string; emoji: string }[] {
  return pastCareers(g).map((c) => ({ id: c.sport, label: `${c.sport} (${c.best})`, emoji: '\u{1F3C5}' }))
}

export const lifeAfterSportsMenu: MenuGroup = {
  type: 'menu',
  id: 'sports.after',
  label: 'Life After Sports',
  emoji: '\u{1F399}\u{FE0F}',
  subtitle: 'Coaching, commentary, comebacks',
  visible: (g) => pastCareers(g).length > 0,
  children: (g): MenuNode[] => {
    const nodes: MenuNode[] = []
    pastCareers(g).forEach((c, i) => nodes.push({ type: 'info', id: `sports.after.c${i}`, emoji: '\u{1F3C5}', text: `${c.sport}: age ${c.from}–${c.to}, ${c.best}${c.legacy >= 65 ? ' · legend' : ''}` }))
    nodes.push(
      {
        type: 'action',
        id: 'sports.after.coach',
        label: 'Become a Coach',
        emoji: '\u{1F4CB}',
        subtitle: 'Teach what you know',
        disabledReason: (gg) => blocked(gg, 22) ?? (coachJob(gg) ? "You're already coaching." : null),
        confirm: (gg) => (gg.character.job ? `Coaching means quitting your job as ${gg.character.job.title}. Continue?` : null),
        run: (gg) => scriptChoice(gg, coachScript, 'Coach Which Sport?', 'Clubs are happy to hire a former pro.', [...careerChoices(gg), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], { emoji: '\u{1F4CB}' }),
      },
      {
        type: 'action',
        id: 'sports.after.pundit',
        label: 'Become a Commentator',
        emoji: '\u{1F399}\u{FE0F}',
        subtitle: 'Get paid to have opinions',
        disabledReason: (gg) => {
          const b = blocked(gg, 22)
          if (b) return b
          if (punditJob(gg)) return "You're already on air."
          const best = Math.max(0, ...pastCareers(gg).map((c) => c.legacy))
          if (gg.character.hidden.fame < 10 && best < 30) return 'Networks only hire famous or decorated former athletes.'
          return null
        },
        confirm: (gg) => (gg.character.job ? `Taking the TV job means quitting your job as ${gg.character.job.title}. Continue?` : null),
        run: (gg) => scriptChoice(gg, punditScript, 'Commentate Which Sport?', 'A sports network wants you in the booth.', [...careerChoices(gg), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], { emoji: '\u{1F399}\u{FE0F}' }),
      },
      { type: 'info', id: 'sports.after.comeback', emoji: '\u{1F504}', text: 'Itching to compete again? Comebacks start from the sport’s own menu (Turn Pro / Try Out), if your body and the rules allow it.' },
    )
    return nodes
  },
}

// ---------------------------------------------------------------------------
// Coach & pundit careers

const talkScript = defineScript('sports.legacy.talk', (g, choice) => {
  const job = coachJob(g)
  if (!job) return
  if (choice === 'inspire') {
    bump(job, randInt(g, 4, 9))
    return say(g, 'Team Talk', 'You gave a speech about heart, sacrifice and believing in each other. Someone shed a single tear. Morale soared.', '\u{1F4E3}', 'good')
  }
  if (choice === 'scream') {
    const ok = chance(g, 0.5)
    bump(job, ok ? 8 : -6)
    return say(g, 'Team Talk', ok ? 'You screamed until a vein popped out of your forehead. It worked. They’re terrified, and winning.' : 'You screamed at the team. The team captain screamed back. It went downhill from there.', '\u{1F92C}', ok ? 'good' : 'bad')
  }
  bump(job, randInt(g, -10, 6))
  addHidden(g, 'notoriety', 2)
  addFame(g, 1)
  say(g, 'Team Talk', 'You threw a folding chair across the locker room. Clip went viral. The league fined you. The players are... motivated?', '\u{1FA91}')
})

const takeScript = defineScript('sports.legacy.take', (g, choice) => {
  const job = punditJob(g)
  if (!job) return
  if (choice === 'outrageous') {
    if (chance(g, 0.15)) {
      log(g, 'I was fired from my TV job over a hot take.', 'bad')
      leave(g, 'fired')
      return say(g, 'Fired', 'Your take that "defense is a myth invented by coaches" got you fired. It also got you three podcast offers.', '\u{1F4FA}', 'bad')
    }
    addFame(g, 3)
    bump(job, 8)
    return say(g, 'Hot Take', 'You declared the league MVP "a fraud wearing a man costume". It was the most-watched segment of the year.', '\u{1F525}', 'good')
  }
  if (choice === 'feud') {
    addFame(g, 2)
    addHidden(g, 'notoriety', 2)
    bump(job, 4)
    return say(g, 'Feud', 'You started a feud with the biggest star in the sport. They called you "washed". Ratings went up 30%.', '\u{1F94A}')
  }
  bump(job, 5)
  say(g, 'Analysis', 'Your calm, thoughtful breakdown was praised by fans and ignored by everyone else.', '\u{1F9E0}', 'good')
})

export function legacyJobNodes(g: GameState): MenuNode[] {
  const coach = coachJob(g)
  if (coach) {
    const d = cj(coach)
    return [
      { type: 'info', id: 'sports.coach.status', emoji: '\u{1F4CB}', text: `${coach.title} · ${coach.company} · ${money(coach.salary)}/yr · performance ${Math.round(coach.performance)}%` },
      {
        type: 'action',
        id: 'sports.coach.practice',
        label: 'Run Practice',
        emoji: '\u{1F3C3}',
        subtitle: 'Drills, film and fitness (once a year)',
        disabledReason: (gg) => blocked(gg, 0),
        run: (gg) => {
          const job = coachJob(gg)
          if (!job) return
          if (!useYearAction(gg, 'sports.coach.practice', 1)) return tell(gg, 'Practice', 'Your players are already sore enough this year.', '\u{1F971}')
          bump(job, randInt(gg, 5, 10))
          say(gg, 'Practice', pick(gg, ['You ran a practice so organized it had color-coded cones.', 'Three hours of film study. Two players fell asleep. One learned something.']), '\u{1F4CB}', 'good')
        },
      },
      {
        type: 'action',
        id: 'sports.coach.talk',
        label: 'Team Talk',
        emoji: '\u{1F4E3}',
        subtitle: 'Fire them up (once a year)',
        disabledReason: (gg) => blocked(gg, 0),
        run: (gg) => {
          if (!useYearAction(gg, 'sports.coach.talk', 1)) return tell(gg, 'Team Talk', 'You’ve given your big speech this year. Encores are cringe.', '\u{1F4E3}')
          scriptChoice(gg, talkScript, 'Team Talk', `Your ${d.sport.toLowerCase()} team is in the locker room. How do you fire them up?`, [{ id: 'inspire', label: 'Inspirational speech', emoji: '\u{1F31F}' }, { id: 'scream', label: 'Scream at them', emoji: '\u{1F92C}' }, { id: 'chair', label: 'Throw a chair', emoji: '\u{1FA91}' }], { emoji: '\u{1F4E3}' })
        },
      },
      {
        type: 'action',
        id: 'sports.coach.resign',
        label: 'Resign',
        emoji: '\u{1F6AA}',
        confirm: () => 'Resign from coaching?',
        run: (gg) => {
          const job = coachJob(gg)
          if (!job) return
          log(gg, `I resigned as ${job.title.toLowerCase()}.`)
          leave(gg, 'quit')
          say(gg, 'Resigned', 'You resigned and handed back the whistle. Okay, you kept the whistle.', '\u{1F6AA}')
        },
      },
    ]
  }
  const pundit = punditJob(g)
  if (pundit) {
    return [
      { type: 'info', id: 'sports.pundit.status', emoji: '\u{1F399}\u{FE0F}', text: `${pundit.title} · ${pundit.company} · ${money(pundit.salary)}/yr · performance ${Math.round(pundit.performance)}%` },
      {
        type: 'action',
        id: 'sports.pundit.take',
        label: 'On-Air Segment',
        emoji: '\u{1F4FA}',
        subtitle: 'Once a year, make it count',
        disabledReason: (gg) => blocked(gg, 0),
        run: (gg) => {
          if (!useYearAction(gg, 'sports.pundit.take', 1)) return tell(gg, 'On Air', 'Your producer says you’ve had your moment this year.', '\u{1F4FA}')
          scriptChoice(gg, takeScript, 'On Air', 'The red light is on. What do you go with?', [{ id: 'analysis', label: 'Calm, smart analysis', emoji: '\u{1F9E0}' }, { id: 'outrageous', label: 'An outrageous hot take', emoji: '\u{1F525}' }, { id: 'feud', label: 'Start a feud with a star', emoji: '\u{1F94A}' }], { emoji: '\u{1F399}\u{FE0F}' })
        },
      },
      {
        type: 'action',
        id: 'sports.pundit.quit',
        label: 'Leave the Network',
        emoji: '\u{1F6AA}',
        confirm: () => 'Leave your commentary job?',
        run: (gg) => {
          log(gg, 'I left my commentary job.')
          leave(gg, 'quit')
          say(gg, 'Signed Off', 'You signed off for the last time. "Back to you in the studio," you said, to nobody.', '\u{1F6AA}')
        },
      },
    ]
  }
  return []
}

export function yearlyLegacy(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  // Halls of Fame (team sports have their own, in the team-sports module).
  const prof0 = peek<{ careers: CareerLine[]; halls: string[] }>(g, 'sports')
  if (prof0 && !c.prison) {
    for (const career of prof0.careers) {
      if (career.kind === 'team' || career.legacy < 65 || c.age - career.to < 5 || prof0.halls.includes(career.sport)) continue
      if (playingJob(g)) continue
      const p = sportsProfile(g)
      p.halls.push(career.sport)
      addFame(g, 8)
      count(g, 'hallOfFame')
      log(g, `I was inducted into the ${career.sport} Hall of Fame.`, 'good')
      honor(g, `Inducted into the ${career.sport} Hall of Fame.`, `${career.sport} Hall of Fame`, '', 10)
      say(g, 'Hall of Fame', `You were inducted into the ${career.sport} Hall of Fame. Your speech ran eleven minutes over and thanked your childhood dog by name.`, '\u{1F3DB}\u{FE0F}', 'good')
      break
    }
  }
  if (c.prison) return
  const coach = coachJob(g)
  if (coach) {
    syncTenure(g, coach)
    const d = cj(coach)
    d.seasons += 1
    earnIncome(g, coach.salary)
    const perf = coach.performance + randInt(g, -15, 15)
    const won = perf >= 85 && chance(g, 0.3 + d.level * 0.05)
    if (won) {
      count(g, 'championships')
      addFame(g, 4)
      honor(g, `Coached ${coach.company} to a championship.`, `Championship-winning ${d.sport.toLowerCase()} coach`, coach.company, 8)
      say(g, 'Champions!', `${coach.company} won it all under your coaching! The players dumped a cooler of ice water on you. In winter.`, '\u{1F3C6}', 'good')
    } else log(g, `My ${coach.company} team had a ${perf >= 70 ? 'strong' : perf >= 45 ? 'middling' : 'rough'} season.`)
    if (perf < 35) d.bad += 1
    else d.bad = 0
    if (d.bad >= 2) {
      log(g, 'I was fired as a coach after two bad seasons.', 'bad')
      leave(g, 'fired')
      return say(g, 'Fired', `${coach.company} fired you after two bad seasons. The fans chanted for it. Some of them made signs.`, '\u{1F6AB}', 'bad')
    }
    const legacy = Math.max(0, ...pastCareers(g).map((x) => x.legacy))
    if (d.level < 2 && (won || (perf >= 80 && d.seasons >= 2 && chance(g, 0.4)))) {
      const next = d.level + 1
      if (next === 2 && legacy < 40 && !won) return
      d.level = next
      d.team = teamName(g, d.sport, next)
      coach.company = d.team
      promote(g, coach, d.sport === 'Sumo' ? coach.title : `${d.sport} ${LEVELS[next]}`, coachSalary(g, next, legacy), next)
      log(g, `I was promoted to ${coach.title.toLowerCase()}.`, 'good')
      say(g, 'Promoted', `You're now ${coach.title.toLowerCase()} at ${coach.company} (${short(coach.salary)}/yr).`, '\u{1F4CB}', 'good')
    }
    coach.performance = Math.max(0, Math.min(100, coach.performance - randInt(g, 0, 6)))
    return
  }
  const pundit = punditJob(g)
  if (pundit) {
    syncTenure(g, pundit)
    const d = pj(pundit)
    earnIncome(g, pundit.salary)
    if (pundit.performance < 30) d.bad += 1
    else d.bad = 0
    if (d.bad >= 2) {
      log(g, 'The network let me go.', 'bad')
      leave(g, 'fired')
      return say(g, 'Cancelled', 'The network replaced you with a younger former player who wears louder suits.', '\u{1F4FA}', 'bad')
    }
    // Star pundits get raises, up to what the network pays its biggest name.
    const ceiling = tidy(1_500_000 * Math.max(0.3, wealth(g)))
    if (pundit.performance >= 80 && pundit.salary < ceiling && chance(g, 0.35)) {
      pundit.salary = Math.min(ceiling, tidy(pundit.salary * 1.25))
      log(g, 'I got a raise at the network.', 'good')
    }
    pundit.performance = Math.max(0, Math.min(100, pundit.performance - randInt(g, 0, 8)))
  }
}

/** Sports › Trophy Cabinet: everything you've won. */
export const trophyCabinetMenu: MenuGroup = {
  type: 'menu',
  id: 'sports.trophies',
  label: 'Trophy Cabinet',
  emoji: '\u{1F3C6}',
  subtitle: (g) => {
    const p = viewSports(g)
    return p.honors.length ? `${plural(p.honors.length, 'honor')}${p.medals.length ? ` · ${plural(p.medals.length, 'Olympic medal')}` : ''}` : 'Empty, for now'
  },
  visible: (g) => viewSports(g).honors.length > 0 || viewSports(g).headTrauma >= 20,
  children: (g): MenuNode[] => {
    const p = viewSports(g)
    const nodes: MenuNode[] = p.honors.slice().reverse().slice(0, 25).map((h, i) => ({ type: 'info' as const, id: `sports.trophies.${i}`, emoji: '\u{1F3C5}', text: h }))
    if (p.halls.length) nodes.push({ type: 'info', id: 'sports.trophies.halls', emoji: '\u{1F3DB}\u{FE0F}', text: `Halls of Fame: ${p.halls.join(', ')}` })
    if (p.headTrauma >= 20) nodes.push({ type: 'info', id: 'sports.trophies.brain', emoji: '\u{1F9E0}', text: `Wear and tear: ${plural(p.concussions, 'concussion')}${p.cte ? ', CTE diagnosis' : p.headTrauma >= 45 ? ', doctors are worried about your brain' : ''}` })
    return nodes.length ? nodes : [{ type: 'info', id: 'sports.trophies.none', emoji: '\u{1F3C6}', text: 'No trophies yet.' }]
  },
}
