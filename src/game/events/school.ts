// School & university events: bullies, class clowns, cheating requests, school plays,
// science fairs, pep rallies, dances, prom, all-nighters and roommates.
import { preferredGender } from '../core'
import { applyEffects } from '../effects'
import { createPerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { pickLine } from '../text/pick'
import type { GameState, Person } from '../types'
import { locale } from '../data/locales'
import {
  aParent,
  anyOf,
  canDrink,
  ch,
  conservativeSchooling,
  hangout,
  isUS,
  loc,
  peClass,
  term,
  titleOf,
  defineEvents,
  dollars,
  friends,
  inGradeSchool,
  inHighSchool,
  inUniversity,
  money,
  partner,
  pr,
  say,
  siblings,
  strangerName,
  type Ctx,
  v,
} from './helpers'
import { common, declined, eraLines } from './era'

/** A classmate from the contacts, or a made-up one (not added to contacts). */
function classmate(g: GameState): { p: Person | undefined; first: string; last: string; gender: 'male' | 'female' } {
  const list = g.people.filter((p) => p.alive && p.relation === 'classmate')
  if (list.length && chance(g, 0.7)) {
    const p = pick(g, list)
    return { p, first: p.firstName, last: p.lastName, gender: p.gender }
  }
  const s = strangerName(g)
  return { p: undefined, first: s.first, last: s.last, gender: s.gender }
}

function classmateData(c: ReturnType<typeof classmate>) {
  return { first: c.first, last: c.last, gender: c.gender }
}

/** Turn the event's classmate into an enemy (existing contact or a new one). */
function makeEnemy(g: GameState, x: Ctx): Person {
  if (x.p) {
    x.p.relationship = Math.min(x.p.relationship, 15)
    if (x.p.relation === 'classmate') x.p.relation = 'enemy'
    return x.p
  }
  return createPerson(g, { relation: 'enemy', age: g.character.age, firstName: x.s('first'), lastName: x.s('last'), gender: x.s('gender') === 'male' ? 'male' : 'female', relationship: 10 })
}

function teacher(g: GameState): string {
  const s = strangerName(g)
  return `${s.gender === 'male' ? 'Mr.' : pick(g, ['Mrs.', 'Ms.'])} ${s.last}`
}

const BULLY_ACTIONS = [
  'keeps taking your lunch money',
  'told everyone you smell like old tuna',
  'farted in class and blamed it on you',
  'spread a rumor that you still sleep with a nightlight',
  "won't let you play with anyone at recess",
  'gave you a wedgie in the bathroom this morning',
  'made fun of your haircut in front of the whole class',
  'vandalized your locker and blamed it on you',
  'keeps tripping you in the hallway',
  'turned your friends against you',
  'mocks your accent every single day',
]

const CLOWN_ACTS = [
  'is making fart noises with their armpit',
  '@1930 put a whoopee cushion on the teacher\'s chair',
  '@1990 is throwing spitballs at the whiteboard',
  '@-1990 is throwing spitballs at the chalkboard',
  'keeps answering every question with "your mom"',
  'released a frog in the classroom',
  'is doing an impression of the teacher behind their back',
]

/** School plays: the Anglo-American classics, Christmas ones only where Christmas is big, plus local favorites. */
const LOCAL_PLAYS: Record<string, string[]> = {
  jp: ['Momotaro', 'The Tale of the Bamboo Cutter'],
  kr: ['The Tale of Chunhyang', 'Heungbu and Nolbu'],
  cn: ['Journey to the West', 'Mulan'],
  tw: ['Journey to the West', 'The Butterfly Lovers'],
  hk: ['Journey to the West', 'The Butterfly Lovers'],
  in: ['the Ramayana', 'Shakuntala'],
  id: ['Malin Kundang', 'Timun Mas'],
  my: ['Hang Tuah', 'Sang Kancil'],
  ph: ['Ibong Adarna', 'Noli Me Tángere'],
  tr: ['Nasreddin Hodja', 'Karagöz and Hacivat'],
  ir: ['Rostam and Sohrab', 'Layla and Majnun'],
  eg: ['Aladdin', 'Ali Baba and the Forty Thieves'],
  sa: ['Aladdin', 'Sinbad the Sailor'],
  ng: ['Things Fall Apart', 'The Lion and the Jewel'],
  ru: ['The Snow Maiden', 'The Twelve Months'],
  de: ['Hansel and Gretel', 'The Bremen Town Musicians'],
  fr: ['The Little Prince', 'Cyrano de Bergerac'],
  mx: ['La Pastorela', 'The Legend of the Volcanoes'],
  br: ['The Little Prince', 'Saci-Pererê'],
  gr: ['The Odyssey', 'Antigone'],
  it: ['Pinocchio', 'Romeo and Juliet'],
  es: ['Don Quixote', 'Platero and I'],
}

/** Local plays written in the twentieth century (by year first staged or published). */
const PLAY_SINCE: Record<string, number> = { 'The Little Prince': 1945, 'Things Fall Apart': 1960, 'The Lion and the Jewel': 1960, 'Platero and I': 1915 }

function schoolPlays(g: GameState): string[] {
  // Era tags: only plays that had been written by this year (Annie is a seventies musical).
  const base = ['@1905 Peter Pan', 'The Wizard of Oz', 'Romeo and Juliet', '@1977 Annie', '@1987 Into the Woods', 'A Midsummer Night’s Dream']
  const christmas = locale(g).holidays.some((h) => /Christmas/i.test(h)) ? ['@1990 The Nutcracker Prince', 'A Christmas Carol'] : []
  const local = (LOCAL_PLAYS[g.character.countryId] ?? []).map((p) => (PLAY_SINCE[p] ? `@${PLAY_SINCE[p]} ${p}` : p))
  return eraLines(g, [...base, ...christmas, ...local, ...local])
}

export const SCHOOL_EVENTS = defineEvents([
  {
    id: 'school.bully',
    emoji: '👊',
    title: 'Bully',
    minAge: 6,
    maxAge: 17,
    cooldown: 4,
    weight: 12,
    when: inGradeSchool,
    setup: (g) => {
      const b = classmate(g)
      const older = siblings(g).find((s) => s.age > g.character.age && s.age < 30)
      return {
        text: `A bully named ${b.first} ${b.last} ${pickLine(g, BULLY_ACTIONS)}. What will you do?`,
        choices: [ch('assault', `Assault ${b.gender === 'male' ? 'him' : 'her'}`), ch('report', 'Report them to the principal'), ch('talk', 'Have a talk with them'), ...(older ? [ch('sibling', `Tell my ${older.gender === 'male' ? 'brother' : 'sister'}, ${older.firstName}`)] : []), ch('nothing', 'Do nothing about it')],
        person: b.p,
        other: older,
        data: classmateData(b),
      }
    },
    resolve: {
      assault: (g, x) => {
        const win = chance(g, 0.35 + g.character.hidden.athleticism / 200 + g.character.stats.health / 400)
        const suspended = chance(g, 0.3)
        const enemy = makeEnemy(g, x)
        say(
          g,
          x,
          win ? ['Justice served', 'Bully beaten'] : ['Pummeled', 'Ouch'],
          `${win ? `You punched ${enemy.firstName} square in the nose and won the fight!` : `You lunged at ${enemy.firstName} but got your butt kicked in front of everyone.`}${suspended ? ' You were suspended for three days.' : ''}`,
          `I got into a fight with a bully at school named ${enemy.firstName}.${suspended ? ' I was suspended.' : ''}`,
          { happiness: win ? 10 : -10, health: win ? -2 : -10, count: 'fights', grades: suspended ? -8 : 0, rels: suspended ? [{ p: aParent(g), d: -6 }] : [] },
          win ? 'good' : 'bad',
          '👊',
        )
      },
      report: (g, x) => {
        const works = chance(g, 0.6)
        say(g, x, works ? ['Out of my hands now', 'Someone\'s getting in trouble'] : 'Snitch', works ? `You reported ${x.s('first')} to the principal. They got detention and have left you alone since.` : `You reported ${x.s('first')}, but the principal did nothing. Now everyone calls you a snitch.`, `I reported a bully named ${x.s('first')} to the principal.`, works ? { happiness: 6, rel: -10 } : { happiness: -6, rel: -10 }, works ? 'good' : 'bad')
      },
      talk: (g, x) => {
        const r = pick(g, ['apologized', 'laughed', 'shoved'] as const)
        if (r === 'apologized') {
          say(g, x, 'Breakthrough', `You talked to ${x.s('first')}, who admitted they're having a hard time at home and apologized.`, `I talked to a bully named ${x.s('first')} and they apologized.`, { happiness: 8, karma: 4, rel: 15 }, 'good')
        } else if (r === 'laughed') {
          say(g, x, 'Didn\'t work', `You tried to reason with ${x.s('first')}. They laughed in your face.`, `I tried to talk to a bully named ${x.s('first')}. They laughed at me.`, { happiness: -6 }, 'bad')
        } else {
          say(g, x, 'Shoved', `You tried to talk to ${x.s('first')}, who shoved you into a locker mid-sentence.`, `I tried to talk to a bully named ${x.s('first')}, who shoved me into a locker.`, { happiness: -8, health: -4 }, 'bad')
        }
      },
      sibling: (g, x) => say(g, x, 'Big sibling energy', x.q ? `${x.q.firstName} had a little chat with ${x.s('first')} after school. You haven't been bothered since.` : `Your sibling had a word with ${x.s('first')}. Problem solved.`, `My sibling stood up to a bully named ${x.s('first')} for me.`, { happiness: 10, rel2: 8 }, 'good'),
      nothing: (g, x) => say(g, x, ['Suffering in silence', 'Ignored'], `You decided not to do anything. ${x.s('first')} continues to make school miserable.`, 'I decided not to do anything about a bully.', { happiness: -8 }, 'bad'),
    },
  },
  {
    id: 'school.classClown',
    emoji: '🤡',
    title: 'Class Clown',
    minAge: 7,
    maxAge: 22,
    when: (g) => inGradeSchool(g) || inUniversity(g),
    setup: () => ({
      text: "You're sitting in class and think of something hilarious to say in response to the teacher's question. Then the teacher calls on you. What will you do?",
      choices: [ch('joke', 'Rip the joke'), ch('serious', 'Answer the question seriously'), ch('nevermind', 'Never mind')],
    }),
    resolve: {
      joke: (g) => {
        const hit = chance(g, 0.55)
        say(g, null, hit ? ['Comedy gold', 'Legend'] : ['Detention', 'Tough crowd'], hit ? 'The whole class lost it. Even the teacher cracked a smile before giving you a warning.' : 'Nobody laughed. The teacher sent you to the hallway to "think about your choices."', 'I ripped a joke in front of my class!', hit ? { happiness: 8, grades: -2 } : { happiness: -6, grades: -4 }, hit ? 'good' : 'bad')
      },
      serious: (g) => say(g, null, 'Model student', 'You answered seriously and correctly. The teacher gave you a nod of approval.', 'I resisted the temptation to rip a joke in front of my class.', { smarts: 4, grades: 3 }, 'good'),
      nevermind: (g) => say(g, null, 'Uh...', 'You said "never mind" and stared at your desk. Smooth.', null, { happiness: -2 }),
    },
  },
  {
    id: 'school.troublemaker',
    emoji: '🤡',
    title: 'Troublemaker',
    minAge: 6,
    maxAge: 17,
    when: inGradeSchool,
    setup: (g) => {
      const c = classmate(g)
      const t = teacher(g)
      return {
        text: `Your classmate ${c.first} ${v(g, CLOWN_ACTS)} in ${t}'s class. What will you do?`,
        choices: [ch('ignore', `Ignore ${c.gender === 'male' ? 'his' : 'her'} antics`), ch('laugh', `Laugh at ${c.gender === 'male' ? 'him' : 'her'}`), ch('talk', 'Have a talk with them'), ch('report', 'Report them to the principal')],
        person: c.p,
        data: { ...classmateData(c), teacher: t },
      }
    },
    resolve: {
      ignore: (g, x) => say(g, x, 'Focused', `You ignored ${x.s('first')} and kept taking notes.`, `My classmate, ${x.s('first')}, acted up in ${x.s('teacher')}'s class. I ignored the antics.`, { grades: 2 }),
      laugh: (g, x) => {
        const trouble = chance(g, 0.3)
        say(g, x, trouble ? 'Guilty by association' : 'Partners in crime', trouble ? `You laughed so hard that ${x.s('teacher')} gave you detention too.` : `You cracked up. ${x.s('first')} gave you a wink. A friendship is forming.`, `My classmate, ${x.s('first')}, acted up in ${x.s('teacher')}'s class. I laughed at the antics.`, trouble ? { happiness: 2, grades: -4, rel: 8 } : { happiness: 6, rel: 10 }, trouble ? 'bad' : 'good')
      },
      talk: (g, x) => {
        const rec = chance(g, 0.5)
        say(g, x, rec ? 'Receptive' : 'Unreceptive', rec ? `${x.s('first')} actually listened and promised to tone it down.` : `${x.s('first')} called you a teacher's pet and threw a spitball at you.`, `I talked to my classmate ${x.s('first')} about acting up in class.`, rec ? { karma: 3, rel: 6 } : { happiness: -4, rel: -6 })
      },
      report: (g, x) => say(g, x, ['Out of my hands now', 'Snitch', 'Report: Filed'], `You reported ${x.s('first')}. They got punished, but your popularity took a hit.`, `I reported my classmate, ${x.s('first')}, to the principal for acting up in class.`, { happiness: -4, rel: -15, grades: 1 }),
    },
  },
  {
    id: 'school.cheatRequest',
    emoji: '📝',
    title: 'Cheating',
    minAge: 9,
    maxAge: 24,
    when: (g) => inGradeSchool(g) || inUniversity(g),
    setup: (g) => {
      const c = classmate(g)
      const subject = pick(g, ['math', 'chemistry', 'history', 'biology', 'English', 'physics', 'geography'])
      return {
        text: `Your classmate ${c.first} is failing ${subject} and begs you to let them copy your answers on the big exam tomorrow. What will you do?`,
        choices: [ch('cheat', 'Help them cheat'), ch('study', 'Help them study instead'), ch('refuse', 'Refuse'), ch('report', 'Report them')],
        person: c.p,
        data: { ...classmateData(c), subject },
      }
    },
    resolve: {
      cheat: (g, x) => {
        const caught = chance(g, 0.3)
        say(g, x, caught ? 'Busted' : 'Accomplice', caught ? `The teacher caught ${x.s('first')} copying your ${x.s('subject')} answers. You both got zeros.` : `${x.s('first')} copied your answers and passed ${x.s('subject')}! They owe you forever.`, `I helped my classmate ${x.s('first')} cheat on a ${x.s('subject')} exam.${caught ? ' We got caught.' : ''}`, caught ? { grades: -12, karma: -6, happiness: -8, rel: 4 } : { karma: -6, rel: 15 }, caught ? 'bad' : 'neutral')
      },
      study: (g, x) => {
        const passed = chance(g, 0.6)
        say(g, x, passed ? 'Tutor of the year' : 'Tried our best', passed ? `You spent the night tutoring ${x.s('first')}, and they passed! They're incredibly grateful.` : `You tutored ${x.s('first')} all night, but they still failed. At least you aced it.`, `I helped my classmate ${x.s('first')} study for a ${x.s('subject')} exam.`, passed ? { smarts: 4, karma: 6, rel: 18, grades: 3 } : { smarts: 4, karma: 4, rel: 6, grades: 3 }, 'good')
      },
      refuse: (g, x) => say(g, x, 'Integrity', `You told ${x.s('first')} no. They failed and gave you the cold shoulder.`, `I refused to help my classmate ${x.s('first')} cheat.`, { karma: 2, rel: -8 }),
      report: (g, x) => say(g, x, ['Snitch', 'Out of my hands now'], `You reported ${x.s('first')} for trying to cheat. They were suspended. Word got around.`, `I reported my classmate ${x.s('first')} for trying to cheat.`, { rel: -25, happiness: -4 }),
    },
  },
  {
    id: 'school.answerKey',
    emoji: '🗝️',
    title: 'Answer Key',
    minAge: 12,
    maxAge: 22,
    when: (g) => inGradeSchool(g) || inUniversity(g),
    setup: (g) => {
      const c = classmate(g)
      const subject = pickLine(g, ['algebra', 'chemistry', 'world history', 'biology', 'economics'])
      return {
        text: `You're nervous about a difficult ${subject} exam. You know your classmate ${c.first} has stolen the answer key. What will you do?`,
        choices: [ch('ask', 'Ask them for the answer key'), ch('report', 'Report them'), ch('study', 'Study and do my best')],
        person: c.p,
        data: { ...classmateData(c), subject },
      }
    },
    resolve: {
      ask: (g, x) => {
        const caught = chance(g, 0.25)
        say(g, x, caught ? 'Caught cheating' : 'Perfect score', caught ? `The answer key had a tracking watermark. You and ${x.s('first')} were both caught and given zeros.` : `You aced the ${x.s('subject')} exam with suspicious perfection.`, `I used a stolen answer key on a ${x.s('subject')} exam.${caught ? ' I got caught.' : ''}`, caught ? { grades: -15, karma: -8, happiness: -10 } : { grades: 8, karma: -8, rel: 6 }, caught ? 'bad' : 'neutral')
      },
      report: (g, x) => say(g, x, ['Someone\'s getting in trouble', 'Snitch'], `You reported ${x.s('first')} for stealing the answer key. The exam was rewritten and everyone hates you a little.`, `I reported my classmate ${x.s('first')} for stealing an answer key.`, { karma: 4, rel: -25, happiness: -4 }),
      study: (g, x) => {
        const good = chance(g, 0.4 + g.character.stats.smarts / 200)
        say(g, x, good ? 'Earned it' : 'Did my best', good ? 'You studied hard and passed with flying colors. No regrets.' : 'You studied hard and got a C. An honest C.', `I studied hard for a ${x.s('subject')} exam instead of cheating.`, { smarts: 6, grades: good ? 6 : 1, karma: 2, count: 'studied' }, 'good', '📚')
      },
    },
  },
  {
    id: 'school.play',
    emoji: '🎭',
    title: 'Casting Call',
    minAge: 6,
    maxAge: 17,
    when: inGradeSchool,
    setup: (g) => {
      const play = pick(g, schoolPlays(g))
      return {
        text: `Your school is putting on a production of "${play}" and there's an open casting call. What will you do?`,
        choices: [ch('lead', 'Audition for the lead role'), ch('support', 'Audition for a supporting role'), ch('crew', 'Join the stage crew'), ch('no', "I'm not interested")],
        data: { play },
      }
    },
    resolve: {
      lead: (g, x) => {
        const got = chance(g, 0.25 + g.character.stats.looks / 300 + g.character.stats.smarts / 400)
        say(g, x, got ? ['Star is born', 'Standing ovation'] : 'Understudy', got ? `You landed the lead in "${x.s('play')}"! Your performance brought the parents to tears.` : `You didn't get the lead in "${x.s('play')}". You were cast as Tree #3.`, got ? `I was given the lead role in my school's performance of "${x.s('play')}".` : `I auditioned for the lead in "${x.s('play')}" and was cast as a tree.`, got ? { happiness: 14, smarts: 4, looks: 4, fame: 1 } : { happiness: -6, smarts: 2 }, got ? 'good' : 'bad')
      },
      support: (g, x) => say(g, x, 'Scene stealer', `You played a supporting role in "${x.s('play')}" and got the biggest laugh of the night.`, `I had a supporting role in my school's production of "${x.s('play')}".`, { happiness: 8, smarts: 2 }, 'good'),
      crew: (g, x) => say(g, x, 'Behind the scenes', 'You ran the spotlight. One time it landed on the wrong actor, but nobody noticed.', `I joined the stage crew for my school's production of "${x.s('play')}".`, { happiness: 4, smarts: 4 }),
      no: (g, x) => say(g, x, 'Pass', 'You showed no interest in the production.', `I showed no interest in my school's production of "${x.s('play')}".`, {}),
    },
  },
  {
    id: 'school.instruments',
    emoji: '🎶',
    title: 'Instruments',
    minAge: 6,
    maxAge: 13,
    when: inGradeSchool,
    setup: () => ({
      text: "You're in music class and get the chance to try a new instrument. Which will you choose?",
      choices: [ch('sax', 'Saxophone', '🎷'), ch('violin', 'Violin', '🎻'), ch('drums', 'Drums', '🥁'), ch('triangle', 'Triangle', '🔺')],
    }),
    resolve: {
      sax: (g) => say(g, null, 'Smooth', 'You got funky on the saxophone. Your music teacher called you "a natural, sort of."', 'I got funky playing the saxophone in music class.', { happiness: 6, smarts: 4 }, 'good'),
      violin: (g) => say(g, null, 'Pizzicato', 'You went pizzicato on the violin. It sounded like a cat in distress, but a talented cat.', 'I played the violin in music class.', { smarts: 6 }, 'good'),
      drums: (g) => say(g, null, 'Rock on', 'You rocked out on the drums so hard you broke a stick. Everyone else went deaf.', 'I rocked out on the drums in music class.', { happiness: 8 }, 'good'),
      triangle: (g) => say(g, null, 'Ding', 'You learned just how boring the triangle is.', 'I learned how boring the triangle is in music class.', { happiness: -2 }),
    },
  },
  {
    id: 'school.sneeze',
    emoji: '🤧',
    title: 'Sneeze',
    minAge: 8,
    maxAge: 22,
    when: (g) => inGradeSchool(g) || inUniversity(g),
    setup: () => ({
      text: 'While presenting your part of a group project, you sneezed into your hand. Now your hand is full of snot. What will you do?',
      choices: [ch('tissue', 'Stop and look for tissues'), ch('wipe', "Wipe it on a groupmate's back"), ch('bathroom', 'Excuse myself to the bathroom'), ch('keep', 'Leave it in my hand for now')],
    }),
    resolve: {
      tissue: (g) => say(g, null, 'Awkward pause', 'You stopped mid-sentence to hunt for tissues. The class watched in silence.', 'I sneezed during a school presentation and had to stop to find tissues.', { happiness: -2 }),
      wipe: (g) => {
        const seen = chance(g, 0.6)
        say(g, null, seen ? 'Seen by everyone' : 'Smooth criminal', seen ? 'You wiped it on your groupmate. Half the class saw. You are now known as "the Snot Bandit."' : 'You discreetly wiped it on a groupmate\'s back. Nobody noticed. You monster.', "I wiped snot on a groupmate's back during a presentation.", seen ? { happiness: -8, karma: -4 } : { karma: -4, happiness: 2 }, seen ? 'bad' : 'neutral')
      },
      bathroom: (g) => say(g, null, 'Graceful', 'You calmly excused yourself, washed up, and finished the presentation like a pro.', 'I excused myself to the bathroom after sneezing during a presentation.', { smarts: 4 }, 'good'),
      keep: (g) => say(g, null, 'Gross', 'You finished the presentation with a clenched, slimy fist. Your groupmates kept their distance.', 'I finished my presentation with a hand full of snot.', { looks: -4, happiness: -2 }),
    },
  },
  {
    id: 'school.chatty',
    emoji: '💬',
    title: 'Distraction',
    minAge: 9,
    maxAge: 17,
    when: inGradeSchool,
    setup: (g) => {
      const f = anyOf(g, friends(g))
      const name = f?.firstName ?? classmate(g).first
      const pct = pick(g, [20, 25, 30, 40])
      return {
        text: `Your teacher is explaining a big essay worth ${pct}% of your grade, but your friend ${name} keeps running their mouth to you. What will you do?`,
        choices: [ch('move', 'Move desks'), ch('tune', 'Tune them out'), ch('listen', 'Listen to their stories'), ch('shush', 'Ask them to shut up')],
        person: f,
        data: { name },
      }
    },
    resolve: {
      move: (g, x) => say(g, x, 'Focused', `You moved desks to get away from ${x.s('name')}. You caught all the instructions.`, 'I moved desks to get away from a chatty friend.', { grades: 3, rel: -4 }),
      tune: (g) => say(g, null, 'Multitasker', 'You nodded along while actually listening to the teacher. Impressive.', 'I tuned out a chatty friend in class.', { grades: 2, smarts: 2 }),
      listen: (g, x) => say(g, x, ['Missed it', 'Oops'], `${x.s('name')}'s stories were amazing. Too bad you completely missed the essay instructions.`, 'I screwed up an assignment at school after missing the instructions.', { grades: -6, rel: 6, happiness: 2 }, 'bad'),
      shush: (g, x) => {
        const ok = chance(g, 0.6)
        say(g, x, ok ? 'Silence' : 'Ignored', ok ? `${x.s('name')} zipped it, a little offended.` : `${x.s('name')} refused to stop talking. You missed half the instructions.`, `I begged a chatty friend to shut up. They ${ok ? 'agreed' : 'refused'} to stop talking!`, ok ? { grades: 2, rel: -4 } : { grades: -2, rel: -4 })
      },
    },
  },
  {
    id: 'school.scienceFair',
    emoji: '🔬',
    title: 'Science Fair',
    minAge: 8,
    maxAge: 15,
    // School science fairs caught on after the Second World War.
    when: (g) => inGradeSchool(g) && g.year >= 1950,
    setup: () => ({
      text: "The school science fair is coming up! What's your project?",
      choices: [ch('volcano', 'Baking soda volcano', '🌋'), ch('potato', 'Potato battery', '🥔'), ch('mold', 'Growing mold in my room', '🦠'), ch('parents', 'Have my parents do it', '👪')],
    }),
    resolve: {
      volcano: (g) => {
        const won = chance(g, 0.2)
        say(g, null, won ? 'Blue ribbon' : 'Classic', won ? 'Your volcano erupted perfectly and you won first place!' : 'Your volcano erupted. So did six other volcanoes. You got an honorable mention.', won ? 'I won first place at the science fair with a baking soda volcano.' : 'I made a baking soda volcano for the science fair.', won ? { smarts: 8, happiness: 10, grades: 4 } : { smarts: 4, happiness: 2 }, won ? 'good' : 'neutral')
      },
      potato: (g) => {
        const won = chance(g, 0.4 + g.character.stats.smarts / 300)
        say(g, null, won ? ['Electrifying', 'First place'] : 'Low voltage', won ? g.year >= 1975 ? 'Your potato battery powered a digital clock. The judges were amazed. First place!' : 'Your potato battery lit a tiny bulb. The judges were amazed. First place!' : "Your potato battery didn't light the bulb. You ate the potato.", won ? 'I won the science fair with a potato battery.' : 'My potato battery failed at the science fair.', won ? { smarts: 10, happiness: 10, grades: 5 } : { smarts: 4, happiness: -4 }, won ? 'good' : 'bad')
      },
      mold: (g) => say(g, null, 'Biohazard', "You grew a spectacular mold colony in your bedroom. You got second place and a mild cough.", 'I grew mold in my bedroom for the science fair and got second place.', { smarts: 8, health: -4, grades: 3 }),
      parents: (g) => {
        const caught = chance(g, 0.5)
        say(g, null, caught ? 'Obvious' : 'Suspiciously advanced', caught ? 'The judges asked you to explain "your" quantum physics project. You could not.' : 'Your parents built a working robot. You placed third and learned nothing.', 'My parents did my science fair project for me.', caught ? { smarts: -2, happiness: -6, grades: -3 } : { happiness: 4 }, caught ? 'bad' : 'neutral')
      },
    },
  },
  {
    id: 'school.spellingBee',
    emoji: '🐝',
    title: 'Spelling Bee',
    minAge: 7,
    maxAge: 13,
    when: inGradeSchool,
    setup: () => ({
      text: "You've qualified for the school spelling bee! How will you prepare?",
      choices: [ch('study', 'Study the dictionary'), ch('wing', 'Wing it'), ch('skip', 'Fake sick to skip it')],
    }),
    resolve: {
      study: (g) => {
        const won = chance(g, 0.35 + g.character.stats.smarts / 250)
        say(g, null, won ? 'Champion' : 'So close', won ? 'You spelled "onomatopoeia" flawlessly and won the whole thing!' : 'You made it to the final round, then spelled "necessary" with two Cs.', won ? 'I won the school spelling bee.' : 'I made it to the final round of the school spelling bee.', won ? { smarts: 10, happiness: 12, grades: 4, count: 'studied' } : { smarts: 6, happiness: 2, count: 'studied' }, won ? 'good' : 'neutral', '🏆')
      },
      wing: (g) => {
        const ok = chance(g, 0.2)
        say(g, null, ok ? 'Natural talent' : 'Eliminated', ok ? 'You winged it and somehow won. The kid who studied for months is in shambles.' : 'You were eliminated in the first round on the word "cat." You spelled it with a K.', ok ? 'I won the spelling bee without studying.' : 'I was eliminated in the first round of the spelling bee.', ok ? { happiness: 10, smarts: 4 } : { happiness: -8 }, ok ? 'good' : 'bad')
      },
      skip: (g) => say(g, null, 'Faker', 'You put a thermometer on a lamp and stayed home. Your parents bought it, barely.', 'I faked being sick to skip the spelling bee.', { karma: -2, count: 'skippedSchool' }),
    },
  },
  {
    id: 'school.fieldTrip',
    emoji: '🚌',
    title: 'Field Trip',
    minAge: 6,
    maxAge: 15,
    when: inGradeSchool,
    setup: (g) => {
      const place = v(g, ['the zoo', 'the natural history museum', 'the aquarium', 'a chocolate factory', '@1930 the planetarium', 'a dairy farm'])
      return {
        text: `Your class is going on a field trip to ${place}! What will you do there?`,
        choices: [ch('group', 'Stay with the group'), ch('wander', 'Wander off on my own'), ch('bus', 'Stay on the bus'), ch('giftshop', 'Spend it all at the gift shop')],
        data: { place },
      }
    },
    resolve: {
      group: (g, x) => say(g, x, 'Learned something', `You stuck with your class at ${x.s('place')} and actually learned a lot.`, `I went on a field trip to ${x.s('place')}.`, { smarts: 6, happiness: 4 }, 'good'),
      wander: (g, x) => {
        const lost = chance(g, 0.4)
        say(g, x, lost ? 'Missing child' : 'Explorer', lost ? g.year >= 1930 ? `You got lost at ${x.s('place')}. Your name was called over the loudspeaker three times.` : `You got lost at ${x.s('place')}. Your teacher shouted your name until she went hoarse.` : `You wandered off and found the coolest exhibit at ${x.s('place')}. Nobody noticed you were gone.`, lost ? `I got lost on a field trip to ${x.s('place')}.` : `I explored ${x.s('place')} on my own during a field trip.`, lost ? { happiness: -6, grades: -2 } : { happiness: 8, smarts: 4 }, lost ? 'bad' : 'good')
      },
      bus: (g, x) => say(g, x, 'Bus nap', `You stayed on the bus the whole time and slept. You have no idea what ${x.s('place')} looks like.`, `I slept on the bus during a field trip to ${x.s('place')}.`, { health: 2, happiness: -2 }),
      giftshop: (g, x) => {
        const cost = Math.min(Math.max(0, g.character.money), randInt(g, 5, 20))
        say(g, x, 'Souvenirs', cost > 0 ? `You blew your money on ${g.year >= 1990 ? 'a light-up pencil and a keychain' : 'a souvenir pencil and a postcard'} from the gift shop at ${x.s('place')}.` : 'You browsed the gift shop with empty pockets. So close, yet so far.', `I went to the gift shop on a field trip to ${x.s('place')}.`, { money: -cost, happiness: cost > 0 ? 6 : -2 })
      },
    },
  },
  {
    id: 'school.siblingBullied',
    emoji: '🛡️',
    title: 'Little Sibling',
    minAge: 9,
    maxAge: 18,
    when: (g) => inGradeSchool(g) && siblings(g).some((s) => s.age >= 5 && s.age < g.character.age),
    setup: (g) => {
      const sib = anyOf(g, siblings(g).filter((s) => s.age >= 5 && s.age < g.character.age))
      if (!sib) return null
      const b = classmate(g)
      return {
        text: `A bully named ${b.first} has been picking on your little ${sib.gender === 'male' ? 'brother' : 'sister'}, ${sib.firstName}. What will you do?`,
        choices: [ch('confront', 'Confront the bully'), ch('report', 'Report the bully'), ch('teach', `Teach ${sib.firstName} to stand up for ${pr(sib).him}self`), ch('nothing', 'Do nothing')],
        person: sib,
        data: classmateData(b),
      }
    },
    resolve: {
      confront: (g, x) => {
        const win = chance(g, 0.65)
        say(g, x, win ? 'Protector' : 'Rough day', win ? `You had a firm word with ${x.s('first')}. They won't be bothering ${x.p?.firstName ?? 'your sibling'} again.` : `${x.s('first')} punched you in the stomach. But they left ${x.p?.firstName ?? 'your sibling'} alone after that.`, `I stood up to a bully who was picking on my sibling, ${x.p?.firstName ?? ''}.`, win ? { rel: 15, karma: 6, happiness: 6 } : { rel: 15, karma: 6, health: -6, count: 'fights' }, win ? 'good' : 'neutral')
      },
      report: (g, x) => say(g, x, 'Out of my hands now', `You reported ${x.s('first')}. They got detention and ${x.p?.firstName ?? 'your sibling'} has been left alone.`, `I reported a bully who was picking on my sibling.`, { rel: 8, karma: 4 }, 'good'),
      teach: (g, x) => {
        const ok = chance(g, 0.5)
        say(g, x, ok ? 'Sensei' : 'Backfired', ok ? `${x.p?.firstName ?? 'Your sibling'} stood up to the bully and won! They're grateful for your training.` : `${x.p?.firstName ?? 'Your sibling'} tried your advice and came home with a black eye.`, `I taught my sibling how to stand up to a bully.`, ok ? { rel: 12, karma: 3 } : { rel: -6 }, ok ? 'good' : 'bad')
      },
      nothing: (g, x) => say(g, x, 'Not my problem', `You did nothing. ${x.p?.firstName ?? 'Your sibling'} noticed.`, 'I did nothing when my sibling was being bullied.', { rel: -15, karma: -4 }, 'bad'),
    },
  },
  {
    id: 'school.homework',
    emoji: '🐕',
    title: 'Homework',
    minAge: 7,
    maxAge: 17,
    when: inGradeSchool,
    setup: () => ({
      text: 'You completely forgot to do your homework, and the teacher is collecting it right now. What will you do?',
      choices: [ch('truth', 'Tell the truth'), ch('dog', 'Say the dog ate it'), ch('copy', 'Copy someone\'s in the hallway'), ch('cry', 'Burst into tears')],
    }),
    resolve: {
      truth: (g) => say(g, null, 'Honesty points', 'You told the truth. The teacher gave you one extra day.', 'I admitted I forgot my homework and got an extra day.', { karma: 3, grades: -1 }, 'good'),
      dog: (g) => {
        const ok = chance(g, 0.2)
        say(g, null, ok ? 'Unbelievable' : 'Classic excuse', ok ? 'Incredibly, the teacher believed you. Their dog once ate a whole textbook.' : 'The teacher sighed and said, "You don\'t even have a dog." Zero.', 'I told my teacher the dog ate my homework.', ok ? { happiness: 4, karma: -2 } : { grades: -5, karma: -2 }, ok ? 'good' : 'bad')
      },
      copy: (g) => {
        const caught = chance(g, 0.3)
        say(g, null, caught ? 'Caught copying' : 'Speed writer', caught ? 'You copied a classmate\'s homework so fast you wrote their name on it. Zero for both of you.' : 'You copied a classmate\'s homework in 90 seconds flat. Nobody noticed.', 'I copied a classmate\'s homework in the hallway.', caught ? { grades: -8, karma: -4 } : { karma: -4 }, caught ? 'bad' : 'neutral')
      },
      cry: (g) => say(g, null, 'Waterworks', 'You burst into tears. The flustered teacher gave you an extension.', 'I cried my way into a homework extension.', { happiness: -2, craziness: 2 }),
    },
  },
  {
    id: 'school.juul',
    emoji: '🚻',
    title: 'Potty Flavors',
    minAge: 12,
    maxAge: 17,
    when: inGradeSchool,
    // The school-bathroom vape is a 2010s thing; before that it was a shared cigarette.
    setup: (g) => {
      const vape = g.year >= 2014
      return {
        title: vape ? 'Potty Flavors' : 'Smoke Break',
        text: vape ? 'While using the restroom between classes, a group of kids offers you a hit of a grape-flavored vape. What will you do?' : 'While using the restroom between classes, a group of kids offers you a drag of their cigarette. What will you do?',
        choices: [ch('hit', vape ? 'Vape it up' : 'Take a drag'), ch('decline', 'Decline the offer'), ch('tell', 'Tell a teacher')],
        data: { vape: vape ? 1 : 0 },
      }
    },
    resolve: {
      hit: (g, x) => {
        const vape = x.data.vape === undefined || x.n('vape') === 1
        say(g, x, ['Cough cough', 'Not cool'], vape ? 'You took a hit and coughed so hard you saw stars. You did not feel well for the rest of the day.' : 'You took a drag and coughed so hard you saw stars. You smelled like an ashtray for the rest of the day.', vape ? "I tried vaping in the school bathroom. I didn't feel well afterwards." : "I tried smoking in the school bathroom. I didn't feel well afterwards.", { smarts: -4, health: -4, happiness: 2 }, 'bad', '💨')
      },
      decline: (g, x) => say(g, x, 'No thanks', 'You washed your hands and went about your business.', x.data.vape === undefined || x.n('vape') === 1 ? 'I declined when some kids offered me a vape in the school bathroom.' : 'I declined when some kids offered me a cigarette in the school bathroom.', { health: 1 }),
      tell: (g, x) => say(g, x, ['Busted!', 'Snitch'], 'You told a teacher. The kids were busted and you are now officially "that kid."', x.data.vape === undefined || x.n('vape') === 1 ? 'I told a teacher about kids vaping in the bathroom. They were busted!' : 'I told a teacher about kids smoking in the bathroom. They were busted!', { karma: 4, happiness: -4 }),
    },
  },
  {
    id: 'school.toiletPaper',
    emoji: '🧻',
    title: 'Pranksters',
    minAge: 12,
    maxAge: 18,
    when: inGradeSchool,
    setup: (g) => {
      const t = teacher(g)
      return {
        // Toilet-papering is American and postwar; sticky notes arrived in 1980; before that, chalk.
        text: isUS(g) && g.year >= 1950 ? `Your friends are going to toilet paper the house of ${t}, a teacher at your school. What will you do?` : g.year >= 1980 ? `Your friends are going to cover the car of ${t}, a teacher at your school, in sticky notes. What will you do?` : `Your friends are going to chalk silly drawings all over the front steps of ${t}, a teacher at your school. What will you do?`,
        choices: [ch('watch', 'Go and watch only'), ch('no', "I'm not interested"), ch('in', "I'm in!")],
        data: { teacher: t, us: isUS(g) && g.year >= 1950 ? 1 : 0, chalk: !(isUS(g) && g.year >= 1950) && g.year < 1980 ? 1 : 0 },
      }
    },
    resolve: {
      watch: (g, x) =>
        x.n('chalk') === 1
          ? say(g, x, 'Lookout', `You watched your friends turn ${x.s('teacher')}'s front steps into a gallery of very unflattering portraits. You didn't draw a single line.`, "I watched my friends chalk a teacher's front steps, but didn't join in.", { happiness: 4 })
          : x.n('us') === 1
          ? say(g, x, 'Lookout', `You watched your friends wrap ${x.s('teacher')}'s house like a mummy. You didn't touch a single roll.`, "I watched my friends toilet paper a teacher's house, but didn't join in.", { happiness: 4 })
          : say(g, x, 'Lookout', `You watched your friends turn ${x.s('teacher')}'s car into a giant yellow sticky note. You didn't stick a single one.`, "I watched my friends cover a teacher's car in sticky notes, but didn't join in.", { happiness: 4 }),
      no: (g, x) => say(g, x, 'Early night', common(g, 'smartphone') ? 'You stayed home. Your friends sent you pictures.' : 'You stayed home. Your friends told you all about it the next day.', x.n('us') === 1 ? "I decided not to join my friends as they toilet papered a teacher's house." : x.n('chalk') === 1 ? "I decided not to join my friends' chalk prank on a teacher." : "I decided not to join my friends' sticky-note prank on a teacher.", {}),
      in: (g, x) => {
        if (x.n('chalk') === 1) {
          const caught = chance(g, 0.25)
          say(g, x, caught ? 'Caught red-handed' : 'Legendary prank', caught ? `${x.s('teacher')} opened the door mid-drawing and recognized you. Detention for a month.` : `You helped cover ${x.s('teacher')}'s front steps in chalk masterpieces. The rain took a week to wash them off.`, "I helped my friends chalk a teacher's front steps.", caught ? { happiness: -4, grades: -4, count: 'pranks' } : { happiness: 10, karma: -2, count: 'pranks' }, caught ? 'bad' : 'good')
          return
        }
        const caught = chance(g, 0.25)
        const us = x.n('us') === 1
        say(g, x, caught ? (us ? 'Caught by the porch light' : 'Caught red-handed') : ['Mummified', 'Legendary prank'], caught ? (us ? `${x.s('teacher')} flipped on the porch light and recognized you. Detention for a month.` : `${x.s('teacher')} walked out mid-prank and recognized you. Detention for a month.`) : us ? `You helped cover ${x.s('teacher')}'s house with 50 rolls of toilet paper. A work of art.` : `You helped cover ${x.s('teacher')}'s car with 3,000 sticky notes. A work of art.`, us ? "I helped my friends cover a teacher's house in toilet paper." : "I helped my friends cover a teacher's car in sticky notes.", caught ? { smarts: -4, grades: -6, happiness: -6, count: 'pranks' } : { smarts: -4, happiness: 10, count: 'pranks' }, caught ? 'bad' : 'good')
      },
    },
  },
  {
    id: 'school.bleacherBully',
    emoji: '👊',
    title: 'Bleacher Bully',
    minAge: 14,
    maxAge: 18,
    when: inHighSchool,
    // Freshmen and upperclassmen in the US; first-years and older students everywhere else.
    setup: (g) => {
      const us = isUS(g)
      const pe = peClass(g)
      return {
        text: us ? "During gym class, you notice an upperclassman bullying a freshman by the bleachers. It's escalating quickly. What will you do?" : `During ${pe}, you notice an older student bullying a first-year behind the sports hall. It's escalating quickly. What will you do?`,
        choices: [ch('nothing', 'Do nothing'), ch('intervene', 'Intervene'), ch('teacher', us ? 'Get the gym teacher' : 'Get the PE teacher')],
        data: { kid: us ? 'freshman' : 'first-year', big: us ? 'upperclassman' : 'older student', pe: us ? 'gym class' : pe, coach: us ? 'gym teacher' : 'PE teacher' },
      }
    },
    resolve: {
      nothing: (g, x) => say(g, x, 'Bystander', 'You looked the other way. You thought about it for days afterwards.', `I witnessed a ${x.s('kid')} getting hazed in ${x.s('pe')} but did nothing.`, { karma: -4 }),
      intervene: (g, x) => {
        const ok = chance(g, 0.6)
        say(g, x, ok ? 'Hero of the gym' : 'Took a hit', ok ? `You stepped in and the bully backed off. The ${x.s('kid')} will never forget you.` : `You stepped in and took a fist to the eye, but the ${x.s('kid')} got away.`, `I stopped an ${x.s('big')} from bullying a ${x.s('kid')} in ${x.s('pe')}.`, ok ? { karma: 10, happiness: 8 } : { karma: 10, health: -8, count: 'fights' }, ok ? 'good' : 'neutral')
      },
      teacher: (g, x) => say(g, x, 'Responsible', `You got the ${x.s('coach')}, who blew the whistle and broke it up.`, `I got the ${x.s('coach')} to stop a bully in ${x.s('pe')}.`, { karma: 6 }, 'good'),
    },
  },
  {
    id: 'school.pepRally',
    emoji: '📣',
    title: 'Pep Rally',
    minAge: 14,
    maxAge: 18,
    when: inHighSchool,
    // A pep rally in the US; a sports day with house teams elsewhere.
    setup: (g) => {
      const us = isUS(g)
      return {
        title: us ? 'Pep Rally' : 'Sports Day',
        text: us
          ? 'Your school is holding a pep rally and everyone is cheering and stomping to prove their school spirit. One classmate looks over to see what you are doing. What will you do?'
          : "It's sports day and the whole school is cheering for their house teams. One classmate looks over to see what you are doing. What will you do?",
        choices: [ch('leave', us ? 'Leave the gym' : 'Sneak off the field'), ch('silent', 'Stay silent'), ch('cheer', 'Start cheering'), ch('horn', 'Blow an air horn')],
        data: { event: us ? 'a pep rally' : 'sports day', place: us ? 'the gym' : 'the sports field' },
      }
    },
    resolve: {
      leave: (g, x) => say(g, x, 'Too cool', 'You slipped out a side door and spent the rest of it in the library.', `I left ${x.s('place') || 'the gym'} during ${x.s('event') || 'a pep rally'}.`, { smarts: 2, count: 'skippedSchool' }),
      silent: (g, x) => say(g, x, 'Unbothered', 'You stood there, arms crossed. Your classmate nodded in respect.', `I stayed silent during ${x.s('event') || 'a pep rally'}.`, {}),
      cheer: (g, x) => say(g, x, 'School spirit', 'You shouted every cheer at the top of your lungs. Go team!', `I shouted school cheers alongside my classmates at ${x.s('event') || 'a pep rally'}.`, { happiness: 8 }, 'good'),
      horn: (g, x) => {
        const trouble = chance(g, 0.4)
        say(g, x, trouble ? 'Confiscated' : 'Legend', trouble ? 'You blasted an air horn. The principal confiscated it and gave you detention.' : 'You blasted an air horn at the perfect moment. The crowd went wild.', `I blew an air horn at ${x.s('event') || 'a pep rally'}.`, trouble ? { happiness: 2, grades: -3 } : { happiness: 10 }, trouble ? 'bad' : 'good', '📯')
      },
    },
  },
  {
    id: 'school.ditch',
    emoji: '🏃',
    title: 'Ditch Day',
    minAge: 12,
    maxAge: 22,
    when: (g) => inGradeSchool(g) || inUniversity(g),
    setup: (g) => {
      const f = anyOf(g, friends(g))
      const place = isUS(g) ? `the ${v(g, ['@1962 mall', 'beach', '@1978,-1998 arcade', '@1966 skate park', '@1910 movies', '@-1960 swimming hole'])}` : hangout(g)
      return {
        text: `${f ? `Your friend ${f.firstName}` : 'A group of your friends'} wants you to ditch class and go to ${place}. What will you do?`,
        choices: [ch('go', "Let's go!"), ch('no', "No, I'm going to class"), ch('report', 'Report them')],
        person: f,
        data: { place },
      }
    },
    resolve: {
      go: (g, x) => {
        const caught = chance(g, 0.3)
        say(g, x, caught ? 'Caught' : 'Freedom', caught ? 'The school called your house. You were grounded for two weeks.' : 'You had an amazing day and nobody ever found out.', caught ? 'I ditched class with my friends and got caught.' : 'I ditched class with my friends.', caught ? { happiness: 2, grades: -6, rel: 6, count: 'skippedSchool', rels: [{ p: aParent(g), d: -6 }] } : { happiness: 10, grades: -3, rel: 8, count: 'skippedSchool' }, caught ? 'bad' : 'good')
      },
      no: (g, x) => say(g, x, 'Responsible', `You went to class. You heard ${x.s('place') || 'the beach'} was nice.`, 'I turned down an offer to ditch class.', { grades: 2, rel: -4 }),
      report: (g, x) => say(g, x, 'Snitch', 'You reported your friends for planning to ditch. They were waiting in the principal\'s office when they returned.', 'I reported my friends for ditching class.', { rel: -25, karma: 2, happiness: -4 }, 'bad'),
    },
  },
  {
    id: 'school.dance',
    emoji: '🪩',
    title: 'School Dance',
    minAge: 12,
    maxAge: 17,
    when: (g) => inGradeSchool(g) && !partner(g) && !conservativeSchooling(g),
    setup: (g) => {
      const gender = preferredGender(g)
      const s = strangerName(g, gender)
      return {
        text: `It's time for the school dance. You've got a crush on a classmate named ${s.first} ${s.last}. What will you do?`,
        choices: [ch('ask', `Ask ${s.first} to go with me`), ch('alone', 'Go by myself'), ch('skip', 'School dances are not for me')],
        data: { first: s.first, last: s.last, gender },
      }
    },
    resolve: {
      ask: (g, x) => {
        const yes = chance(g, 0.25 + g.character.stats.looks / 160)
        if (yes) {
          const becomesItem = chance(g, 0.35) && g.character.age >= 14
          if (becomesItem) applyEffects(g, { newPerson: { relation: 'partner', firstName: x.s('first'), lastName: x.s('last'), gender: x.s('gender') === 'male' ? 'male' : 'female', age: g.character.age } })
          say(g, x, ['Dream come true', 'Good times'], `${x.s('first')} said yes! You danced all night${becomesItem ? ' and are now officially an item' : ''}.`, `I took ${x.s('first')} ${x.s('last')} to the school dance.`, { happiness: 16, looks: 2, count: becomesItem ? 'partners' : [] }, 'good', '💃')
        } else {
          say(g, x, ['Humiliated', 'I was asking for a friend...', 'Oh, okay, cool'], `${x.s('first')} ${x.s('last')} rejected you in front of half the cafeteria.`, `I asked ${x.s('first')} ${x.s('last')} to the school dance. They rejected me.`, { happiness: -12 }, 'bad', '💔')
        }
      },
      alone: (g) => say(g, null, ['Wallflower', 'Solo'], 'You went by yourself and danced like nobody was watching. Some people were watching.', 'I went to the school dance by myself.', { happiness: 4 }),
      skip: (g) => say(g, null, 'Not my scene', common(g, 'tv') ? 'You stayed home and watched movies instead.' : 'You stayed home and read a good book instead.', 'I decided not to go to the school dance.', {}),
    },
  },
  {
    id: 'school.prom',
    emoji: '👗',
    title: 'Prom',
    minAge: 16,
    maxAge: 18,
    once: true,
    weight: 16,
    // Prom in the US; the local end-of-school night elsewhere (the leavers' ball, the Abiball,
    // the matric dance, the farewell party). Not a dating event where schooling is conservative.
    when: (g) => inHighSchool(g) && !conservativeSchooling(g),
    setup: (g) => {
      const p = partner(g)
      const us = isUS(g)
      const dance = us ? 'prom' : term(g, 'schoolDance')
      const Dance = titleOf(dance)
      return {
        title: us ? 'Prom' : Dance,
        text: p
          ? `${Dance} is coming up! Your ${p.gender === 'male' ? 'boyfriend' : 'girlfriend'}, ${p.firstName}, is expecting a big ask. What will you do?`
          : us
            ? 'Prom is coming up! Everyone is pairing off. What will you do?'
            : `${Dance} is coming up! Everyone is figuring out who to go with. What will you do?`,
        choices: p
          ? [ch('promposal', us && g.year >= 2005 ? 'Do an over-the-top promposal' : 'Ask in the most dramatic way possible'), ch('simple', 'Just ask normally'), ch('skip', `Skip ${us ? 'prom' : 'it'}`)]
          : [ch('friends', 'Go with a group of friends'), ch('askout', 'Ask someone out'), ch('skip', `Skip ${us ? 'prom' : 'it'}`)],
        person: p,
        data: { dance, us: us ? 1 : 0 },
      }
    },
    resolve: {
      promposal: (g, x) => {
        const ok = chance(g, 0.75)
        const us = x.n('us') === 1
        const dance = x.s('dance') || 'prom'
        const buzz = common(g, 'socialMedia') ? 'the video got 4,000 likes' : 'the whole school heard about it by lunch'
        say(g, x, ok ? (us && g.year >= 2005 ? 'Promposal goals' : 'Romance goals') : 'Cringe', ok ? (us ? `You spelled out "PROM?" with candles on ${x.p?.firstName ?? 'their'}'s lawn. They said yes and ${buzz}.` : `You spelled out a question with candles outside ${x.p?.firstName ?? 'their'}'s house. They said yes and ${buzz}.`) : 'Your big romantic gesture set a bush on fire. They still said yes, but the fire department was involved.', us ? (g.year >= 2005 ? 'I did a big promposal and went to prom.' : 'I asked my partner to prom in the most dramatic way possible.') : `I asked my partner to ${dance} in the most dramatic way possible.`, ok ? { happiness: 16, rel: 12, money: -Math.min(Math.max(0, g.character.money), 60) } : { happiness: 6, rel: 6 }, 'good', '🕯️')
      },
      simple: (g, x) => say(g, x, `${titleOf(x.s('dance') || 'prom')} night`, `You asked ${x.p?.firstName ?? 'your date'} and had a magical night under the ${g.year >= 1970 ? 'disco ball' : 'paper lanterns'}.`, `I went to ${x.s('dance') || 'prom'} with my partner.`, { happiness: 12, rel: 6 }, 'good'),
      friends: (g, x) => say(g, x, ['Squad goals', 'Best night'], x.n('us') === 1 ? 'You went with your friends, danced until midnight and ate fries in a parking lot at 2 AM. Perfect.' : loc(g, 'You went with your friends, danced until midnight and ate {food} at 2 AM. Perfect.'), `I went to ${x.s('dance') || 'prom'} with a group of friends.`, { happiness: 14 }, 'good'),
      askout: (g, x) => {
        const yes = chance(g, 0.3 + g.character.stats.looks / 200)
        const s = strangerName(g, preferredGender(g))
        const dance = x.s('dance') || 'prom'
        say(g, x, yes ? 'Date secured' : 'Rejected', yes ? `${s.first} ${s.last} said yes! You had an unforgettable night.` : `You asked ${s.first} ${s.last} and they said they were "going with friends." Sure.`, yes ? `I went to ${dance} with ${s.first} ${s.last}.` : `I asked ${s.first} ${s.last} to ${dance} and got turned down.`, yes ? { happiness: 14, looks: 2 } : { happiness: -10 }, yes ? 'good' : 'bad')
      },
      skip: (g, x) => say(g, x, x.n('us') === 1 ? 'Anti-prom' : 'Not my scene', `You skipped ${x.s('dance') || 'prom'} and had ${common(g, 'tv') ? 'a movie marathon' : 'a quiet night in'} instead. No regrets. Mostly.`, `I skipped ${x.s('dance') || 'prom'}.`, x.p ? { happiness: -2, rel: -10 } : { happiness: -2 }),
    },
  },
  {
    id: 'school.seniorPrank',
    emoji: '🦗',
    title: 'Senior Prank',
    minAge: 17,
    maxAge: 19,
    once: true,
    when: inHighSchool,
    setup: (g) => ({
      title: isUS(g) ? 'Senior Prank' : 'Leavers\' Prank',
      text: isUS(g) ? "It's senior prank season and your class is planning something big. What will you contribute?" : "It's your final year and your class is planning one legendary prank before you leave. What will you contribute?",
      choices: [ch('crickets', 'Release 1,000 crickets in the halls'), ch('car', "Put the principal's car on the roof"), ch('sit', 'Sit this one out'), ch('snitch', 'Warn the principal')],
    }),
    resolve: {
      crickets: (g) => {
        const caught = chance(g, 0.3)
        say(g, null, caught ? 'Caught chirping' : 'Chirp chirp', caught ? g.year >= 1995 ? 'Security cameras caught you with a box labeled "CRICKETS." You were banned from graduation festivities.' : 'The janitor caught you with a box labeled "CRICKETS." You were banned from graduation festivities.' : "The school sounded like a summer night for a month. Nobody ever found out it was you.", isUS(g) ? 'I released 1,000 crickets in my high school for the senior prank.' : 'I released 1,000 crickets in my school as a leavers\' prank.', caught ? { happiness: -6, grades: -5, count: 'pranks' } : { happiness: 14, count: 'pranks' }, caught ? 'bad' : 'good')
      },
      car: (g) => {
        const caught = chance(g, 0.4)
        say(g, null, caught ? 'Suspended' : 'Physics majors', caught ? 'The roof caved in a little. You were caught and suspended for the last week of school.' : "Somehow your class got the principal's car on the roof. Even the principal was impressed.", isUS(g) ? "I helped put the principal's car on the school roof for the senior prank." : "I helped put the principal's car on the school roof as a leavers' prank.", caught ? { happiness: -8, grades: -8, count: 'pranks' } : { happiness: 16, count: 'pranks' }, caught ? 'bad' : 'good', '🚗')
      },
      sit: (g) => say(g, null, 'Clean record', 'You sat it out. You heard it was legendary.', isUS(g) ? 'I sat out the senior prank.' : "I sat out the leavers' prank.", {}),
      snitch: (g) => say(g, null, 'Narc', 'You tipped off the principal. The prank was foiled and your yearbook signatures were... sparse.', isUS(g) ? 'I warned the principal about the senior prank.' : "I warned the principal about the leavers' prank.", { happiness: -8, karma: 2 }, 'bad'),
    },
  },
  {
    id: 'uni.allNighter',
    emoji: '☕',
    title: 'Finals Week',
    minAge: 17,
    maxAge: 40,
    when: inUniversity,
    setup: () => ({
      text: 'Finals are tomorrow and you have barely opened the textbook. What will you do?',
      choices: [ch('cram', 'Pull an all-nighter'), ch('sleep', 'Get a good night of sleep'), ch('pills', 'Take study pills from a classmate'), ch('party', 'Go to a party instead')],
    }),
    resolve: {
      cram: (g) => {
        const ok = chance(g, 0.55)
        say(g, null, ok ? 'Running on caffeine' : 'Brain fog', ok ? 'You drank nine coffees and crammed the whole semester. Somehow you passed!' : 'You stayed up all night and fell asleep during the exam. Your answer sheet has drool on it.', 'I pulled an all-nighter before my finals.', ok ? { smarts: 4, health: -4, grades: 4, count: 'studied' } : { health: -6, grades: -4, count: 'studied' }, ok ? 'good' : 'bad')
      },
      sleep: (g) => say(g, null, 'Well rested', 'You slept eight hours and walked in calm. You did better than expected.', 'I got a good night of sleep before my finals.', { health: 4, grades: 2 }, 'good'),
      pills: (g) => {
        const bad = chance(g, 0.35)
        say(g, null, bad ? 'Heart racing' : 'Laser focus', bad ? 'The pills made your heart race all night. You spent the exam staring at the ceiling.' : 'You studied for 14 hours straight with terrifying focus.', 'I took study pills from a classmate before finals.', bad ? { health: -10, grades: -4, karma: -2, count: 'drugs' } : { grades: 5, health: -4, karma: -2, count: 'drugs' }, bad ? 'bad' : 'neutral', '💊')
      },
      party: (g) => say(g, null, 'YOLO', 'You went to a party the night before finals. It was a great party. It was a terrible exam.', 'I went to a party the night before my finals.', { happiness: 10, grades: -8, health: -2 }, 'bad', '🎉'),
    },
  },
  {
    id: 'uni.roommate',
    emoji: '🛏️',
    title: 'Roommate',
    minAge: 17,
    maxAge: 30,
    when: inUniversity,
    setup: (g) => {
      const s = strangerName(g)
      const habit = pickLine(g, ['plays the tuba at 3 AM', 'never washes their dishes', 'keeps eating your food', 'has a pet snake that keeps escaping', 'talks loudly in their sleep about tax law', 'keeps borrowing your clothes'])
      return {
        text: `Your roommate ${s.first} ${habit}. What will you do?`,
        choices: [ch('talk', 'Have a talk with them'), ch('revenge', 'Get revenge'), ch('ra', 'Complain to the housing office'), ch('accept', 'Learn to live with it')],
        data: { first: s.first, last: s.last, gender: s.gender, habit },
      }
    },
    resolve: {
      talk: (g, x) => {
        const ok = chance(g, 0.6)
        if (ok) createPerson(g, { relation: 'friend', age: g.character.age, firstName: x.s('first'), lastName: x.s('last'), gender: x.s('gender') === 'male' ? 'male' : 'female', relationship: 60 })
        say(g, x, ok ? 'Roomies' : 'Stalemate', ok ? `${x.s('first')} apologized and promised to do better. You've actually become friends.` : `${x.s('first')} said "that's just who I am." Nothing changed.`, `I talked to my roommate ${x.s('first')} about their habits.`, ok ? { happiness: 6 } : { happiness: -4 }, ok ? 'good' : 'neutral')
      },
      revenge: (g, x) => say(g, x, 'Petty', `You hid all of ${x.s('first')}'s left shoes. War has been declared.`, `I got revenge on my roommate ${x.s('first')}.`, { happiness: 4, karma: -3, count: 'pranks' }),
      ra: (g, x) => say(g, x, 'Paperwork', `You filed a complaint. ${x.s('first')} was moved to another dorm and you got a new roommate who is... somehow worse.`, 'I complained to the housing office about my roommate.', { happiness: -2 }),
      accept: (g, x) => say(g, x, 'Zen master', `You bought earplugs and made peace with it. ${x.s('first')} has no idea.`, 'I learned to live with my annoying roommate.', { happiness: -2, smarts: 2 }),
    },
  },
  {
    id: 'uni.groupProject',
    emoji: '👥',
    title: 'Group Project',
    minAge: 12,
    maxAge: 40,
    when: (g) => inUniversity(g) || inHighSchool(g),
    setup: (g) => {
      const c = classmate(g)
      return {
        text: `You're stuck in a group project and ${c.first} hasn't done a single thing. The deadline is tomorrow. What will you do?`,
        choices: [ch('all', 'Do all the work myself'), ch('confront', 'Confront them'), ch('tell', 'Tell the teacher'), ch('nothing', 'Let it fail')],
        person: c.p,
        data: classmateData(c),
      }
    },
    resolve: {
      all: (g, x) => say(g, x, 'Carried the team', `You did everything yourself. ${x.s('first')} got the same grade and said "great teamwork!"`, 'I did a whole group project by myself.', { smarts: 6, grades: 4, happiness: -6, health: -2 }),
      confront: (g, x) => {
        const ok = chance(g, 0.5)
        say(g, x, ok ? 'Wake-up call' : 'Excuses', ok ? `${x.s('first')} pulled an all-nighter and actually did their part. Miracles happen.` : `${x.s('first')} said their grandmother died. That's the fourth grandmother this year.`, `I confronted ${x.s('first')} about slacking on our group project.`, ok ? { grades: 3, rel: -2 } : { grades: -2, rel: -8 })
      },
      tell: (g, x) => say(g, x, 'Justice', `You told the teacher. ${x.s('first')} got a zero and you got full credit.`, `I told the teacher my groupmate ${x.s('first')} didn't do any work.`, { grades: 4, rel: -15 }, 'good'),
      nothing: (g, x) => say(g, x, 'Sinking ship', 'You let it fail out of principle. The principle cost you a letter grade.', 'I let a group project fail.', { grades: -8, rel: -4 }, 'bad'),
    },
  },
  {
    id: 'uni.frat',
    emoji: '🍻',
    title: 'Frat Party',
    minAge: 17,
    maxAge: 26,
    when: inUniversity,
    setup: (g) => ({
      title: isUS(g) ? 'Frat Party' : 'Student Party',
      text: isUS(g) ? "There's a huge party on Greek Row tonight and everyone on your floor is going. What will you do?" : "There's a huge student party tonight and everyone in your halls is going. What will you do?",
      choices: [ch('go', 'Go all out'), ch('chill', 'Go but take it easy'), ch('study', 'Stay in and study')],
    }),
    resolve: {
      go: (g) => {
        const legal = canDrink(g)
        const bad = chance(g, 0.25)
        say(g, null, bad ? 'Rough morning' : ['Party animal', 'Legendary night'], bad ? 'You woke up on a lawn wearing someone else\'s shoes with a pounding headache.' : 'You danced on a table and became famous on campus for one night.', 'I went all out at a huge university party.', bad ? { happiness: 4, health: -8, grades: -3, count: legal ? 'nightlife' : [] } : { happiness: 14, health: -3, count: legal ? 'nightlife' : [] }, bad ? 'bad' : 'good', '🎉')
      },
      chill: (g) => say(g, null, 'Balanced', 'You stopped by, met some cool people and were in bed by midnight.', 'I went to a university party but took it easy.', { happiness: 8 }, 'good'),
      study: (g) => say(g, null, 'Dean\'s list', 'You stayed in and studied. The library was very quiet.', 'I stayed in and studied while everyone went to a party.', { smarts: 6, grades: 3, count: 'studied' }, 'good'),
    },
  },
  {
    id: 'uni.textbook',
    emoji: '📚',
    title: 'Textbooks',
    minAge: 17,
    maxAge: 40,
    when: inUniversity,
    setup: (g) => {
      const price = dollars(g, 220, 340)
      return {
        text: `Your required textbook costs ${money(price)}, and the professor wrote it. What will you do?`,
        choices: [ch('buy', 'Buy it new'), ch('used', 'Find a used copy'), ch('share', 'Share with a classmate'), ch('none', 'Go without')],
        data: { price },
      }
    },
    resolve: {
      buy: (g, x) => {
        const price = x.n('price')
        if (g.character.money < price) {
          say(g, x, 'Declined', `${declined(g)} You're going without.`, "I couldn't afford my textbook.", { grades: -3, happiness: -4 }, 'bad', '💳')
        } else {
          say(g, x, 'Highway robbery', 'You paid full price. The professor thanks you for funding their boat.', `I bought a brand new textbook for ${money(price)}.`, { money: -price, grades: 3 })
        }
      },
      used: (g, x) => {
        const cost = Math.min(Math.max(0, g.character.money), Math.round(x.n('price') / 4))
        say(g, x, 'Smart shopper', cost > 0 ? `You found a used copy for ${money(cost)}. Someone highlighted every single sentence.` : 'You found a used copy someone left in the library. Every single sentence is highlighted.', 'I found a used copy of my textbook.', { money: -cost, grades: 2, smarts: 2 }, 'good')
      },
      share: (g) => say(g, null, 'Teamwork', "You shared a classmate's copy. You now know their entire schedule.", "I shared a classmate's textbook.", { grades: 1, happiness: 2 }),
      none: (g) => say(g, null, 'Living dangerously', 'You went without the textbook. The first quiz did not go well.', 'I went the whole semester without a textbook.', { grades: -5 }, 'bad'),
    },
  },
])
