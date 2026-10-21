// Professional sumo (Japan): join a stable (heya), take a ring name (shikona), climb the banzuke
// from Jonokuchi to Yokozuna through six tournaments (basho) a year, chase winning records
// (kachi-koshi), tournament titles (yusho), Ozeki and Yokozuna promotions, and kensho envelopes.
// Men only, in Japan, starting young, exactly like the real thing.
import { addHidden, addStat, count, earnIncome, log, scriptChoice, useYearAction } from '../core'
import { chance, pick, randInt } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import { bodyCeiling, masterFirstTime, masteryCap } from '../mastery'
import { hasMainCharacter, hasTalent, talentMult } from '../talents'
import type { GameState, Job, Json, MenuGroup, MenuNode } from '../types'
import { addFame, attendedUniversity, fameToward, hire, leave, myJob, peek, prof, quitNote, say, short, syncTenure, tell, view } from './common'
import { addBuzz, addHeadTrauma, honor, injure, logistic, recordCareer, sportsGate, tidy, trainGain } from './sports-core'

const DIVS = ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Maegashira', 'Komusubi', 'Sekiwake', 'Ozeki', 'Yokozuna']
const DIV_SIZE = [30, 100, 90, 60, 14, 17, 1, 1, 1, 1]
const DIV_LEVEL = [18, 28, 38, 50, 60, 68, 75, 78, 82, 87]
const STEP = [8, 15, 12, 6, 1.2, 1.2, 1, 1, 1, 1]
const BASHO = ['Hatsu (January)', 'Haru (March)', 'Natsu (May)', 'Nagoya (July)', 'Aki (September)', 'Kyushu (November)']
/** Yearly pay by division (dollars): unsalaried apprentices get a small allowance. */
const PAY = [6_000, 6_000, 7_000, 9_000, 110_000, 170_000, 230_000, 230_000, 310_000, 400_000]
const SKILLS = ['Pushing', 'Belt Technique', 'Throws', 'Strength']

interface SumoProfile {
  skills: Record<string, number>
  weight: number
  yusho: number
  bestDiv: number
  bashoCount: number
  wins: number
  losses: number
  startAge: number
  retiredAge: number | null
  shikona: string
}

interface SumoJob {
  stable: string
  shikona: string
  div: number
  num: number
  recent: number[]
  ozekiLosing: number
  yushoStreak: number
  kyujo: number
  lines: string[]
}

const initSumo = (g: GameState): SumoProfile => ({
  skills: Object.fromEntries(SKILLS.map((s) => [s, Math.max(10, Math.min(55, Math.round(g.character.hidden.athleticism * 0.35 + 10 + randInt(g, 0, 10))))])),
  weight: randInt(g, 85, 115),
  yusho: 0,
  bestDiv: 0,
  bashoCount: 0,
  wins: 0,
  losses: 0,
  startAge: g.character.age,
  retiredAge: null,
  shikona: '',
})

function sumoProfile(g: GameState): SumoProfile {
  const p = prof(g, 'sports.sumo', initSumo)
  // Main Character Syndrome: the first morning at the stable, the technique is already at the body's
  // ceiling for the age (and follows it down later). Weight, the banzuke and the bouts are still earned.
  if (hasMainCharacter(g)) {
    masterFirstTime(g, 'sport.sumo', 'sport', 'sumo')
    const top = bodyCeiling(g, { peakEnd: 30 })
    for (const s of SKILLS) p.skills[s] = top
  }
  return p
}

function viewSumo(g: GameState): SumoProfile | null {
  return peek<SumoProfile>(g, 'sports.sumo')
}

export function sumoJob(g: GameState): Job | null {
  return myJob(g, 'sports.sumo')
}

function sj(job: Job): SumoJob {
  return view<SumoJob>(job.data)
}

function rankName(div: number, num: number): string {
  if (div >= 6) return DIVS[div]
  return `${DIVS[div]} ${Math.max(1, Math.round(num))}`
}

function sumoRating(g: GameState, p: SumoProfile): number {
  const vals = SKILLS.map((s) => p.skills[s] ?? 0)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const weightBonus = Math.max(-6, Math.min(8, (p.weight - 110) / 7))
  let r = avg * 0.75 + g.character.hidden.athleticism * 0.15 + weightBonus + (hasTalent(g, 'Athletics') ? 5 : 0)
  if (g.character.stats.health < 50) r -= (50 - g.character.stats.health) / 5
  // Main Character Syndrome: technique is instant, the level against the stable takes years.
  return Math.max(1, Math.min(99, masteryCap(g, 'sport.sumo'), Math.round(r)))
}

