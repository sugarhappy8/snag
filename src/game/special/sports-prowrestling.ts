// Pro wrestling entertainment: wrestling school → the indie circuit (lucha libre in Mexico) →
// a tryout with Colossus Wrestling Entertainment (CWE) → the Proving Grounds (developmental) →
// the main roster. Pick a ring name and a side (babyface or heel), cut promos, steal shows with
// risky high spots, feud, win titles, headline Colossal Clash, sell merch, and try not to get
// fired for going off-script. The outcomes are scripted; the bumps are real.
import { addHidden, count, earnIncome, log, scriptChoice, useYearAction } from '../core'
import { chance, pick, rand, randInt } from '../rng'
import { defineScript } from '../scripts'
import { ageCeiling, bodyCeiling, masterFirstTime, masteryCap } from '../mastery'
import { hasMainCharacter, hasTalent, talentMult } from '../talents'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry, randomCity } from '../world'
import { addFame, fameToward, hire, leave, money, myJob, peek, prof, quitNote, say, short, syncTenure, tell, view } from './common'
import { addBuzz, addHeadTrauma, honor, injure, localFee, payFee, payerNote, plural, recordCareer, sportsGate, tidy, trainGain, wealth, worldAthlete } from './sports-core'

type Align = 'face' | 'heel'

interface WrestleProfile {
  inRing: number
  mic: number
  popularity: number
  align: Align
  ringName: string
  schooled: boolean
  titles: string[]
  matches: number
  fiveStars: number
  startAge: number
  retiredAge: number | null
  mask: boolean
  lastTurnAge: number
}

interface WrestleJob {
  tier: number
  promotion: string
  push: number
  belt: string
  feud: string
  contractYears: number
  earned: number
  matchesThisYear: number
}

const TIERS = ['Indie Circuit', 'CWE Proving Grounds', 'CWE Main Roster']

const initWrestle = (g: GameState): WrestleProfile => ({
  inRing: Math.max(5, Math.min(40, Math.round(g.character.hidden.athleticism * 0.3 + randInt(g, 0, 10) + (hasTalent(g, 'Athletics') ? 6 : 0)))),
  mic: Math.max(5, Math.min(50, Math.round(g.character.stats.smarts * 0.15 + g.character.stats.looks * 0.15 + g.character.hidden.craziness * 0.15 + randInt(g, 0, 10)))),
  popularity: 0,
  align: 'face',
  ringName: '',
  schooled: false,
  titles: [],
  matches: 0,
  fiveStars: 0,
  startAge: g.character.age,
  retiredAge: null,
  mask: false,
  lastTurnAge: -10,
})

function wp(g: GameState): WrestleProfile {
  const p = prof(g, 'sports.wrestle', initWrestle)
  // Main Character Syndrome: the first time in the ring you move like a veteran, and the first promo
  // is already a classic (to the ceiling of the age). Popularity, pushes and titles are still earned.
  if (hasMainCharacter(g)) {
    masterFirstTime(g, 'sport.wrestling', 'sport', 'pro wrestling')
    p.inRing = bodyCeiling(g, { peakEnd: 40 })
    p.mic = ageCeiling(g.character.age, { from: 10, full: 20, floor: 30 })
  }
  return p
}

/** A ring skill as it shows against the roster: a main character's takes years to show (mastery.experienceCap). */
function ringLevel(g: GameState, value: number): number {
  return Math.min(value, masteryCap(g, 'sport.wrestling'))
}

function viewWp(g: GameState): WrestleProfile | null {
  return peek<WrestleProfile>(g, 'sports.wrestle')
}

export function wrestlerJob(g: GameState): Job | null {
  return myJob(g, 'sports.wrestler')
}

function wj(job: Job): WrestleJob {
  return view<WrestleJob>(job.data)
}

/** Fame from wrestling scales with the stage: nobody outside the bingo hall knows indie stars. */
function wFame(g: GameState, n: number): void {
  const job = wrestlerJob(g)
  const tier = job ? wj(job).tier : 0
  if (tier === 2) addFame(g, n)
  else if (tier === 1) addFame(g, Math.ceil(n / 2))
  else if (chance(g, 0.3)) addFame(g, 1)
}

