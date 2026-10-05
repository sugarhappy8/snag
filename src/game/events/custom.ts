// Offline "Do Anything": keyword rules that turn the player's free-form text into a
// sensible little outcome (popup + life-log line + small stat changes), respecting age,
// prison and money. Used when the AI narrator is off, unreachable or skipped.
import {
  addHidden,
  addRelationship,
  count,
  currentPartner,
  endJob,
  inPrison,
  peopleBy,
  preferredGender,
  remember,
} from '../core'
import { createPerson } from '../people'
import { chance, pick, randInt } from '../rng'
import type { GameState, Person } from '../types'
import { applyEffects } from '../effects'
import { canDrink, dollars, friends, grandkids, inGradeSchool, kids, money, pets, say, siblings, type Fx } from './helpers'

interface Rule {
  id: string
  re: RegExp
  /** Below this age the action is refused with a kid-friendly alternative. */
  minAge?: number
  /** Allowed while incarcerated. */
  prison?: boolean
  run: (g: GameState, a: Act) => void
}

/** The parsed action. */
interface Act {
  /** Cleaned original text (for quoting). */
  raw: string
  /** Lowercase text for matching. */
  low: string
  /** "go for a run" — first-person-ready verb phrase. */
  phrase: string
}

// ---------------------------------------------------------------------------
// Text helpers

function clean(text: string): string {
  return text
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .slice(0, 120)
    .trim()
}