// ---------------------------------------------------------------------------
// Joining a stable

const STABLES = ['Hanakaze-beya', 'Tsurugidake-beya', 'Shiokaze-beya', 'Kumoiwa-beya', 'Akatsuki-beya', 'Harusame-beya', 'Kurogane-beya', 'Momiji-beya']
const PRE = ['Taka', 'Waka', 'Kiri', 'Haru', 'Asa', 'Hoku', 'Tama', 'Koto', 'Toki', 'Ura', 'Kai', 'Mitake', 'Ryu', 'Kotoba', 'Shiro']
const POST = ['nofuji', 'ryu', 'umi', 'yama', 'nosato', 'zakura', 'hikari', 'shio', 'kaze', 'nishiki', 'ishiki', 'dake', 'nami']

interface JoinData {
  stable: string
  names: string[]
}

export function sumoReason(g: GameState): string | null {
  const gate = sportsGate(g, 15)
  if (gate) return gate
  const c = g.character
  if (c.gender !== 'male') return 'Professional sumo is men-only. (Amateur women’s sumo exists, but there’s no pro career in it.)'
  if (c.countryId !== 'jp') return 'Professional sumo is only in Japan. Move there and a stable might take you in.'
  if (sumoJob(g)) return "You're already a rikishi."
  const p = viewSumo(g)
  if (p && p.retiredAge !== null) return 'Retired rikishi cannot return to the ring. The topknot is gone.'
  const maxAge = attendedUniversity(g) ? 25 : 22
  if (c.age > maxAge) return `New recruits must be ${maxAge} or younger${maxAge === 22 ? ' (25 with a university background)' : ''}.`
  if (c.stats.health < 40) return 'The stable doctor took one look at you and said no.'
  return null
}

const joinScript = defineScript('sports.sumo.join', (g, choice, data) => {
  const d = data as unknown as JoinData
  if (!d || choice === 'cancel') return
  const shikona = d.names.includes(choice) ? choice : d.names[0]
  const p = sumoProfile(g)
  p.shikona = shikona
  p.retiredAge = null
  const { quit } = hire(g, {
    defId: 'sports.sumo',
    title: 'Sumo Wrestler',
    company: d.stable,
    salary: PAY[0],
    data: { stable: d.stable, shikona, div: 0, num: randInt(g, 15, 30), recent: [], ozekiLosing: 0, yushoStreak: 0, kyujo: 0, lines: [] },
  })
  addStat(g, 'happiness', 6)
  log(g, `I joined ${d.stable} and became the sumo wrestler ${shikona}.`, 'good')
  say(g, 'Welcome to the Stable', `You moved into ${d.stable}. Your ring name is ${shikona}. Your day: practice at dawn, cook chanko for the senior wrestlers, eat enormous amounts, nap, repeat. You start at the bottom of the banzuke: ${rankName(0, 20)}.${quitNote(quit)}`, '\u{1F3EF}', 'good')
})

// ---------------------------------------------------------------------------
// Actions

const keikoScript = defineScript('sports.sumo.keiko', (g, choice) => {
  if (!SKILLS.includes(choice)) return
  if (!sumoJob(g)) return
  if (!useYearAction(g, `sports.sumo.keiko.${choice}`, 1)) return tell(g, 'Keiko', `You already drilled ${choice.toLowerCase()} until dawn this year.`, '\u{1F971}')
  const p = sumoProfile(g)
  const gain = trainGain(g, p.skills[choice] ?? 0, 3, 7, (g.character.age < 24 ? 1.2 : 1) * talentMult(g, 'Athletics', 1.5))
  p.skills[choice] = Math.min(100, (p.skills[choice] ?? 0) + gain)
  addHidden(g, 'discipline', 1)
  log(g, `I practiced ${choice.toLowerCase()} at morning keiko.`)
  say(g, 'Keiko', `${pickLine(g, ['Shiko leg-stomps for an hour, then butsukari-geiko until you could not see straight.', 'The stablemaster hit you with a bamboo stick for "encouragement".', 'You hit the teppo pole so many times it has a dent shaped like you.'])} ${choice}: ${p.skills[choice]}%.`, '\u{1F3EF}', 'good')
})