function lucha(g: GameState): boolean {
  return g.character.countryId === 'mx'
}

function indieName(g: GameState): string {
  if (lucha(g)) return 'Lucha Suprema Mexicana'
  if (g.character.countryId === 'jp') return 'Fighting Spirit Pro Wrestling'
  return `${getCountry(g.character.countryId).demonym} Wrestling Alliance`
}

function topTitle(g: GameState): string {
  return g.character.gender === 'female' ? "CWE Women's World Championship" : 'CWE World Heavyweight Championship'
}

// ---------------------------------------------------------------------------
// Getting in

const NAME_A = ['Mega', 'Rowdy', 'Iron', 'Thunder', 'Lethal', 'Cosmic', 'Savage', 'Golden', 'Diamond', 'Venom', 'Turbo', 'Hurricane', 'Big', 'Phantom', 'Glamour']
const NAME_B = ['Mike', 'Maxine', 'Kong', 'Blaze', 'Viper', 'Valkyrie', 'Rex', 'Duchess', 'Titan', 'Raven', 'Tornado', 'Jackhammer', 'Empress', 'Outlaw', 'Saint']
const LUCHA = ['El Relámpago', 'Místico Dorado', 'La Pantera', 'Hijo del Trueno', 'Fénix Negro', 'La Reina Azteca', 'El Huracán', 'Calavera de Plata']

const schoolAction: MenuAction = {
  type: 'action',
  id: 'sports.wrestle.school',
  label: 'Wrestling School',
  emoji: '\u{1F3EB}',
  subtitle: (g) => (viewWp(g)?.schooled ? 'Graduated · keep training' : 'Learn to bump, run the ropes and cut a promo'),
  disabledReason: (g) => sportsGate(g, 16),
  run: (g) => {
    if (!useYearAction(g, 'sports.wrestle.school', 1)) return tell(g, 'Wrestling School', 'The trainer says your spine needs the rest of the year off.', '\u{1F971}')
    const p = wp(g)
    const fee = p.schooled ? localFee(g, 800) : localFee(g, 3_500)
    const paid = payFee(g, fee)
    if (!paid) return tell(g, 'Wrestling School', `Tuition is ${money(fee)}. You can't afford it.`, '\u{1F4B8}')
    p.inRing = Math.min(100, p.inRing + trainGain(g, p.inRing, 6, 12, talentMult(g, 'Athletics', 1.5)))
    p.mic = Math.min(100, p.mic + trainGain(g, p.mic, 2, 5, hasTalent(g, 'Acting') || hasTalent(g, 'Comedy') ? 1.5 : 1))
    addHeadTrauma(g, 0.3)
    const first = !p.schooled
    p.schooled = true
    log(g, first ? 'I graduated from wrestling school.' : 'I took more classes at the wrestling school.', 'good')
    say(g, 'Wrestling School', `${first ? `You spent months learning to fall on a ring that is basically plywood with a blanket on it. You graduated!` : 'More drills, more bumps, more yelling.'}${payerNote(paid)} In-ring: ${p.inRing}% · Mic: ${p.mic}%.`, '\u{1F93C}', 'good')
  },
}

interface DebutData {
  names: string[]
  promotion: string
}

const debutScript = defineScript('sports.wrestle.debut', (g, choice, data) => {
  const d = data as unknown as DebutData
  if (!d || choice === 'cancel') return
  const [name, align] = choice.split('|')
  if (!d.names.includes(name)) return
  const p = wp(g)
  p.ringName = name
  p.align = align === 'heel' ? 'heel' : 'face'
  p.retiredAge = null
  p.mask = lucha(g)
  const { quit } = hire(g, {
    defId: 'sports.wrestler',
    title: 'Pro Wrestler',
    company: d.promotion,
    salary: 0,
    data: { tier: 0, promotion: d.promotion, push: 20, belt: '', feud: '', contractYears: 0, earned: 0, matchesThisYear: 0 },
  })
  log(g, `I debuted as "${name}" on the indie circuit.`, 'good')
  say(g, 'Debut!', `"${name}" made their debut in a ${pick(g, ['bingo hall', 'high-school gym', 'flea market parking lot', 'bowling alley'])} for ${d.promotion} in front of ${randInt(g, 40, 300)} fans. You're a ${p.align === 'face' ? 'babyface (the good guy)' : 'heel (the bad guy)'}.${p.mask ? ' Your mask is sacred: never let anyone take it.' : ''}${quitNote(quit)}`, '\u{1F93C}', 'good')
})