/** Turn "I want to go for a run" into "go for a run". */
function toPhrase(raw: string): string {
  let s = raw.replace(/^(i\s+(want|wanna|would like|am going|'m going|will|shall|try|am trying|decide|decided)\s+(to\s+)?|i'll\s+|i'm\s+gonna\s+|i\s+gonna\s+|let's\s+|lets\s+|try\s+to\s+|to\s+|i\s+)/i, '')
  s = s.replace(/\byour\b/gi, 'my').replace(/\byourself\b/gi, 'myself')
  if (!s) s = raw
  return s[0].toLowerCase() + s.slice(1)
}

function you(phrase: string): string {
  return phrase.replace(/\bmyself\b/gi, 'yourself').replace(/\bmy\b/gi, 'your').replace(/\bme\b/gi, 'you').replace(/\bI\b/g, 'you')
}

function has(a: Act, re: RegExp): boolean {
  return re.test(a.low)
}

/** Lose up to `amt` (never more than the cash on hand). */
function affordable(g: GameState, amt: number): number {
  return Math.max(0, Math.min(Math.max(0, g.character.money), amt))
}

function out(g: GameState, title: string | readonly string[], text: string | readonly string[], logLine: string | readonly string[] | null, fx: Fx, tone: 'good' | 'bad' | 'neutral', emoji: string): void {
  say(g, null, title, text, logLine, fx, tone, emoji)
}

/** A person named in the text ("go bowling with Linda"), if they're in your life. */
function namedPerson(g: GameState, a: Act): Person | undefined {
  const words = new Set(a.low.split(/[^a-zÀ-ɏ'-]+/).filter(Boolean))
  return g.people.find((p) => p.alive && p.firstName.length > 1 && words.has(p.firstName.toLowerCase()))
}

/** A relative/friend referred to by role ("call my mom"). */
function roleTarget(g: GameState, a: Act): Person | undefined {
  const pk = (rels: Parameters<typeof peopleBy>[1], gender?: 'male' | 'female') => {
    const list = peopleBy(g, rels).filter((p) => !gender || p.gender === gender)
    return list.length ? pick(g, list) : undefined
  }
  if (has(a, /\b(mom|mother|mum|mommy|mama)\b/)) return pk(['parent', 'stepparent'], 'female')
  if (has(a, /\b(dad|father|daddy|papa)\b/)) return pk(['parent', 'stepparent'], 'male')
  if (has(a, /\bparents?\b/)) return pk(['parent', 'stepparent'])
  if (has(a, /\b(brother|sister|sibling|sis|bro)\b/)) return siblings(g).length ? pick(g, siblings(g)) : undefined
  if (has(a, /\b(grandma|grandpa|granny|grandmother|grandfather|grandparents?|nana|grandad)\b/)) return pk(['grandparent'])
  if (has(a, /\b(grandkids?|grandson|granddaughter|grandchild(ren)?)\b/)) return grandkids(g).length ? pick(g, grandkids(g)) : undefined
  if (has(a, /\b(wife|husband|spouse|partner|girlfriend|boyfriend|fianc[eé]e?|gf|bf)\b/)) return currentPartner(g)
  if (has(a, /\b(son|daughter|kids?|child|children|baby)\b/)) return kids(g).length ? pick(g, kids(g)) : undefined
  if (has(a, /\b(friends?|bestie|best friend|buddy|pal)\b/)) return friends(g).length ? pick(g, friends(g)) : undefined
  if (has(a, /\b(boss)\b/)) return pk(['boss'])
  if (has(a, /\b(coworkers?|colleague)\b/)) return pk(['coworker'])
  if (has(a, /\b(cellmate|cellie)\b/)) return pk(['cellmate'])
  return undefined
}

function relTo(p: Person): string {
  const map: Record<string, [string, string]> = {
    parent: ['father', 'mother'],
    stepparent: ['stepfather', 'stepmother'],
    sibling: ['brother', 'sister'],
    halfSibling: ['half brother', 'half sister'],
    stepsibling: ['stepbrother', 'stepsister'],
    grandparent: ['grandfather', 'grandmother'],
    child: ['son', 'daughter'],
    stepchild: ['stepson', 'stepdaughter'],
    grandchild: ['grandson', 'granddaughter'],
    partner: ['boyfriend', 'girlfriend'],
    fiance: ['fiancé', 'fiancée'],
    spouse: ['husband', 'wife'],
    exSpouse: ['ex-husband', 'ex-wife'],
    ex: ['ex-boyfriend', 'ex-girlfriend'],
  }
  const pair = map[p.relation]
  if (pair) return p.gender === 'male' ? pair[0] : pair[1]
  if (p.relation === 'pet') return (p.species ?? 'pet').toLowerCase()
  if (p.relation === 'bestFriend') return 'best friend'
  return p.relation
}

// ---------------------------------------------------------------------------
// Rules (first match wins)

const RULES: Rule[] = [
  {
    id: 'selfHarm',
    re: /\b(kill myself|suicide|end my life|end it all|self[- ]?harm|hurt myself|cut myself|unalive myself)\b/,
    prison: true,
    run: (g) =>
      out(
        g,
        'You matter',
        "You reached out to someone you trust and talked honestly about how you've been feeling. It didn't fix everything, but it helped, and that's a start. (If you ever feel this way in real life, please talk to someone you trust or contact a local crisis line. You deserve support.)",
        'I talked to someone I trust about how I was feeling.',
        { happiness: 4 },
        'neutral',
        '💛',
      ),
  },
  {
    id: 'murder',
    re: /\b(murder|kill|assassinate|stab|shoot)\b/,
    prison: true,
    run: (g) =>
      out(
        g,
        ['Second thoughts', 'Cooler heads'],
        [
          'You stood in the kitchen gripping a frying pan, thought very hard about the consequences, and made an omelet instead.',
          'You plotted dramatically for an entire afternoon, then got distracted by a nap. Nobody was harmed.',
          'You wrote a menacing list of names, then used the back of it as a grocery list.',
        ],
        'I had some dark thoughts, but I let them pass.',
        { craziness: 4, happiness: -2 },
        'neutral',
        '🍳',
      ),
  },
  {
    id: 'escape',
    re: /\b(escape|break out|bust out|tunnel out|jailbreak)\b/,
    prison: true,
    run: (g) => {
      if (!inPrison(g)) return out(g, 'Escape artist', 'You escaped from a very boring afternoon by taking a walk. Freedom tastes like fresh air.', 'I escaped my routine for an afternoon.', { happiness: 4 }, 'good', '🏃')
      out(g, 'Not yet', 'You studied the walls, the fences and the guard rotations, and decided a real escape needs a real plan. (Try the escape option in the Prison menu.)', 'I daydreamed about escaping from prison.', { happiness: -1 }, 'neutral', '🧱')
    },
  },
  {
    id: 'propose',
    re: /\b(propose|marry|get married|pop the question|engaged)\b/,
    minAge: 18,
    run: (g) => {
      const p = currentPartner(g)
      if (!p) return out(g, 'Rejected', "You don't have a partner, so you proposed to a stranger at the mall. They said no, then asked security to escort you out.", 'I proposed to a stranger at the mall. It did not go well.', { happiness: -6, craziness: 2 }, 'bad', '💔')
      if (p.relation === 'spouse') {
        addRelationship(p, randInt(g, 4, 8))
        return out(g, 'Still yes', `You got down on one knee and proposed to your ${relTo(p)}, ${p.firstName}, all over again. ${p.firstName} laughed and said yes. Again.`, `I re-proposed to my ${relTo(p)}, ${p.firstName}.`, { happiness: 6 }, 'good', '💍')
      }
      if (p.relation === 'fiance') return out(g, 'Already engaged', `You and ${p.firstName} are already engaged! You spent the evening arguing about wedding colors instead.`, `I talked wedding plans with my ${relTo(p)}, ${p.firstName}.`, { happiness: 2 }, 'neutral', '💒')
      const odds = Math.max(0.1, Math.min(0.9, (p.relationship - 30) / 60))
      if (chance(g, odds)) {
        p.relation = 'fiance'
        p.data.engagedAge = g.character.age
        addRelationship(p, randInt(g, 6, 12))
        count(g, 'engagements')
        remember(g, `Got engaged to ${p.firstName} ${p.lastName}.`)
        return out(g, ['Engaged!', 'They said yes!'], `You proposed to ${p.firstName} with a ring made from a twist tie. ${p.firstName} said YES! Time to start planning a wedding.`, `I proposed to ${p.firstName} and ${p.gender === 'male' ? 'he' : 'she'} said yes!`, { happiness: 15 }, 'good', '💍')
      }
      addRelationship(p, -randInt(g, 8, 15))
      out(g, 'Not ready', `You proposed to ${p.firstName}, who said "I'm not ready for that." The car ride home was very quiet.`, `I proposed to ${p.firstName} and got turned down.`, { happiness: -10 }, 'bad', '💔')
    },
  },
  {
    id: 'quit',
    re: /\b(quit|resign|leave)\b.*\b(job|work|career)\b|\bquit\b$/,
    minAge: 14,
    run: (g) => {
      const c = g.character
      const which = c.job ? 'job' : c.partTimeJob ? 'partTimeJob' : null
      if (!which) return out(g, 'Nothing to quit', "You can't quit a job you don't have. You quit eating sugar instead. That lasted until lunch.", null, {}, 'neutral', '🤷')
      const job = c[which]!
      const title = job.title
      const company = job.company
      endJob(g, which, 'quit')
      remember(g, `Quit my job as ${title} at ${company}.`)
      out(g, pick(g, ['I quit!', 'Free at last']), pick(g, [`You marched into your boss's office and quit your job as ${title} at ${company}. You did not look back.`, `You quit your job as ${title} at ${company} with a dramatic speech. Someone in accounting slow-clapped.`]), `I quit my job as ${title} at ${company}.`, { happiness: randInt(g, 2, 8) }, 'neutral', '👋')
    },
  },
  {
    id: 'raise',
    re: /\b(raise|promotion|promote)\b/,
    minAge: 14,
    run: (g) => {
      const job = g.character.job ?? g.character.partTimeJob
      if (!job) return out(g, 'No boss', "You asked yourself for a raise. You said no. You don't have a job.", null, {}, 'neutral', '🤷')
      if (job.performance >= 70 && chance(g, 0.45)) {
        const bump = Math.round(job.salary * (randInt(g, 3, 8) / 100))
        job.salary += bump
        return out(g, 'Raise approved', `You asked for a raise at ${job.company}, and your boss agreed! Your salary went up by ${money(bump)}.`, `I asked for a raise at ${job.company} and got it.`, { happiness: 8 }, 'good', '💰')
      }
      job.performance = Math.max(0, job.performance - 3)
      out(g, 'Denied', pick(g, [`You asked for a raise at ${job.company}. Your boss laughed, then realized you were serious, then laughed harder.`, `Your boss at ${job.company} said "maybe next quarter." It is always next quarter.`]), `I asked for a raise at ${job.company} and was turned down.`, { happiness: -4 }, 'bad', '📉')
    },
  },
  {
    id: 'workHard',
    re: /\b(work (hard|harder|overtime|late|extra)|overtime|grind at work|hustle)\b/,
    minAge: 14,
    prison: true,
    run: (g) => {
      const job = g.character.job ?? g.character.partTimeJob
      if (inPrison(g)) return out(g, 'Model inmate', 'You threw yourself into your prison work detail. The guards noticed.', 'I worked hard at my prison job.', { behavior: 4, happiness: -1 }, 'good', '🧹')
      if (!job) return out(g, 'Hard worker', 'You worked hard all day on chores around the house. It counts.', 'I worked hard around the house.', { happiness: 1, health: 1 }, 'neutral', '🧹')
      out(g, 'Employee of the month?', `You stayed late at ${job.company} and impressed your boss.`, `I worked overtime at ${job.company}.`, { perf: randInt(g, 4, 8), happiness: -2, health: -1 }, 'good', '💼')
    },
  },
  {
    id: 'steal',
    re: /\b(steal|shoplift|rob|pickpocket|swipe|loot|pinch)\b/,
    minAge: 8,
    run: (g, a) => {
      const age = g.character.age
      if (has(a, /\bbank\b/)) return out(g, 'Bad idea', 'You walked into a bank with a menacing note, panicked, and walked out with a lollipop and a pamphlet about savings accounts. (Heists are planned from the Crime menu.)', 'I almost robbed a bank but lost my nerve.', { karma: -2, craziness: 3 }, 'neutral', '🏦')
      count(g, 'crimes')
      const caught = chance(g, age < 14 ? 0.35 : 0.25)
      if (caught) {
        if (age < 14) return out(g, 'Busted', "You were caught red-handed. The store manager called your parents, who were mortified. You're grounded.", 'I got caught shoplifting and my parents grounded me.', { karma: -8, happiness: -6, rels: peopleBy(g, ['parent', 'stepparent']).map((p) => ({ p, d: -8 })) }, 'bad', '🚨')
        return out(g, 'Caught!', 'A security guard tackled you before you made it out the door.', 'I got caught stealing.', { karma: -10, arrest: { crime: 'Shoplifting', severity: 1 } }, 'bad', '🚓')
      }
      const loot = age < 14 ? dollars(g, 2, 20) : dollars(g, 20, 300)
      out(g, ['Got away with it', 'Five-finger discount'], age < 14 ? `You slipped some candy into your pocket and walked out. Nobody noticed. Your conscience did, a little.` : `You swiped some stuff and sold it for ${money(loot)}. Nobody saw a thing.`, age < 14 ? 'I stole some candy from a store.' : `I stole some things and made ${money(loot)}.`, { karma: -8, money: age < 14 ? 0 : loot, happiness: 2 }, 'neutral', '🕶️')
    },
  },
  {
    id: 'fight',
    re: /\b(fight|punch|beat up|attack|slap|kick|brawl|assault|headbutt)\b/,
    minAge: 6,
    prison: true,
    run: (g, a) => {
      count(g, 'fights')
      const target = namedPerson(g, a) ?? roleTarget(g, a)
      const won = chance(g, 0.35 + g.character.hidden.athleticism / 250)
      if (target && target.relation !== 'pet') {
        addRelationship(target, -randInt(g, 15, 30))
        if (won) return out(g, 'Knockout', `You picked a fight with your ${relTo(target)}, ${target.firstName}, and won. You don't feel great about it.`, `I got into a fight with my ${relTo(target)}, ${target.firstName}.`, { karma: -6, happiness: 2, respect: 4 }, 'neutral', '👊')
        return out(g, 'Ouch', `You picked a fight with your ${relTo(target)}, ${target.firstName}, and lost badly.`, `I lost a fight with my ${relTo(target)}, ${target.firstName}.`, { health: -randInt(g, 5, 12), karma: -4, happiness: -5 }, 'bad', '🤕')
      }
      if (inPrison(g)) {
        if (won) return out(g, 'Yard legend', 'You picked a fight with a mouthy inmate in the yard and won. Respect earned, privileges lost.', 'I won a fight in the prison yard.', { respect: 10, behavior: -10, health: -3 }, 'neutral', '👊')
        return out(g, 'Beaten', 'You picked a fight in the yard with someone much bigger than you. You woke up in the infirmary.', 'I lost a fight in the prison yard.', { respect: -3, behavior: -10, health: -12 }, 'bad', '🤕')
      }
      if (g.character.age >= 16 && chance(g, 0.08)) return out(g, 'Arrested', 'You started a fight with a stranger, who turned out to be an off-duty cop.', 'I started a fight with an off-duty cop.', { karma: -8, health: -5, arrest: { crime: 'Assault', severity: 1 } }, 'bad', '🚓')
      if (won) return out(g, ['Winner', 'Undefeated'], 'You picked a fight with a random stranger and knocked them flat. A small crowd cheered. Then a small crowd booed.', 'I won a fight with a stranger.', { karma: -5, happiness: 4 }, 'neutral', '👊')
      out(g, ['Lost the fight', 'Humbled'], 'You picked a fight with a stranger and got your clock cleaned.', 'I lost a fight with a stranger.', { health: -randInt(g, 6, 14), happiness: -6, karma: -3 }, 'bad', '🤕')
    },
  },
  {
    id: 'drugs',
    re: /\b(drugs?|weed|marijuana|cocaine|coke|meth|heroin|lsd|acid|shrooms|mushrooms|ecstasy|molly|get high|smoke a joint|pills)\b/,
    minAge: 13,
    prison: true,
    run: (g) => {
      count(g, 'drugs')
      if (g.character.age >= 14 && chance(g, inPrison(g) ? 0.15 : 0.05)) {
        if (inPrison(g)) return out(g, 'Contraband', 'A guard caught you with contraband during a cell search.', 'I got caught with drugs in prison.', { behavior: -15, health: -3 }, 'bad', '🚨')
        return out(g, 'Busted', 'You were caught by the police with drugs in your pocket.', 'I got caught with drugs by the police.', { health: -3, arrest: { crime: 'Drug Possession', severity: 1 } }, 'bad', '🚓')
      }
      if (chance(g, 0.15)) return out(g, 'Bad trip', 'You had a terrible time. You spent the night convinced the wallpaper was judging you.', 'I had a bad experience with drugs.', { health: -8, happiness: -6, craziness: 3 }, 'bad', '😵')
      out(g, 'Buzzed', 'You got high and spent three hours staring at your hand. You feel great now. Your body will disagree later.', 'I did some drugs.', { health: -5, happiness: 7, smarts: -1, condition: chance(g, 0.06) ? { name: 'Drug Addiction', kind: 'addiction', severity: 20 } : undefined }, 'neutral', '😵‍💫')
    },
  },
  {
    id: 'drink',
    re: /\b(drink|drunk|beer|wine|vodka|whiskey|booze|alcohol|shots|tequila|cocktail|hammered|wasted)\b/,
    minAge: 12,
    prison: true,
    run: (g) => {
      if (inPrison(g)) return out(g, 'Prison wine', 'You drank some toilet wine fermented from fruit cups. It tasted like regret and feet.', 'I drank homemade prison wine.', { health: -4, happiness: 4, behavior: -4 }, 'neutral', '🍷')
      if (!canDrink(g)) {
        const parent = peopleBy(g, ['parent', 'stepparent'])
        if (parent.length && chance(g, 0.35)) return out(g, 'Busted', 'You snuck some alcohol from the cabinet and got caught by your parents. You are grounded until the heat death of the universe.', 'My parents caught me drinking.', { happiness: -6, rels: parent.map((p) => ({ p, d: -8 })) }, 'bad', '🍺')
        return out(g, 'Underage', "You snuck a few drinks with friends. It tasted terrible, but you felt very grown-up.", 'I snuck some drinks while underage.', { happiness: 4, health: -2 }, 'neutral', '🍺')
      }
      if (chance(g, 0.25)) return out(g, 'Hungover', 'You drank way too much and woke up in a bathtub wearing one shoe.', 'I drank way too much and had a brutal hangover.', { health: -6, happiness: -2 }, 'bad', '🥴')
      out(g, ['Cheers!', 'Good times'], 'You had a few drinks and a great time.', 'I went out for a few drinks.', { happiness: 6, health: -2 }, 'good', '🍻')
    },
  },
  {
    id: 'party',
    re: /\b(party|club|clubbing|rave|nightclub|bar hop|go out|night out|disco)\b/,
    minAge: 13,
    run: (g) => {
      const adult = canDrink(g)
      if (adult) count(g, 'nightlife')
      if (chance(g, 0.15)) return out(g, 'Party foul', adult ? 'You went out partying and lost your phone, your wallet and your dignity.' : 'You went to a party that the police shut down after twenty minutes.', 'I went to a party that went off the rails.', { happiness: -3, health: -2 }, 'bad', '🎉')
      out(g, ['Party animal', 'What a night'], adult ? 'You partied until sunrise and danced on a table.' : 'You went to a party, danced badly and had a great time.', adult ? 'I partied all night.' : 'I went to a party with friends.', { happiness: randInt(g, 5, 10), health: -randInt(g, 1, 3) }, 'good', '🪩')
    },
  },
  {
    id: 'gamble',
    re: /\b(gamble|casino|bet|poker|blackjack|slots|roulette|lottery|scratch(er| ticket))\b/,
    minAge: 18,
    run: (g, a) => {
      const c = g.character
      if (c.money < 5) return out(g, 'Broke', "You don't have any money to gamble with. The casino bouncer could tell.", null, {}, 'neutral', '🎰')
      if (has(a, /\b(lottery|scratch)/)) {
        const cost = Math.min(c.money, 5)
        count(g, 'lotteryTickets')
        const win = chance(g, 0.08) ? dollars(g, 10, 500) : 0
        if (win) return out(g, 'Winner!', `You bought a lottery ticket and won ${money(win)}!`, `I won ${money(win)} on a lottery ticket.`, { money: win - cost, happiness: 8 }, 'good', '🎟️')
        return out(g, 'Not a winner', 'You bought a lottery ticket. It was not a winner. It never is.', 'I bought a lottery ticket and lost.', { money: -cost, happiness: -1 }, 'neutral', '🎟️')
      }
      const bet = affordable(g, dollars(g, 20, 500))
      count(g, 'moneyGambled', bet)
      if (chance(g, 0.42)) {
        count(g, 'casinoWins')
        return out(g, ['Jackpot', 'Lucky streak'], `You gambled ${money(bet)} and doubled it!`, `I won ${money(bet)} gambling.`, { money: bet, happiness: 8 }, 'good', '🎰')
      }
      count(g, 'casinoLosses')
      out(g, ['House wins', 'Busted'], `You gambled ${money(bet)} and lost every cent.`, `I lost ${money(bet)} gambling.`, { money: -bet, happiness: -6 }, 'bad', '🎰')
    },
  },
  {
    id: 'travel',
    re: /\b(travel|vacation|holiday|trip|fly to|visit (paris|london|tokyo|rome|new york|europe|asia|africa|mexico|japan|italy|spain|france)|road trip|cruise|backpack)\b/,
    minAge: 4,
    run: (g, a) => {
      const c = g.character
      if (c.age < 18) {
        const yes = chance(g, 0.3)
        return out(g, yes ? 'Family trip' : 'Maybe next year', yes ? 'You begged your parents for a trip and they actually agreed! You spent a few days at a lake and came back sunburned and happy.' : 'You begged your parents to take you on a trip. They said "maybe next year," which means no.', yes ? 'My family took a trip after I begged for one.' : 'I begged my parents for a vacation.', yes ? { happiness: 8 } : { happiness: -2 }, yes ? 'good' : 'neutral', '🧳')
      }
      const cost = dollars(g, has(a, /cruise|europe|asia|tokyo|paris|london|rome|japan|italy|france|spain/) ? 1200 : 300, 3000)
      if (c.money < cost) return out(g, 'Staycation', `You couldn't afford a ${money(cost)} trip, so you pitched a tent in your living room and called it camping.`, 'I had a staycation because I was broke.', { happiness: 2 }, 'neutral', '⛺')
      count(g, 'vacations')
      if (chance(g, 0.12)) return out(g, 'Travel nightmare', `You spent ${money(cost)} on a trip, the airline lost your luggage, and it rained every day.`, `I took a ${money(cost)} trip that was a total disaster.`, { money: -cost, happiness: -3 }, 'bad', '🌧️')
      out(g, ['Bon voyage', 'Wanderlust'], `You spent ${money(cost)} on a trip and had the time of your life. You took 800 photos and will look at none of them.`, `I spent ${money(cost)} on a great trip.`, { money: -cost, happiness: randInt(g, 8, 14), health: 2 }, 'good', '✈️')
    },
  },
  {
    id: 'donate',
    re: /\b(donate|charity|give money|give away)\b/,
    minAge: 6,
    run: (g) => {
      const c = g.character
      const amt = affordable(g, c.age < 18 ? dollars(g, 1, 20) : dollars(g, 20, 500))
      if (amt === 0) return out(g, 'Good intentions', "You wanted to donate to charity but didn't have any money. You donated a smile instead. It counts. Kind of.", 'I wanted to donate to charity but was broke.', { karma: 2 }, 'neutral', '🤲')
      count(g, 'donated')
      out(g, ['Generous', 'Good karma'], `You donated ${money(amt)} to a local charity. You got a thank-you card with a cartoon panda on it.`, `I donated ${money(amt)} to charity.`, { money: -amt, karma: amt >= 100 ? 8 : 5, happiness: 4 }, 'good', '🤲')
    },
  },
  {
    id: 'volunteer',
    re: /\b(volunteer|soup kitchen|help (the )?(homeless|poor|needy|elderly|community)|community service)\b/,
    minAge: 8,
    run: (g) => out(g, ['Volunteer', 'Helping hands'], pick(g, ['You volunteered at a soup kitchen and served 200 bowls of chili.', 'You volunteered at an animal shelter and walked fourteen dogs.', 'You spent the day picking up trash at the park with a volunteer group.']), 'I volunteered in my community.', { karma: 8, happiness: 5 }, 'good', '🤝'),
  },
  {
    id: 'adoptPet',
    re: /\b(adopt|get|buy)\b.*\b(dog|puppy|cat|kitten|pet|hamster|rabbit|bunny|parrot|fish|snake|lizard|turtle)\b/,
    minAge: 5,
    run: (g, a) => {
      const c = g.character
      const species = has(a, /dog|puppy/) ? 'Dog' : has(a, /cat|kitten/) ? 'Cat' : has(a, /hamster/) ? 'Hamster' : has(a, /rabbit|bunny/) ? 'Rabbit' : has(a, /parrot/) ? 'Parrot' : has(a, /fish/) ? 'Fish' : has(a, /snake/) ? 'Snake' : has(a, /lizard/) ? 'Lizard' : has(a, /turtle/) ? 'Turtle' : pick(g, ['Dog', 'Cat'])
      const name = pick(g, ['Biscuit', 'Pickles', 'Noodle', 'Waffles', 'Mochi', 'Pepper', 'Ziggy', 'Bean', 'Muffin', 'Gizmo', 'Taco', 'Luna'])
      const sp = species.toLowerCase()
      if (inPrison(g)) return out(g, 'No pets', 'Pets are not allowed in prison. You befriended a cockroach named Steve instead.', 'I befriended a cockroach in my cell.', { happiness: 2 }, 'neutral', '🪳')
      if (c.age < 18) {
        if (!chance(g, 0.25)) return out(g, 'Not allowed', `You begged your parents for a ${sp}. They said you'd have to prove you can take care of a houseplant first.`, `I begged my parents for a ${sp}.`, { happiness: -2 }, 'neutral', '🐾')
        createPerson(g, { relation: 'pet', age: randInt(g, 0, 2), firstName: name, species, livesWithPlayer: true, relationship: 80 })
        count(g, 'pets')
        return out(g, 'New pet!', `You begged your parents for a ${sp} and they finally gave in! You named it ${name}.`, `My parents let me adopt a ${sp} named ${name}.`, { happiness: 10 }, 'good', '🐾')
      }
      const cost = dollars(g, 50, 400)
      if (c.money < cost) return out(g, "Can't afford it", `The adoption fee was ${money(cost)}, which you don't have. You petted every animal at the shelter instead.`, 'I visited the animal shelter but could not afford to adopt.', { happiness: 1 }, 'neutral', '🐾')
      createPerson(g, { relation: 'pet', age: randInt(g, 0, 6), firstName: name, species, livesWithPlayer: true, relationship: 75 })
      count(g, 'pets')
      out(g, 'New best friend', `You paid ${money(cost)} and brought home a ${sp} named ${name}.`, `I adopted a ${sp} named ${name}.`, { money: -cost, happiness: 10 }, 'good', '🐾')
    },
  },
  {
    id: 'pet',
    re: /\b(walk|play with|pet|feed|cuddle|groom|train)\b.*\b(dog|cat|pet|puppy|kitten|hamster|rabbit|bird|parrot|horse|snake)\b/,
    minAge: 3,
    run: (g) => {
      const list = pets(g)
      if (!list.length) return out(g, 'Petless', "You don't have a pet, so you played with the neighbor's dog through the fence. It was the best part of your week.", "I played with the neighbor's dog.", { happiness: 3 }, 'good', '🐕')
      const p = pick(g, list)
      addRelationship(p, randInt(g, 5, 10))
      out(g, ['Good pet', 'Best friend'], `You spent the afternoon with your ${relTo(p)}, ${p.firstName}. ${p.firstName} could not have been happier.`, `I spent quality time with my ${relTo(p)}, ${p.firstName}.`, { happiness: 5 }, 'good', '🐾')
    },
  },
  {
    id: 'date',
    re: /\b(date|flirt|ask (someone|her|him|them) out|kiss|romance|romantic|hook up|find love|girlfriend|boyfriend)\b/,
    minAge: 13,
    run: (g) => {
      const p = currentPartner(g)
      if (p) {
        addRelationship(p, randInt(g, 5, 10))
        return out(g, ['Date night', 'Romance'], `You took ${p.firstName} out for a romantic evening. ${pick(g, ['You split a dessert the size of a hubcap.', 'You walked home holding hands.', 'You laughed until the restaurant asked you to leave.'])}`, `I had a romantic night out with ${p.firstName}.`, { happiness: 6 }, 'good', '💕')
      }
      if (inGradeSchool(g) && g.character.age < 16 && chance(g, 0.5)) return out(g, 'Crush', 'You worked up the courage to talk to your crush and said "you too" when they said "have a good weekend." Nailed it.', 'I tried talking to my crush and fumbled it.', { happiness: -2 }, 'neutral', '😳')
      if (chance(g, 0.35)) {
        // applyEffects enforces romantic eligibility (age gaps, orientation, minors) and
        // downgrades to a friendship when a relationship wouldn't be appropriate.
        const before = g.people.length
        applyEffects(g, { newPerson: { relation: 'partner', gender: preferredGender(g), age: Math.max(14, g.character.age + randInt(g, -2, 2)) } })
        const met = g.people.length > before ? g.people[g.people.length - 1] : undefined
        if (met && met.relation === 'partner') {
          return out(g, ['Sparks!', 'Love is in the air'], `You put yourself out there and hit it off with ${met.firstName}! You're officially dating.`, `I started dating ${met.firstName} ${met.lastName}.`, { happiness: 8, count: 'partners' }, 'good', '💘')
        }
        if (met) return out(g, 'New friend', `You put yourself out there and met ${met.firstName}. No sparks, but you became friends.`, `I made a new friend, ${met.firstName}, while looking for love.`, { happiness: 4 }, 'good', '🤝')
      }
      out(g, ['Rejected', 'Swing and a miss'], pick(g, ['You asked someone out and they said they were "focusing on themselves" while texting someone else.', 'You flirted with a stranger at the coffee shop. They asked if you were okay.', 'You tried a pickup line. It did not work. It never works.']), 'I tried to find love and struck out.', { happiness: -4 }, 'bad', '💔')
    },
  },
  {
    id: 'family',
    re: /\b(call|visit|hug|thank|apologi[sz]e|hang out|spend time|talk|text|forgive|bond|play)\b/,
    minAge: 3,
    prison: true,
    run: (g, a) => {
      const p = namedPerson(g, a) ?? roleTarget(g, a)
      if (!p) return generic(g, a)
      if (p.relation === 'pet') {
        addRelationship(p, randInt(g, 4, 8))
        return out(g, 'Good pet', `You spent time with your ${relTo(p)}, ${p.firstName}. Tail wags were had.`, `I spent time with my ${relTo(p)}, ${p.firstName}.`, { happiness: 4 }, 'good', '🐾')
      }
      if (inPrison(g) && !['cellmate'].includes(p.relation)) {
        addRelationship(p, randInt(g, 2, 6))
        return out(g, 'Collect call', `You made a collect call from prison to your ${relTo(p)}, ${p.firstName}. It was short, but it meant a lot.`, `I called my ${relTo(p)}, ${p.firstName}, from prison.`, { happiness: 4 }, 'good', '📞')
      }
      const sorry = has(a, /apologi[sz]e|forgive/)
      addRelationship(p, sorry ? randInt(g, 6, 12) : randInt(g, 3, 8))
      out(
        g,
        sorry ? 'Making amends' : ['Quality time', 'Family first'],
        sorry ? `You apologized to your ${relTo(p)}, ${p.firstName}. ${p.firstName} accepted, and things feel lighter now.` : pick(g, [`You spent the day with your ${relTo(p)}, ${p.firstName}. It was exactly what you both needed.`, `You and your ${relTo(p)}, ${p.firstName}, talked for hours.`, `You hung out with your ${relTo(p)}, ${p.firstName}, and laughed more than you have in months.`]),
        sorry ? `I apologized to my ${relTo(p)}, ${p.firstName}.` : `I spent quality time with my ${relTo(p)}, ${p.firstName}.`,
        { happiness: 4 },
        'good',
        sorry ? '🕊️' : '❤️',
      )
    },
  },
  {
    id: 'insult',
    re: /\b(insult|yell at|argue|roast|mock|scream at|curse at|prank|troll)\b/,
    minAge: 4,
    prison: true,
    run: (g, a) => {
      const p = namedPerson(g, a) ?? roleTarget(g, a)
      const prank = has(a, /prank|troll/)
      if (prank) count(g, 'pranks')
      else count(g, 'insults')
      if (p && p.relation !== 'pet') {
        addRelationship(p, -randInt(g, prank ? 2 : 6, prank ? 8 : 14))
        return out(g, prank ? 'Gotcha!' : 'Ouch', prank ? `You pranked your ${relTo(p)}, ${p.firstName}, with ${pick(g, ['a whoopee cushion', 'plastic wrap on the toilet', 'salt in the sugar bowl', 'a fake spider'])}. ${p.firstName} was not amused.` : `You told your ${relTo(p)}, ${p.firstName}, exactly what you think of ${p.gender === 'male' ? 'him' : 'her'}. It did not go well.`, prank ? `I pranked my ${relTo(p)}, ${p.firstName}.` : `I insulted my ${relTo(p)}, ${p.firstName}.`, { happiness: prank ? 4 : 1, karma: -2 }, 'neutral', prank ? '😜' : '😤')
      }
      out(g, prank ? 'Prankster' : 'Hothead', prank ? 'You pulled a prank on a stranger. They chased you for two blocks.' : 'You yelled at a stranger for walking too slowly. They walked even slower.', prank ? 'I pranked a stranger.' : 'I yelled at a stranger.', { happiness: 2, karma: -2 }, 'neutral', prank ? '😜' : '😤')
    },
  },
  {
    id: 'skipSchool',
    re: /\b(skip|ditch|cut|play hooky)\b.*\b(school|class|classes|lecture)\b|\bplay hooky\b/,
    minAge: 6,
    run: (g) => {
      if (!g.character.education.current) return out(g, 'No school', "You're not in school, so you skipped nothing. You took a nap in honor of the idea.", null, { happiness: 1 }, 'neutral', '😴')
      count(g, 'skippedSchool')
      if (chance(g, 0.3)) return out(g, 'Caught', 'You skipped class and ran straight into the principal at the mall. Detention for a month.', 'I got caught skipping school.', { grades: -4, happiness: -4 }, 'bad', '🏫')
      out(g, 'Freedom', 'You skipped class and spent the day at the arcade. Totally worth it. Probably.', 'I skipped school.', { grades: -3, happiness: 5 }, 'neutral', '🕹️')
    },
  },
  {
    id: 'cheat',
    re: /\b(cheat|plagiari[sz]e|copy homework|lie|fake|forge)\b/,
    minAge: 6,
    prison: true,
    run: (g) => {
      if (chance(g, 0.3)) return out(g, 'Caught', 'You got caught in a web of your own lies. Nobody trusts you right now.', 'I got caught lying.', { karma: -6, happiness: -4, grades: -3 }, 'bad', '🤥')
      out(g, 'Sneaky', 'You got away with it. Your conscience, however, is filing a complaint.', 'I got away with a little dishonesty.', { karma: -5, happiness: 2 }, 'neutral', '🤥')
    },
  },
  {
    id: 'runAway',
    re: /\b(run away|runaway|leave home|move out)\b/,
    minAge: 6,
    run: (g) => {
      const c = g.character
      if (c.age >= 18) return out(g, 'Fresh start', 'You looked at apartments online for an hour and felt very independent. (Housing is in the Assets menu.)', 'I daydreamed about moving somewhere new.', { happiness: 1 }, 'neutral', '🏠')
      const ps = peopleBy(g, ['parent', 'stepparent'])
      out(g, 'Runaway', pick(g, ['You packed a backpack with snacks and ran away. You made it to the end of the block before getting hungry and coming home.', 'You ran away and spent the night at a friend’s house. Your parents were frantic.']), 'I ran away from home, briefly.', { happiness: 2, rels: ps.map((p) => ({ p, d: -6 })) }, 'neutral', '🎒')
    },
  },
  {
    id: 'study',
    re: /\b(study|homework|learn|read|book|library|practice|research|revise|take a class|course|code|program)\b/,
    minAge: 4,
    prison: true,
    run: (g, a) => {
      const c = g.character
      if (has(a, /library/)) count(g, 'library')
      count(g, 'studied')
      const smarts = randInt(g, 1, 4)
      if (inPrison(g)) return out(g, 'Self-improvement', 'You spent your free time studying in the prison library.', 'I studied in prison.', { smarts, behavior: 3 }, 'good', '📚')
      if (c.age < 6) return out(g, 'Little scholar', 'You "read" a picture book upside down for an hour. Your parents were very impressed.', 'I read a picture book.', { smarts: 1, happiness: 2 }, 'good', '📖')
      const school = c.education.current
      out(g, ['Hit the books', 'Big brain'], school ? `You studied hard for your classes at ${school.school}.` : `You decided to ${you(a.phrase)}. Your brain feels bigger.`, school ? 'I studied hard.' : `I decided to ${a.phrase}.`, { smarts, grades: school ? randInt(g, 3, 7) : 0, happiness: -1 }, 'good', '📚')
    },
  },
  {
    id: 'exercise',
    re: /\b(exercise|work ?out|gym|run|jog|lift|weights|push-?ups|sit-?ups|swim|yoga|pilates|hike|bike|cycle|sports?|basketball|soccer|football|tennis|train|cardio|marathon|walk|stretch|martial arts|karate|boxing)\b/,
    minAge: 3,
    prison: true,
    run: (g, a) => {
      const c = g.character
      if (has(a, /\bgym\b/)) count(g, 'gym')
      if (has(a, /\bwalk\b/)) count(g, 'walks')
      addHidden(g, 'athleticism', randInt(g, 1, 3))
      if (c.age < 6) return out(g, 'Zoomies', 'You ran around the backyard in circles until you fell over giggling.', 'I ran around the backyard until I was dizzy.', { health: 2, happiness: 3 }, 'good', '🏃')
      if (inPrison(g)) return out(g, 'Yard workout', 'You worked out in the prison yard. The other inmates noticed your dedication.', 'I worked out in the prison yard.', { health: randInt(g, 2, 5), looks: 1, respect: 2 }, 'good', '💪')
      if (chance(g, c.age >= 60 ? 0.12 : 0.05)) return out(g, 'Injured', 'You pushed a little too hard and pulled a muscle.', 'I pulled a muscle working out.', { health: -4, happiness: -3, condition: { name: 'Pulled Muscle', kind: 'injury', severity: 8 } }, 'bad', '🤕')
      out(g, ['Feeling the burn', 'Healthy choice'], pick(g, [`You decided to ${you(a.phrase)}. You're sweaty, sore and proud.`, `You decided to ${you(a.phrase)} and felt amazing afterward.`]), `I decided to ${a.phrase}.`, { health: randInt(g, 2, 5), happiness: randInt(g, 1, 4), looks: chance(g, 0.4) ? 1 : 0 }, 'good', '💪')
    },
  },
  {
    id: 'meditate',
    re: /\b(meditate|meditation|pray|prayer|church|temple|mosque|synagogue|worship|mindfulness)\b/,
    minAge: 5,
    prison: true,
    run: (g, a) => {
      const religious = has(a, /pray|church|temple|mosque|synagogue|worship/)
      if (!religious) count(g, 'meditate')
      out(g, religious ? 'Faithful' : 'Inner peace', religious ? 'You spent some quiet time in prayer and came away feeling lighter.' : 'You sat cross-legged, breathed deeply and found a moment of calm.', religious ? 'I spent some time praying.' : 'I meditated.', { happiness: randInt(g, 3, 6), health: 1, religiousness: religious ? 3 : 0, behavior: inPrison(g) ? 2 : 0 }, 'good', religious ? '🙏' : '🧘')
    },
  },
  {
    id: 'cook',
    re: /\b(cook|bake|grill|recipe|make (dinner|lunch|breakfast|a cake|cookies|pizza|soup))\b/,
    minAge: 6,
    run: (g, a) => {
      if (chance(g, 0.08)) return out(g, 'Kitchen disaster', 'You set off every smoke alarm in the building. Dinner was cereal.', 'I nearly burned down the kitchen while cooking.', { happiness: -3, health: -1 }, 'bad', '🔥')
      out(g, ['Chef’s kiss', 'Delicious'], `You decided to ${you(a.phrase)}. It turned out ${pick(g, ['delicious', 'surprisingly edible', 'restaurant quality, if you ask yourself', 'a little burnt, but full of love'])}.`, `I decided to ${a.phrase}.`, { happiness: randInt(g, 2, 5), health: 1 }, 'good', '🍳')
    },
  },
  {
    id: 'music',
    re: /\b(sing|song|karaoke|guitar|piano|drums|violin|instrument|rap|band|music|dance|dancing)\b/,
    minAge: 3,
    prison: true,
    run: (g, a) => {
      const c = g.character
      if (c.age >= 13 && !inPrison(g) && chance(g, 0.05)) return out(g, 'Viral!', `Someone filmed you as you decided to ${you(a.phrase)} and it went viral!`, 'A video of me went viral.', { happiness: 8, fame: 3 }, 'good', '🌟')
      out(g, ['Music to my ears', 'Encore'], pick(g, [`You decided to ${you(a.phrase)}. It sounded ${pick(g, ['incredible', 'mostly in tune', 'like a cat in a dryer, but you had fun'])}.`, `You decided to ${you(a.phrase)} and lost track of time.`]), `I decided to ${a.phrase}.`, { happiness: randInt(g, 3, 6) }, 'good', '🎵')
    },
  },
  {
    id: 'art',
    re: /\b(draw|paint|sketch|write|poem|poetry|novel|story|journal|art|craft|knit|sculpt|photograph)\b/,
    minAge: 3,
    prison: true,
    run: (g, a) => out(g, ['Artist', 'Creative streak'], `You decided to ${you(a.phrase)}. ${pick(g, ['It turned out better than expected.', 'It is not a masterpiece, but it is yours.', 'You are calling it "abstract."'])}`, `I decided to ${a.phrase}.`, { happiness: randInt(g, 2, 5), smarts: chance(g, 0.5) ? 1 : 0 }, 'good', '🎨'),
  },
  {
    id: 'shop',
    re: /\b(shop|shopping|mall|buy|splurge|treat myself)\b/,
    minAge: 5,
    run: (g, a) => {
      const c = g.character
      if (c.age < 14) return out(g, 'Window shopping', 'You dragged your parents to the toy store and stared at things you cannot have.', 'I went window shopping at the toy store.', { happiness: 1 }, 'neutral', '🛍️')
      const cost = dollars(g, 20, 400)
      if (c.money < cost) return out(g, 'Window shopping', "You went shopping but couldn't afford anything. You tried on a hat and put it back.", 'I went window shopping because I was broke.', { happiness: 1 }, 'neutral', '🛍️')
      out(g, ['Retail therapy', 'Treat yourself'], `You decided to ${you(a.phrase)} and spent ${money(cost)}. Worth it.`, `I went shopping and spent ${money(cost)}.`, { money: -cost, happiness: randInt(g, 3, 6), looks: chance(g, 0.3) ? 1 : 0 }, 'good', '🛍️')
    },
  },
  {
    id: 'looks',
    re: /\b(haircut|hair|makeover|makeup|nails|manicure|spa|tan|facial|skincare|tattoo|piercing|dye)\b/,
    minAge: 6,
    run: (g, a) => {
      const c = g.character
      const ink = has(a, /tattoo|piercing/)
      if (ink && c.age < 16) return out(g, 'Too young', 'No tattoo parlor would let you in. You drew one on with a marker instead.', 'I drew a fake tattoo on my arm with a marker.', { happiness: 2 }, 'neutral', '🖊️')
      const cost = affordable(g, c.age < 18 ? 0 : dollars(g, 30, ink ? 300 : 150))
      if (chance(g, 0.15)) return out(g, 'Regret', ink ? 'Your tattoo is misspelled. It is permanent.' : 'It did not turn out the way you pictured. At all.', ink ? 'I got a tattoo I regret.' : 'I got a makeover I regret.', { money: -cost, looks: -2, happiness: -4 }, 'bad', '😬')
      out(g, ['Glow up', 'Looking good'], `You decided to ${you(a.phrase)}${cost ? ` and spent ${money(cost)}` : ''}. You look great.`, `I decided to ${a.phrase}.`, { money: -cost, looks: randInt(g, 1, 3), happiness: 3 }, 'good', '💇')
    },
  },
  {
    id: 'junkFood',
    re: /\b(eat|pizza|burger|fries|candy|chocolate|ice cream|donut|fast food|junk food|snack|cake|binge)\b/,
    minAge: 2,
    prison: true,
    run: (g, a) => {
      if (has(a, /salad|vegetable|healthy|fruit|diet/)) return healthy(g)
      out(g, ['Delicious', 'Comfort food'], `You decided to ${you(a.phrase)}. ${pick(g, ['No regrets.', 'Some regrets.', 'Your stomach is making noises.'])}`, `I decided to ${a.phrase}.`, { happiness: randInt(g, 2, 5), health: -randInt(g, 0, 2) }, 'good', '🍕')
    },
  },
  {
    id: 'diet',
    re: /\b(diet|salad|vegetables|healthy|vegan|vegetarian|fast|detox|lose weight)\b/,
    minAge: 6,
    prison: true,
    run: (g) => healthy(g),
  },
  {
    id: 'rest',
    re: /\b(sleep|nap|rest|relax|chill|lie down|bath|take it easy|do nothing)\b/,
    minAge: 0,
    prison: true,
    run: (g) => out(g, ['Recharged', 'Well rested'], pick(g, ['You took the most glorious nap of your life.', 'You did absolutely nothing all day, and it was wonderful.', 'You took a long bath and listened to rain sounds.']), 'I took a day to rest and recharge.', { happiness: randInt(g, 2, 5), health: randInt(g, 1, 2) }, 'good', '😴'),
  },
  {
    id: 'screens',
    re: /\b(video games?|gaming|play games|tv|television|netflix|movie|movies|cinema|stream|youtube|anime|cartoons?)\b/,
    minAge: 3,
    prison: true,
    run: (g, a) => out(g, ['Screen time', 'Entertained'], `You decided to ${you(a.phrase)}. ${pick(g, ['Hours vanished.', 'You told yourself "just one more."', 'It was the highlight of your week.'])}`, `I decided to ${a.phrase}.`, { happiness: randInt(g, 2, 5), smarts: chance(g, 0.3) ? -1 : 0 }, 'good', '🎮'),
  },
  {
    id: 'social',
    re: /\b(post|selfie|instagram|tiktok|social media|vlog|influencer|tweet|go viral)\b/,
    minAge: 10,
    run: (g) => {
      if (chance(g, 0.06)) return out(g, 'Viral!', 'Your post blew up overnight. Thousands of strangers now have opinions about you.', 'One of my posts went viral.', { happiness: 6, fame: 3 }, 'good', '📈')
      out(g, ['Posted', 'Likes'], pick(g, ['You posted online and got eleven likes, four of them from relatives.', 'You posted a selfie. Your aunt commented "beautiful!!!"', 'You posted something clever. Nobody got it.']), 'I posted on social media.', { happiness: 2 }, 'neutral', '📱')
    },
  },
  {
    id: 'chores',
    re: /\b(clean|chores|laundry|dishes|vacuum|tidy|organi[sz]e|garden|mow|yard work)\b/,
    minAge: 4,
    prison: true,
    run: (g) => {
      const ps = g.character.age < 18 ? peopleBy(g, ['parent', 'stepparent']) : []
      out(g, ['Spotless', 'Productive'], ps.length ? 'You did chores without being asked. Your parents checked your temperature.' : 'You cleaned and organized until everything sparkled.', 'I did a bunch of chores.', { happiness: 2, behavior: inPrison(g) ? 2 : 0, rels: ps.map((p) => ({ p, d: 4 })) }, 'good', '🧹')
    },
  },
]

function healthy(g: GameState): void {
  out(g, ['Healthy choice', 'Clean eating'], pick(g, ['You ate nothing but vegetables for a week. You feel amazing and a little sad.', 'You swapped junk food for salads. Your body sent a thank-you note.']), 'I started eating healthier.', { health: randInt(g, 2, 4), happiness: -1, looks: chance(g, 0.3) ? 1 : 0 }, 'good', '🥗')
}

/** Anything the rules don't recognize: a mild, plausible outcome. */
function generic(g: GameState, a: Act): void {
  const roll = randInt(g, 1, 100)
  const action = you(a.phrase)
  if (roll <= 45) {
    return out(g, pick(g, ['Nice!', 'Well done', 'Not bad']), pick(g, [`You decided to ${action}. It went better than expected.`, `You decided to ${action}, and honestly? Good call.`, `You decided to ${action}. You feel pretty good about it.`]), `I decided to ${a.phrase}.`, { happiness: randInt(g, 2, 5) }, 'good', '✨')
  }
  if (roll <= 75) {
    return out(g, pick(g, ['Interesting choice', 'Well, okay', 'Huh']), pick(g, [`You decided to ${action}. Nothing much came of it, but now you can say you did.`, `You decided to ${action}. A passing pigeon was unimpressed.`, `You decided to ${action}. It was an afternoon.`]), `I decided to ${a.phrase}.`, { happiness: randInt(g, 0, 2) }, 'neutral', '🤔')
  }
  if (roll <= 92) {
    return out(g, pick(g, ['Oops', 'That backfired', 'Well, that happened']), pick(g, [`You decided to ${action}. It did not go as planned.`, `You decided to ${action}. Several people saw. You will be thinking about it at 3 AM for years.`]), `I decided to ${a.phrase}. It didn't go well.`, { happiness: -randInt(g, 2, 5) }, 'bad', '😬')
  }
  out(g, 'Unexpected', `You decided to ${action}, and somehow made a new friend in the process.`, `I made a new friend while trying to ${a.phrase}.`, { happiness: 4 }, 'good', '🤝')
  if (g.character.age >= 4 && !inPrison(g)) {
    createPerson(g, { relation: 'friend', age: Math.max(4, g.character.age + randInt(g, -3, 3)), relationship: 55 })
  }
}

/** What a baby/toddler does instead of the typed action. */
function tooYoung(g: GameState, a: Act, minAge: number): void {
  const age = g.character.age
  if (age < 3) {
    return out(g, pick(g, ['Goo goo', 'Baby business', 'Nap time']), pick(g, [`You tried to ${you(a.phrase)}, but you're a baby. You ${pick(g, ['drooled on a blanket', 'fell asleep mid-thought', 'ate a sock', 'cried until someone brought a bottle'])} instead.`, `You had big plans to ${you(a.phrase)}. Then you remembered you can't hold your own head up.`]), 'I had big ambitions for a baby.', { happiness: 1 }, 'neutral', '👶')
  }
  out(g, 'Too young', pick(g, [`You're only ${age}. You can ${you(a.phrase)} when you're ${minAge}. For now, you ${pick(g, ['played with blocks', 'colored outside the lines', 'watched cartoons', 'built a pillow fort'])} instead.`, `Your parents laughed when you announced you'd ${you(a.phrase)}. Maybe when you're older.`]), null, { happiness: 1 }, 'neutral', '🧸')
}

/** Resolve a free-form "Do Anything" action offline. Counts 'customActions'. */
export function resolveCustomAction(g: GameState, text: string): void {
  const c = g.character
  if (!c.alive) return
  count(g, 'customActions')
  const raw = clean(text)
  if (!raw) {
    return out(g, 'Indecisive', "You thought long and hard about doing something, then didn't. A bold choice.", null, {}, 'neutral', '🤷')
  }
  const a: Act = { raw, low: raw.toLowerCase(), phrase: toPhrase(raw) }
  const rule = RULES.find((r) => r.re.test(a.low))
  if (c.age < 3 && rule?.id !== 'rest') return tooYoung(g, a, rule?.minAge ?? 5)
  if (inPrison(g) && !(rule?.prison ?? false)) {
    return out(g, pick(g, ['Behind bars', 'Not in here']), pick(g, [`You'd love to ${you(a.phrase)}, but you're in prison. You stared at the wall instead.`, `You can't ${you(a.phrase)} from a prison cell. A guard told you to keep dreaming.`]), null, { happiness: -1 }, 'neutral', '🔒')
  }
  if (!rule) return generic(g, a)
  if (rule.minAge !== undefined && c.age < rule.minAge) return tooYoung(g, a, rule.minAge)
  rule.run(g, a)
}

/** Exposed for tests. */
export const CUSTOM_RULE_IDS = RULES.map((r) => r.id)