const SUMO_INJ = ['Torn Knee Ligament', 'Dislocated Shoulder', 'Bad Back', 'Torn Bicep']

export function sumoJobNodes(g: GameState): MenuNode[] {
  const job = sumoJob(g)
  if (!job) return []
  const d = sj(job)
  const p = viewSumo(g)
  return [
    { type: 'info', id: 'sports.sumo.status', emoji: '\u{1F3EF}', text: `${d.shikona} · ${rankName(d.div, d.num)} · ${d.stable}${p ? ` · ${p.weight} kg · ${p.wins}-${p.losses} career` : ''}${d.kyujo > 0 ? ' · INJURED (kyujo)' : ''}` },
    {
      type: 'action',
      id: 'sports.sumo.keiko',
      label: 'Keiko (Practice)',
      emoji: '\u{1F94B}',
      subtitle: 'Each technique once a year',
      disabledReason: (gg) => sportsGate(gg, 0),
      run: (gg) => {
        const pp = viewSumo(gg)
        scriptChoice(gg, keikoScript, 'Morning Keiko', 'What does the stablemaster drill you on today?', SKILLS.map((s) => ({ id: s, label: `${s} (${pp?.skills[s] ?? 0}%)`, emoji: '\u{1F94B}' })), { emoji: '\u{1F3EF}' })
      },
    },
    {
      type: 'action',
      id: 'sports.sumo.chanko',
      label: 'Eat Chanko-Nabe',
      emoji: '\u{1F372}',
      subtitle: 'Put on weight (once a year)',
      disabledReason: (gg) => sportsGate(gg, 0),
      run: (gg) => {
        if (!useYearAction(gg, 'sports.sumo.chanko', 1)) return tell(gg, 'Chanko', 'Even you cannot eat any more chanko this year. The pot is empty and so is your will.', '\u{1F372}')
        const pp = sumoProfile(gg)
        const gain = pp.weight >= 175 ? randInt(gg, 0, 3) : randInt(gg, 5, 10)
        pp.weight = Math.min(200, pp.weight + gain)
        addStat(gg, 'happiness', 3)
        addStat(gg, 'health', pp.weight > 165 ? -4 : -1)
        log(gg, `I ate my way to ${pp.weight} kg.`)
        say(gg, 'Chanko-Nabe', `Four bowls of rice, a hot pot the size of a bathtub, and a nap. You now weigh ${pp.weight} kg.${pp.weight > 165 ? ' Your knees have started writing complaint letters.' : ''}`, '\u{1F372}')
      },
    },
    {
      type: 'menu',
      id: 'sports.sumo.banzuke',
      label: 'Banzuke & Record',
      emoji: '\u{1F4DC}',
      subtitle: rankName(d.div, d.num),
      children: (gg): MenuNode[] => {
        const pp = viewSumo(gg)
        const nodes: MenuNode[] = [{ type: 'info', id: 'sports.sumo.b.rank', emoji: '\u{1F4DC}', text: `${rankName(d.div, d.num)} · level ${pp ? sumoRating(gg, pp) : 0}/100` }]
        if (pp) {
          nodes.push({ type: 'info', id: 'sports.sumo.b.skills', emoji: '\u{1F94B}', text: SKILLS.map((s) => `${s} ${pp.skills[s] ?? 0}`).join(' · ') })
          nodes.push({ type: 'info', id: 'sports.sumo.b.career', emoji: '\u{1F3C6}', text: `${pp.bashoCount} basho · ${pp.wins}-${pp.losses} · ${pp.yusho} yusho · highest rank ${DIVS[pp.bestDiv]}` })
        }
        d.lines.slice(-6).forEach((l, i) => nodes.push({ type: 'info', id: `sports.sumo.b.l${i}`, emoji: '\u{1F4C5}', text: l }))
        return nodes
      },
    },
    {
      type: 'action',
      id: 'sports.sumo.retire',
      label: 'Retire (Intai)',
      emoji: '\u{2702}\u{FE0F}',
      subtitle: 'Cut the topknot',
      confirm: () => 'Retire from sumo? There is no coming back.',
      run: (gg) => retireSumo(gg, false),
    },
  ]
}