const debutAction: MenuAction = {
  type: 'action',
  id: 'sports.wrestle.debut',
  label: 'Debut on the Indies',
  emoji: '\u{1F31F}',
  subtitle: (g) => `Wrestle for ${indieName(g)} (18+, after wrestling school)`,
  disabledReason: (g) => {
    const gate = sportsGate(g, 18)
    if (gate) return gate
    if (wrestlerJob(g)) return "You're already a pro wrestler."
    const p = viewWp(g)
    if (!p?.schooled) return 'Go to wrestling school first. Nobody books someone who can’t take a bump.'
    if (g.character.age > 45) return 'Promoters want young talent. You could manage someone instead.'
    return null
  },
  confirm: (g) => (g.character.job ? `Wrestling full-time means quitting your job as ${g.character.job.title}. Continue?` : null),
  run: (g) => {
    const names = lucha(g) ? [pick(g, LUCHA), pick(g, LUCHA)] : [`${pick(g, NAME_A)} ${pick(g, NAME_B)}`, `${pick(g, NAME_A)} ${pick(g, NAME_B)}`, `"The ${pick(g, ['Iconic', 'Notorious', 'Electric', 'Unbreakable', 'Fabulous'])}" ${g.character.lastName}`]
    const uniq = [...new Set(names)]
    const promotion = indieName(g)
    scriptChoice(
      g,
      debutScript,
      'Your Gimmick',
      `${promotion} will book you. Pick a ring name and a side.`,
      [...uniq.flatMap((n) => [{ id: `${n}|face`, label: `${n} (babyface)`, emoji: '\u{1F607}' }, { id: `${n}|heel`, label: `${n} (heel)`, emoji: '\u{1F608}' }]), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
      { emoji: '\u{1F93C}', data: { names: uniq, promotion } as unknown as Json },
    )
  },
}

// ---------------------------------------------------------------------------
// Matches and promos

function stars(n: number): string {
  const full = Math.floor(n)
  return `${'\u{2B50}'.repeat(full)}${n - full >= 0.5 ? '½' : ''}`
}

const matchScript = defineScript('sports.wrestle.match', (g, choice) => {
  const job = wrestlerJob(g)
  if (!job) return
  const j = wj(job)
  const p = wp(g)
  const opp = worldAthlete(g, g.character.gender, 0.5).name
  let quality = ringLevel(g, p.inRing) * 0.6 + p.popularity * 0.15 + ringLevel(g, p.mic) * 0.05 + rand(g) * 30
  let text = ''
  let popGain = 2
  if (choice === 'highspot') {
    quality += 12
    popGain += 4
    if (chance(g, 0.2)) {
      const inj = pick(g, ['Concussion', 'Broken Ankle', 'Neck Injury', 'Torn Pectoral'])
      injure(g, inj, randInt(g, 12, 30))
      addHeadTrauma(g, /concussion|neck/i.test(inj) ? 4 : 1, /concussion/i.test(inj))
      text = `You dove off the top of a ladder through a table. The crowd chanted "THIS IS AWESOME". You also got a ${inj.toLowerCase()}.`
      quality -= 5
    } else text = `You flew off the top rope onto ${opp} on the outside. The crowd chanted "HOLY ****" (it's a family show, so they bleeped it).`
    addHeadTrauma(g, 1)
  } else if (choice === 'stiff') {
    quality += 5
    j.push = Math.max(0, j.push - 6)
    text = `You worked stiff and actually hit ${opp}. The match looked real. ${opp} complained to management. Locker room heat: high.`
  } else if (choice === 'apuesta') {
    if (!p.mask) return
    if (chance(g, 0.35 + j.push / 200)) {
      popGain += 12
      quality += 8
      wFame(g, 6)
      honor(g, `Won a mask-vs-mask match against ${opp}.`)
      text = `Máscara contra Máscara! You pinned ${opp}, who had to unmask in the middle of the ring. Grown men in the crowd wept.`
    } else {
      p.mask = false
      popGain += 5
      wFame(g, 3)
      text = `Máscara contra Máscara... and you lost. You removed your mask and said your real name into the microphone. The arena went silent, then gave you a standing ovation.`
    }
  } else if (choice === 'shoot') {
    if (chance(g, 0.3 + p.popularity / 300)) {
      j.push = Math.min(100, j.push + 20)
      popGain += 10
      wFame(g, 4)
      text = `You went off-script and pinned ${opp} for real. The crowd lost its mind. Management, stunned by the reaction, pretended it was the plan all along.`
    } else {
      p.popularity = Math.max(0, p.popularity - 5)
      log(g, `I was fired for going off-script.`, 'bad')
      leave(g, 'fired')
      addHidden(g, 'notoriety', 3)
      return say(g, 'Fired', `You went off-script and refused to lose to ${opp}. The bookers were furious. You were released before the trucks left the parking lot.`, '\u{1F6AB}', 'bad')
    }
  } else {
    text = `You followed the script beat for beat against ${opp}. ${pick(g, ['Solid match. The agent gave you a thumbs up.', 'The crowd was into it. Your finisher got a big pop.', 'Smooth match. Nobody got hurt, which is a win in this business.'])}`
  }
  const rating = Math.max(0.5, Math.min(5, Math.round((quality / 20) * 2) / 2))
  p.matches += 1
  p.inRing = Math.min(100, p.inRing + randInt(g, 0, 2))
  p.popularity = Math.max(0, Math.min(100, p.popularity + popGain + (rating >= 4 ? 3 : 0)))
  j.push = Math.max(0, Math.min(100, j.push + (rating >= 4 ? 5 : rating >= 3 ? 2 : -1)))
  count(g, 'wrestlingMatches')
  if (rating >= 5) {
    p.fiveStars += 1
    wFame(g, 3)
    if (p.fiveStars === 1) honor(g, `Wrestled a five-star match against ${opp}.`, 'Five-star wrestling match', 'Pro wrestling', 6)
  }
  log(g, `I wrestled ${opp} (${stars(rating)}).`, rating >= 4 ? 'good' : 'neutral')
  say(g, 'Match', `${text} Match rating: ${stars(rating)}. Popularity: ${p.popularity}%.`, '\u{1F93C}', rating >= 4 ? 'good' : 'neutral')
})

const promoScript = defineScript('sports.wrestle.promo', (g, choice) => {
  const job = wrestlerJob(g)
  if (!job) return
  const j = wj(job)
  const p = wp(g)
  const city = randomCity(g, getCountry(g.character.countryId))
  const skill = ringLevel(g, p.mic) + rand(g) * 40
  let text = ''
  let pop = 0
  if (choice === 'hometown') {
    pop = p.align === 'face' ? 5 : -2
    text = `You told ${city} it's the greatest city in the world. ${p.align === 'face' ? 'Cheap pop, but a big one.' : 'Heels aren’t supposed to do that. The crowd was confused.'}`
  } else if (choice === 'insult') {
    pop = p.align === 'heel' ? 6 : -3
    text = `You called ${city} "a parking lot with a zip code". ${p.align === 'heel' ? 'Nuclear heat. Someone threw a hot dog at you. Perfect.' : 'You were supposed to be the good guy.'}`
  } else if (choice === 'callout') {
    j.push = Math.min(100, j.push + (skill > 60 ? 8 : 2))
    pop = skill > 60 ? 4 : 0
    text = skill > 60 ? 'You called out the champion with a promo so good the commentators forgot to talk.' : 'You called out the champion, forgot your lines halfway through, and said "uh, yeah" four times.'
  } else {
    if (chance(g, 0.5)) {
      pop = 10
      wFame(g, 3)
      text = 'You broke character and talked about real backstage politics. The clip went mega-viral. Management is pretending to be fine with it.'
    } else {
      j.push = Math.max(0, j.push - 15)
      text = 'You broke the fourth wall and buried the creative team on live TV. You’re now booked in a match against a man in a chicken costume. For six weeks.'
    }
  }
  p.mic = Math.min(100, p.mic + randInt(g, 1, 3))
  p.popularity = Math.max(0, Math.min(100, p.popularity + pop + (skill > 70 ? 2 : 0)))
  log(g, 'I cut a promo.')
  say(g, 'Promo', `${text} Mic skills: ${p.mic}% · Popularity: ${p.popularity}%.`, '\u{1F3A4}')
})

const titleScript = defineScript('sports.wrestle.title', (g, choice) => {
  const job = wrestlerJob(g)
  if (!job || choice !== 'ask') return
  const j = wj(job)
  const p = wp(g)
  const belt = j.tier === 2 ? (j.push >= 85 && p.popularity >= 70 ? topTitle(g) : 'CWE Continental Championship') : j.tier === 1 ? 'Proving Grounds Championship' : `${j.promotion} Championship`
  if (j.belt === belt) return tell(g, 'Title', `You're already the ${belt} holder.`, '\u{1F3C6}')
  if (chance(g, Math.min(0.85, (j.push + p.popularity) / 200))) {
    j.belt = belt
    j.push = Math.min(100, j.push + 5)
    p.titles.push(`${belt} (${g.year})`)
    count(g, 'championships')
    wFame(g, belt === topTitle(g) ? 10 : 4)
    addBuzz(g, belt === topTitle(g) ? 20 : 6)
    honor(g, `Won the ${belt}.`, belt === topTitle(g) ? `${topTitle(g)} holder` : undefined, 'CWE', 8)
    log(g, `I won the ${belt}!`, 'good')
    return say(g, 'NEW CHAMPION!', `Creative booked you to win the ${belt}! Confetti, pyro, and your mom crying in the front row.`, '\u{1F3C6}', 'good')
  }
  j.push = Math.max(0, j.push - 4)
  say(g, 'Not Yet', `The head of creative said you're "not ready to carry a title". Then he went back to his sandwich.`, '\u{1F96A}', 'bad')
})

function wrestlerActions(): MenuNode[] {
  return [
    {
      type: 'action',
      id: 'sports.wrestle.match',
      label: 'Wrestle a Match',
      emoji: '\u{1F93C}',
      subtitle: 'Up to 6 televised matches a year',
      disabledReason: (g) => sportsGate(g, 0) ?? (g.character.stats.health < 25 ? "You're too banged up to wrestle." : null),
      run: (g) => {
        if (!useYearAction(g, 'sports.wrestle.match', 6)) return tell(g, 'Match', "You've wrestled enough featured matches this year. The rest are house shows nobody films.", '\u{1F971}')
        scriptChoice(
          g,
          matchScript,
          'Match Plan',
          'The agent gives you the finish. How do you work the match?',
          [
            { id: 'script', label: 'Follow the script', emoji: '\u{1F4DD}' },
            { id: 'highspot', label: 'Do a death-defying high spot', emoji: '\u{1FA82}' },
            { id: 'stiff', label: 'Work stiff (hit for real)', emoji: '\u{1F44A}' },
            { id: 'shoot', label: 'Go off-script and steal the win', emoji: '\u{1F6A8}' },
            ...(viewWp(g)?.mask ? [{ id: 'apuesta', label: 'Bet your mask (Máscara contra Máscara)', emoji: '\u{1F3AD}' }] : []),
          ],
          { emoji: '\u{1F93C}' },
        )
      },
    },
    {
      type: 'action',
      id: 'sports.wrestle.promo',
      label: 'Cut a Promo',
      emoji: '\u{1F3A4}',
      subtitle: 'Get on the mic (twice a year)',
      disabledReason: (g) => sportsGate(g, 0),
      run: (g) => {
        if (!useYearAction(g, 'sports.wrestle.promo', 2)) return tell(g, 'Promo', 'Creative has given your mic time to someone else this year.', '\u{1F3A4}')
        scriptChoice(
          g,
          promoScript,
          'Promo',
          'The camera light turns red. You have the microphone.',
          [
            { id: 'hometown', label: 'Praise the hometown', emoji: '\u{1F3D9}\u{FE0F}' },
            { id: 'insult', label: 'Insult the hometown', emoji: '\u{1F624}' },
            { id: 'callout', label: 'Call out the champion', emoji: '\u{1F451}' },
            { id: 'fourth', label: 'Break the fourth wall', emoji: '\u{1F4FA}' },
          ],
          { emoji: '\u{1F3A4}' },
        )
      },
    },
    {
      type: 'action',
      id: 'sports.wrestle.turn',
      label: 'Turn Heel / Face',
      emoji: '\u{1F504}',
      subtitle: (g) => (viewWp(g)?.align === 'heel' ? 'Become a babyface' : 'Become a heel'),
      disabledReason: (g) => sportsGate(g, 0) ?? (g.character.age - (viewWp(g)?.lastTurnAge ?? -10) < 2 ? 'You just turned. The fans need time to process.' : null),
      run: (g) => {
        const p = wp(g)
        p.align = p.align === 'heel' ? 'face' : 'heel'
        p.lastTurnAge = g.character.age
        const fresh = randInt(g, 4, 12)
        p.popularity = Math.min(100, p.popularity + fresh)
        log(g, `I turned ${p.align}.`)
        say(g, p.align === 'heel' ? 'HEEL TURN!' : 'FACE TURN!', p.align === 'heel' ? 'You hit your best friend with a steel chair and blamed the fans. Shocking. Effective. Popularity +' + fresh + '%.' : 'You saved a rival from a beatdown and shook their hand. The crowd went bananas. Popularity +' + fresh + '%.', '\u{1F504}', 'good')
      },
    },
    {
      type: 'action',
      id: 'sports.wrestle.titleShot',
      label: 'Ask for a Title Push',
      emoji: '\u{1F3C6}',
      subtitle: 'Knock on the head of creative’s door (once a year)',
      disabledReason: (g) => sportsGate(g, 0),
      run: (g) => {
        if (!useYearAction(g, 'sports.wrestle.title', 1)) return tell(g, 'Title Push', 'The head of creative has started hiding when he sees you coming.', '\u{1F6AA}')
        scriptChoice(g, titleScript, 'Title Push', 'You stand outside the head of creative’s office. Go in?', [{ id: 'ask', label: 'Ask for the belt', emoji: '\u{1F3C6}' }, { id: 'no', label: 'Lose your nerve', emoji: '\u{1F648}' }], { emoji: '\u{1F3C6}' })
      },
    },
    {
      type: 'action',
      id: 'sports.wrestle.tryout',
      label: 'CWE Tryout',
      emoji: '\u{1F4CB}',
      subtitle: 'Get signed to the big leagues',
      visible: (g) => {
        const j = wrestlerJob(g)
        return !!j && wj(j).tier === 0
      },
      disabledReason: (g) => sportsGate(g, 0),
      run: (g) => {
        if (!useYearAction(g, 'sports.wrestle.tryout', 1)) return tell(g, 'Tryout', 'CWE only holds one tryout a year for you. They have your tape.', '\u{1F4CB}')
        const job = wrestlerJob(g)
        if (!job) return
        const p = wp(g)
        const score = ringLevel(g, p.inRing) * 0.45 + ringLevel(g, p.mic) * 0.25 + g.character.stats.looks * 0.15 + p.popularity * 0.15 + rand(g) * 25
        if (score >= 62) {
          const j = wj(job)
          j.tier = 1
          j.promotion = TIERS[1]
          j.push = 30
          j.belt = ''
          j.contractYears = 3
          job.company = TIERS[1]
          job.salary = tidy(60_000 * Math.max(0.5, wealth(g)))
          addFame(g, 3)
          honor(g, 'Signed a developmental contract with Colossus Wrestling Entertainment.')
          log(g, 'I signed with CWE!', 'good')
          return say(g, 'Signed!', `CWE signed you to a developmental deal: ${money(job.salary)} a year at the Proving Grounds. You get a locker. With your name on tape.`, '\u{1F4CB}', 'good')
        }
        say(g, 'Tryout', pick(g, ['The coaches said your look is "not quite there". You looked down at yourself for a long time.', 'You blew up halfway through the cardio drill and threw up in a trash can. On camera.', 'They liked you but "don’t have a spot right now".']), '\u{1F4CB}', 'bad')
      },
    },
  ]
}

export function wrestlerJobNodes(g: GameState): MenuNode[] {
  const job = wrestlerJob(g)
  if (!job) return []
  const j = wj(job)
  const p = viewWp(g)
  return [
    { type: 'info', id: 'sports.wrestle.status', emoji: '\u{1F93C}', text: `"${p?.ringName ?? ''}" · ${p?.align === 'heel' ? 'Heel' : 'Babyface'} · ${TIERS[j.tier]} · popularity ${p?.popularity ?? 0}% · push ${j.push}%${j.belt ? ` · ${j.belt}` : ''}` },
    ...wrestlerActions(),
    schoolAction,
    {
      type: 'menu',
      id: 'sports.wrestle.record',
      label: 'Career',
      emoji: '\u{1F4CB}',
      subtitle: () => `${plural(p?.matches ?? 0, 'match')} · ${plural(p?.titles.length ?? 0, 'title')}`,
      children: (): MenuNode[] => {
        const nodes: MenuNode[] = [{ type: 'info', id: 'sports.wrestle.r.skills', emoji: '\u{1F93C}', text: `In-ring ${p?.inRing ?? 0}% · Mic ${p?.mic ?? 0}% · ${p?.fiveStars ?? 0} five-star matches` }]
        ;(p?.titles ?? []).slice(-6).forEach((t, i) => nodes.push({ type: 'info', id: `sports.wrestle.r.t${i}`, emoji: '\u{1F3C6}', text: t }))
        return nodes
      },
    },
    {
      type: 'action',
      id: 'sports.wrestle.retire',
      label: 'Retire',
      emoji: '\u{1F3D6}\u{FE0F}',
      subtitle: 'Give one last speech and leave your boots in the ring',
      confirm: () => 'Retire from wrestling?',
      run: (gg) => retireWrestler(gg),
    },
  ]
}

function retireWrestler(g: GameState): void {
  const job = wrestlerJob(g)
  if (!job) return
  const p = wp(g)
  p.retiredAge = g.character.age
  const legacy = Math.min(100, p.titles.length * 8 + p.popularity * 0.4 + p.fiveStars * 5)
  recordCareer(g, { sport: 'Pro Wrestling', kind: 'entertainment', from: p.startAge, best: p.titles.length ? p.titles[p.titles.length - 1] : plural(p.matches, 'match'), legacy })
  leave(g, 'retired')
  log(g, 'I retired from pro wrestling.', 'event')
  say(g, 'Retired', `You left your boots in the middle of the ring. ${plural(p.matches, 'match')}, ${plural(p.titles.length, 'title reign')}. The locker room came out to applaud. Even the people who hated you. Especially them.`, '\u{1F3C5}', 'good')
}

export const proWrestlingMenu: MenuGroup = {
  type: 'menu',
  id: 'sports.wrestle',
  label: 'Pro Wrestling',
  emoji: '\u{1F93C}',
  subtitle: (g) => {
    const job = wrestlerJob(g)
    if (job) return `${TIERS[wj(job).tier]} · popularity ${viewWp(g)?.popularity ?? 0}%`
    return lucha(g) ? 'Lucha libre: masks, high flyers and honor' : 'Sports entertainment: scripted wins, real bumps'
  },
  header: (g) => `Wrestling school → ${indieName(g)} → CWE Proving Grounds → the CWE main roster and Colossal Clash.`,
  children: (g): MenuNode[] => {
    if (wrestlerJob(g)) return [{ type: 'info', id: 'sports.wrestle.in', emoji: '\u{1F93C}', text: "You're a pro wrestler. Manage your career from Occupation › My Work." }]
    return [schoolAction, debutAction]
  },
}

// ---------------------------------------------------------------------------
// Yearly

export function yearlyWrestler(g: GameState): void {
  const c = g.character
  if (!c.alive || c.prison) return
  const job = wrestlerJob(g)
  if (!job) return
  syncTenure(g, job)
  const j = wj(job)
  const p = wp(g)
  // Pay: indie shows, developmental salary, main-roster contracts plus merch.
  let pay = 0
  if (j.tier === 0) pay = tidy((2_000 + p.popularity * 250) * Math.max(0.3, wealth(g)) * (0.7 + rand(g) * 0.6))
  else pay = job.salary
  let merch = 0
  if (j.tier === 2) merch = tidy((p.popularity / 100) ** 3 * 2_500_000)
  if (pay + merch > 0) earnIncome(g, pay + merch)
  if (j.tier === 0) job.salary = pay
  // Crowds move on unless creative keeps featuring you; booking momentum fades too.
  p.popularity = Math.max(0, Math.min(100, Math.round(p.popularity * 0.85 + j.push * 0.12)))
  if (!j.belt) j.push = Math.max(0, j.push - 5)
  addHeadTrauma(g, 0.6)
  if (c.age > 35 && !hasMainCharacter(g)) p.inRing = Math.max(1, p.inRing - randInt(g, 1, 3))
  fameToward(g, j.tier === 2 ? p.popularity * 0.7 : j.tier === 1 ? 15 : 5, 5)
  const lines: string[] = [`Earnings: ${short(pay)}${merch ? ` plus ${short(merch)} in merch` : ''}.`]
  // Colossal Clash, the biggest show of the year.
  if (j.tier === 2 && p.popularity >= 70 && j.push >= 60) {
    const main = j.push >= 80
    const bonus = tidy(main ? 250_000 + p.popularity * 5_000 : 75_000)
    earnIncome(g, bonus)
    addFame(g, main ? 6 : 2)
    if (main) honor(g, 'Headlined Colossal Clash, the biggest wrestling show of the year.', 'Colossal Clash main eventer', 'CWE', 8)
    lines.push(main ? `You MAIN-EVENTED Colossal Clash in front of 80,000 people (${short(bonus)} bonus).` : `You had a match at Colossal Clash (${short(bonus)} bonus).`)
  }
  // Losing the belt eventually.
  if (j.belt && chance(g, 0.45)) {
    lines.push(`Creative had you drop the ${j.belt}.`)
    j.belt = ''
  }
  // Call-up from developmental.
  if (j.tier === 1 && j.push >= 55 && p.popularity >= 30) {
    j.tier = 2
    j.promotion = TIERS[2]
    job.company = TIERS[2]
    j.belt = ''
    job.salary = tidy(250_000 + p.popularity * 8_000)
    addFame(g, 6)
    honor(g, 'Called up to the CWE main roster.')
    lines.push(`You've been CALLED UP to the CWE main roster at ${money(job.salary)} a year!`)
  }
  // Contracts and releases.
  if (j.tier >= 1) {
    j.contractYears -= 1
    if (j.contractYears <= 0) {
      if (p.popularity < 20 && j.push < 30) {
        log(g, 'CWE released me.', 'bad')
        lines.push('CWE released you. "We wish them the best in their future endeavors."')
        j.tier = 0
        j.promotion = indieName(g)
        job.company = j.promotion
        job.salary = 0
        j.belt = ''
      } else {
        j.contractYears = randInt(g, 2, 4)
        if (j.tier === 2) job.salary = tidy(Math.max(job.salary, 250_000 + (p.popularity / 100) ** 2 * 2_750_000))
        lines.push(`You signed a new ${j.contractYears}-year CWE deal.`)
      }
    }
  }
  say(g, 'Wrestling Year', lines.join(' '), '\u{1F93C}', 'neutral')
  if (c.age >= 50 || (c.age >= 42 && c.stats.health < 40)) retireWrestler(g)
}