function retireSumo(g: GameState, forced: boolean): void {
  const job = sumoJob(g)
  if (!job) return
  const d = sj(job)
  const p = sumoProfile(g)
  p.retiredAge = g.character.age
  const legacy = Math.min(100, p.bestDiv * 8 + p.yusho * 8)
  recordCareer(g, { sport: 'Sumo', kind: 'combat', from: p.startAge, best: DIVS[p.bestDiv], legacy })
  leave(g, 'retired')
  log(g, `I retired from sumo as ${rankName(d.div, d.num)}.`, 'event')
  say(g, 'Danpatsu-shiki', `${forced ? 'Your body could not take another basho. ' : ''}At your retirement ceremony, ${p.bestDiv >= 5 ? 'hundreds of guests' : 'your stablemates'} each snipped a lock of your hair before the stablemaster cut off your topknot. ${d.shikona} retired with ${p.wins} wins, ${p.yusho} yusho, and a highest rank of ${DIVS[p.bestDiv]}.${p.bestDiv >= 6 ? ' As a former sanyaku wrestler, you can become a stable elder (coach).' : ''}`, '\u{2702}\u{FE0F}', 'good')
}

// ---------------------------------------------------------------------------
// The six tournaments (yearly)

function runBasho(g: GameState, job: Job, p: SumoProfile, name: string): { line: string; pay: number } {
  const d = sj(job)
  const div = d.div
  const bouts = div <= 3 ? 7 : 15
  if (d.kyujo > 0) {
    d.kyujo -= 1
    const line = `${name}: kyujo (injured) at ${rankName(div, d.num)}`
    // Sitting out costs you rank.
    if (div < 8) moveDown(d, Math.ceil(bouts / 2))
    else if (div === 8) {
      d.ozekiLosing += 1
      if (d.ozekiLosing >= 2) {
        d.div = 7
        d.ozekiLosing = 0
      }
    }
    return { line, pay: PAY[div] / 6 }
  }
  const r = sumoRating(g, p)
  const lvl = DIV_LEVEL[div] + (1 - Math.min(1, d.num / DIV_SIZE[div])) * 4
  let wins = 0
  for (let i = 0; i < bouts; i++) if (chance(g, logistic((r - lvl + randInt(g, -4, 4)) / 7))) wins += 1
  const losses = bouts - wins
  p.wins += wins
  p.losses += losses
  p.bashoCount += 1
  const notes: string[] = []
  let pay = PAY[div] / 6
  // Tournament title.
  const yusho = bouts === 7 ? wins === 7 && chance(g, 0.6) : wins >= 14 || (wins === 13 && chance(g, 0.7)) || (wins === 12 && chance(g, 0.3))
  if (yusho) {
    p.yusho += 1
    notes.push('YUSHO!')
    const prize = div >= 5 ? 75_000 : div === 4 ? 15_000 : 3_000
    pay += prize
    count(g, 'championships')
    addFame(g, div >= 5 ? 8 : 2)
    addBuzz(g, div >= 5 ? 20 : 5)
    if (div >= 5) honor(g, `Won the ${name.split(' ')[0]} basho makuuchi championship.`, 'Makuuchi tournament champion (sumo)', 'Japan Sumo', 9)
    else log(g, `I won the ${DIVS[div]} division championship.`, 'good')
  }
  if (div >= 5 && div <= 7 && wins >= 11) {
    pay += 15_000
    notes.push('special prize')
  }
  // Kensho envelopes for top-division wins (more for stars).
  if (div >= 5) pay += wins * (300 + g.character.hidden.fame * 25)
  d.recent.push(wins)
  if (d.recent.length > 3) d.recent.shift()
  const line0 = `${name}: ${wins}-${losses} at ${rankName(div, d.num)}`
  const before = div
  promote(g, d, wins, losses, yusho)
  if (d.div > before) notes.push(`promoted to ${DIVS[d.div]}!`)
  else if (d.div < before) notes.push(`demoted to ${DIVS[d.div]}`)
  if (chance(g, 0.04 + (p.weight > 170 ? 0.04 : 0))) {
    const inj = pick(g, SUMO_INJ)
    injure(g, inj, randInt(g, 10, 22))
    d.kyujo = 1
    notes.push(`injured (${inj.toLowerCase()})`)
  }
  addHeadTrauma(g, 0.2)
  return { line: notes.length ? `${line0} · ${notes.join(' · ')}` : line0, pay }
}

function moveDown(d: SumoJob, net: number): void {
  if (d.div >= 6) {
    d.div = 5
    d.num = 2 + net
    return
  }
  d.num += net * STEP[d.div]
  while (d.div > 0 && d.num > DIV_SIZE[d.div]) {
    const over = d.num - DIV_SIZE[d.div]
    d.div -= 1
    d.num = Math.min(DIV_SIZE[d.div], 1 + over)
  }
  d.num = Math.min(DIV_SIZE[d.div], Math.max(1, d.num))
}

function promote(g: GameState, d: SumoJob, wins: number, losses: number, yusho: boolean): void {
  const net = wins - losses
  if (d.div === 9) {
    // Yokozuna are never demoted; they are expected to retire instead.
    d.ozekiLosing = net < 0 ? d.ozekiLosing + 1 : 0
    return
  }
  if (d.div === 8) {
    if (net < 0) {
      d.ozekiLosing += 1
      if (d.ozekiLosing >= 2) {
        d.div = 7
        d.ozekiLosing = 0
        d.yushoStreak = 0
        log(g, 'I lost my Ozeki rank after two losing tournaments.', 'bad')
      }
    } else d.ozekiLosing = 0
    d.yushoStreak = yusho ? d.yushoStreak + 1 : wins >= 13 ? d.yushoStreak : 0
    if (d.yushoStreak >= 2) {
      d.div = 9
      d.yushoStreak = 0
      addFame(g, 15)
      honor(g, 'Promoted to Yokozuna, the grand champion of sumo.', 'Sumo Yokozuna (grand champion)', 'Japan Sumo', 10)
    }
    return
  }
  if (d.div === 6 || d.div === 7) {
    const sum = d.recent.reduce((a, b) => a + b, 0)
    if (d.recent.length === 3 && sum >= 33 && wins >= 10 && d.div === 7) {
      d.div = 8
      d.recent = []
      addFame(g, 8)
      honor(g, 'Promoted to Ozeki.', 'Sumo Ozeki', 'Japan Sumo', 9)
      return
    }
    if (d.div === 6 && wins >= 10) d.div = 7
    else if (net < 0) {
      if (d.div === 7 && net >= -1) d.div = 6
      else {
        d.div = 5
        d.num = Math.min(10, 1 + Math.abs(net) * 2)
      }
    }
    return
  }
  // Numbered divisions: lower is better.
  if (net >= 0) {
    d.num -= Math.max(net, 0.5) * STEP[d.div]
    if (d.div === 3 && (d.num < 1 || (yusho && d.num <= 15))) {
      d.div = 4
      d.num = 12 + randInt(g, 0, 2)
      honor(g, 'Reached Juryo: a salaried sekitori.', 'Sumo sekitori (Juryo)', 'Japan Sumo', 6)
      return
    }
    if (d.div === 5 && d.num < 1) {
      d.div = net >= 3 ? 7 : 6
      return
    }
    while (d.num < 1 && d.div < 5) {
      const under = 1 - d.num
      d.div += 1
      d.num = Math.max(1, DIV_SIZE[d.div] - under)
      if (d.div === 4) d.num = Math.max(10, d.num)
    }
    d.num = Math.max(1, d.num)
  } else moveDown(d, -net)
}

export function yearlySumo(g: GameState): void {
  const c = g.character
  if (!c.alive || c.prison) return
  const job = sumoJob(g)
  if (!job) return
  syncTenure(g, job)
  const d = sj(job)
  const p = sumoProfile(g)
  const lines: string[] = []
  let pay = 0
  for (const b of BASHO) {
    const r = runBasho(g, job, p, b)
    lines.push(r.line)
    pay += r.pay
  }
  pay = tidy(pay)
  earnIncome(g, pay)
  job.salary = pay
  job.title = `Sumo Wrestler (${DIVS[d.div]})`
  p.bestDiv = Math.max(p.bestDiv, d.div)
  d.lines = lines
  fameToward(g, d.div >= 9 ? 85 : d.div >= 8 ? 65 : d.div >= 5 ? 35 : d.div >= 4 ? 15 : 3, 6)
  // Skills settle; age bites after 30; weight helps until it hurts.
  for (const s of SKILLS) {
    if (hasMainCharacter(g)) break
    const delta = c.age < 24 ? randInt(g, 1, 2) : c.age > 30 ? -randInt(g, 1, 2) - Math.floor((c.age - 30) / 3) : 0
    p.skills[s] = Math.max(1, Math.min(100, (p.skills[s] ?? 0) + delta))
  }
  if (p.weight > 165) addStat(g, 'health', -2)
  log(g, `My sumo year: ${lines.map((l) => l.split(':')[1]?.trim().split(' at ')[0]).join(', ')}. Now ${rankName(d.div, d.num)}.`, 'neutral')
  say(g, 'Sumo Year', `${lines.join('\n')}\n\nYou are now ${rankName(d.div, d.num)}. Earnings: ${short(pay)}.`, '\u{1F3EF}', d.div >= 5 ? 'good' : 'neutral')
  // Yokozuna under pressure, or a body that has had enough.
  if ((d.div === 9 && d.ozekiLosing >= 2) || c.age >= 38 || (c.age >= 33 && d.div <= 2)) {
    scriptChoice(
      g,
      retireAsk,
      'Intai?',
      d.div === 9 ? 'The Yokozuna Deliberation Council issued an "encouragement". It reads a lot like "retire".' : `You're ${c.age}. Younger wrestlers keep pushing you out of the ring.`,
      [
        { id: 'retire', label: 'Retire', emoji: '\u{2702}\u{FE0F}' },
        { id: 'stay', label: 'Keep wrestling', emoji: '\u{1F4AA}' },
      ],
      { emoji: '\u{1F3EF}' },
    )
  }
}

const retireAsk = defineScript('sports.sumo.retireAsk', (g, choice) => {
  if (choice === 'retire') retireSumo(g, false)
})

export const sumoMenu: MenuGroup = {
  type: 'menu',
  id: 'sports.sumo',
  label: 'Sumo',
  emoji: '\u{1F3EF}',
  subtitle: (g) => {
    const job = sumoJob(g)
    if (job) return `${sj(job).shikona} · ${rankName(sj(job).div, sj(job).num)}`
    return g.character.countryId === 'jp' ? "Japan's national sport" : 'Professional sumo is only in Japan'
  },
  header: () => 'Six tournaments a year. Win more than you lose (kachi-koshi) to climb from Jonokuchi through Juryo (salaried) and Maegashira to Ozeki and Yokozuna. Men only, recruits under 23, in Japan.',
  children: (g): MenuNode[] => {
    const job = sumoJob(g)
    if (job) return [{ type: 'info', id: 'sports.sumo.in', emoji: '\u{1F3EF}', text: "You're a rikishi. Manage your career from Occupation › My Work." }]
    const nodes: MenuNode[] = [
      {
        type: 'action',
        id: 'sports.sumo.join',
        label: 'Join a Stable',
        emoji: '\u{1F3EF}',
        subtitle: 'Become an apprentice rikishi',
        disabledReason: sumoReason,
        confirm: (gg) => (gg.character.job ? `Joining a stable means quitting your job as ${gg.character.job.title}. Continue?` : null),
        run: (gg) => inviteToStable(gg, ''),
      },
    ]
    const p = viewSumo(g)
    if (p && p.bashoCount > 0) nodes.push({ type: 'info', id: 'sports.sumo.past', emoji: '\u{1F4DC}', text: `${p.shikona}: ${p.wins}-${p.losses}, ${p.yusho} yusho, highest rank ${DIVS[p.bestDiv]}` })
    return nodes
  },
}

/** A stable offers to take you in (from the menu, or a scout who saw you in junior sumo). */
export function inviteToStable(g: GameState, intro: string): void {
  const stable = pick(g, STABLES)
  const names = [0, 1, 2].map(() => `${pick(g, PRE)}${pick(g, POST)}`)
  scriptChoice(g, joinScript, stable, `${intro}The master of ${stable} agreed to take you in. He offers you a ring name (shikona):`, [...names.map((n) => ({ id: n, label: n, emoji: '\u{1F3EF}' })), { id: 'cancel', label: 'Not now', emoji: '\u{274C}' }], { emoji: '\u{1F3EF}', data: { stable, names } as unknown as Json })
}
/** Highest rank reached (for coaching as a stable elder). */
export function sumoBestDiv(g: GameState): number {
  return viewSumo(g)?.bestDiv ?? 0
}
