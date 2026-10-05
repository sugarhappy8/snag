// Life behind bars: yard brawls, solitary, snitch deals, cellmate weirdness, visiting
// day, homemade tattoos and juvenile-detention mischief. These only fire in prison.
import { peopleBy } from '../core'
import { releaseFromPrison } from '../prison'
import { chance, pick, randInt } from '../rng'
import type { GameState, Person } from '../types'
import { anyOf, ch, defineEvents, isUS, relWord, say, strangerName, term, type Ctx } from './helpers'

/** The GED in the US; a school-leaving equivalency elsewhere. */
function equivalency(g: GameState): { classes: string; exam: string; name: string; line: string } {
  if (isUS(g)) return { classes: 'GED classes', exam: 'GED exam', name: 'GED', line: 'my GED' }
  const high = term(g, 'high')
  return { classes: `${high} equivalency classes`, exam: 'equivalency exam', name: `${high[0].toUpperCase()}${high.slice(1)} Equivalency Diploma`, line: `a ${high} equivalency diploma` }
}

function cellmates(g: GameState): Person[] {
  return peopleBy(g, ['cellmate'])
}

function prisonName(g: GameState): string {
  return g.character.prison?.name ?? 'prison'
}

/** True while serving time in juvenile detention. */
function juvenile(g: GameState): boolean {
  const pl = g.flags.prisonLife
  if (pl && typeof pl === 'object' && !Array.isArray(pl) && typeof pl.juvenile === 'boolean') return pl.juvenile
  return g.character.age < 18
}

function adultPrison(g: GameState): boolean {
  return !juvenile(g)
}

function inmate(g: GameState): string {
  const s = strangerName(g, g.character.gender)
  return `${s.first} ${s.last}`
}

/** Family who might visit you on visiting day. */
function visitors(g: GameState): Person[] {
  return peopleBy(g, ['parent', 'stepparent', 'spouse', 'partner', 'fiance', 'sibling', 'child', 'grandparent', 'bestFriend']).filter((p) => p.age >= 12)
}

function cm(x: Ctx): string {
  return x.p ? x.p.firstName : 'your cellmate'
}

const GAMES = ['chess', 'checkers', 'dominoes', 'spades', 'gin rummy', 'Connect Four']
const SONGS = ['a bubblegum pop song from the 90s', 'a boy-band ballad', 'the theme song from a kids cartoon', 'a disco classic', 'a sea shanty']
const CELLMATE_CRIMES = [
  'robbed {n} armored trucks dressed as a clown',
  'stole {n} prize-winning pumpkins',
  'ran a counterfeit cheese ring across {n} states',
  'escaped from {n} different prisons',
  'conned {n} retirees out of their savings',
  'hijacked {n} ice cream trucks',
]
const BOOKS = [
  { id: 'law', label: 'A law textbook', text: 'You read a dusty law textbook cover to cover. You now understand at least four words of your own case file.', fx: { smarts: 5, behavior: 2 } },
  { id: 'novel', label: 'A romance novel', text: 'You read a steamy-looking romance novel. It was mostly about a lighthouse keeper and his feelings.', fx: { happiness: 5 } },
  { id: 'selfhelp', label: 'A self-help book', text: 'You read "Unlock Your Inner Free Person". You underlined everything.', fx: { happiness: 3, willpower: 4, behavior: 3 } },
]

export const PRISON_EVENTS = defineEvents([
  {
    id: 'prison.brawl',
    emoji: '⚔️',
    title: 'Big Brawl',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    setup: (g) => {
      const gangs = pick(g, [['the Iron Saints', 'the Gutter Kings'], ['the Ninth Street Vipers', 'the Concrete Cowboys'], ['the Laundry Room Crew', 'the Library Boys']])
      return {
        text: `While you're hanging out in the yard, ${gangs[0]} and ${gangs[1]} start a massive brawl. What will you do?`,
        choices: [ch('watch', 'Check it out', '👀'), ch('guard', 'Tell a guard', '👮'), ch('walk', 'Walk away', '🚶'), ch('join', 'Join the fight', '👊')],
        data: { a: gangs[0], b: gangs[1] },
      }
    },
    resolve: {
      watch: (g, x) => say(g, x, ['Front row seat', 'Entertainment'], `You found a good spot by the fence and watched ${x.s('a')} and ${x.s('b')} go at it until the guards hosed everyone down.`, 'I watched in amusement as two prison gangs brawled in the yard.', { happiness: 3 }),
      guard: (g, x) => {
        if (chance(g, 0.3)) return say(g, x, 'Snitches...', `You told a guard about the brawl. Somebody saw you do it, and ${x.s('a')} made sure you paid for it later.`, 'I told a guard about a brawl in the yard and got beaten up for it.', { behavior: 6, respect: -12, health: -10 }, 'bad', '🤕')
        say(g, x, 'Law and order', 'You quietly told a guard that a free-for-all had broken out in the yard. The warden noted your cooperation.', 'I told a guard about a brawl between two prison gangs.', { behavior: 6, respect: -5 }, 'neutral', '👮')
      },
      walk: (g, x) => say(g, x, 'Not my fight', 'You walked away before anyone could drag you into the politics of it.', 'I walked away from a prison gang brawl.', { behavior: 2 }),
      join: (g, x) => {
        if (chance(g, 0.4)) return say(g, x, 'Knocked out', `You threw yourself into the brawl and immediately caught an elbow from someone named Tiny. You woke up in the infirmary.`, 'I joined a prison brawl and got knocked out.', { health: -15, respect: 4, behavior: -10, count: 'fights' }, 'bad', '🤕')
        say(g, x, ['Brawler', 'Respect earned'], `You waded into the brawl swinging and held your own. Inmates on both sides are now giving you a respectful nod.`, 'I held my own in a prison brawl.', { health: -5, respect: 12, behavior: -10, count: 'fights' }, 'neutral', '👊')
      },
    },
  },
  {
    id: 'prison.caffeine',
    emoji: '☕',
    title: 'Common Grounds',
    minAge: 14,
    maxAge: 120,
    where: 'prison',
    setup: () => ({
      text: 'The commissary is out of coffee, so a group of inmates is snorting crushed-up caffeine pills. They offer you a line. What will you do?',
      choices: [ch('snort', "I'll snort that", '👃'), ch('wait', "I'll wait until the brew is in", '⏳'), ch('swallow', "Maybe I'll just swallow them", '💊')],
    }),
    resolve: {
      snort: (g) => say(g, null, 'Wired', 'You snorted the caffeine powder. Your heart is now beating in Morse code and you reorganized your cell four times.', 'I snorted crushed caffeine pills when the commissary ran out of coffee.', { health: -4, happiness: 3, craziness: 3, behavior: -3 }, 'bad', '⚡'),
      wait: (g) => say(g, null, 'Patience', 'You decided to wait for the coffee shipment like a civilized criminal.', 'I passed on snorting crushed caffeine pills after the commissary ran out of coffee.', { behavior: 2 }),
      swallow: (g) => say(g, null, 'Alert', 'You swallowed a couple of caffeine pills. You were very, very productive at your prison job.', 'I switched to caffeine pills after the commissary ran out of coffee.', { happiness: 2, health: -1 }),
    },
  },
  {
    id: 'prison.cellmateNews',
    emoji: '📺',
    title: 'Awkward!',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    cooldown: 20,
    when: (g) => cellmates(g).length > 0,
    setup: (g) => {
      const p = anyOf(g, cellmates(g))
      if (!p) return null
      const crime = pick(g, CELLMATE_CRIMES).replace('{n}', String(randInt(g, 3, 14)))
      return {
        text: `While watching the news with your cellmate ${p.firstName}, a story comes on about a criminal who ${crime}. It's definitely ${p.firstName}. What will you do?`,
        choices: [ch('congrats', 'Congratulate them', '👏'), ch('dumb', 'Play dumb', '😶'), ch('channel', 'What else is on?', '📺')],
        person: p,
        data: { crime },
      }
    },
    resolve: {
      congrats: (g, x) => say(g, x, 'Fan club', `You slow-clapped. ${cm(x)} took a bow and told you the parts the news left out.`, `I congratulated my cellmate ${cm(x)} after seeing them on the news.`, { rel: 8, behavior: -2 }, 'neutral', '👏'),
      dumb: (g, x) => say(g, x, 'Poker face', `You pretended not to recognize ${cm(x)} on TV. ${x.p ? pr(x.p).He : 'They'} looked relieved.`, `While watching the news with my cellmate, I pretended not to notice they were the subject of the story.`, { rel: 3 }),
      channel: (g, x) => say(g, x, 'Channel surfing', `You changed the channel to a cooking show. ${cm(x)} seemed a little disappointed nobody was impressed.`, 'I changed the channel when my cellmate showed up on the news.', { rel: -2 }),
    },
  },
  {
    id: 'prison.reform',
    emoji: '💉',
    title: 'Correction?',
    minAge: 16,
    maxAge: 120,
    where: 'prison',
    cooldown: 25,
    when: adultPrison,
    setup: () => ({
      text: "During your time inside, you've watched plenty of inmates come in sober and leave as hardened addicts. What will you do?",
      choices: [ch('challenge', 'Challenge the broken system', '✊'), ch('nothing', 'Do nothing', '🤷'), ch('encourage', 'Encourage new inmates to stay clean', '🤝')],
    }),
    resolve: {
      challenge: (g) => say(g, null, 'Activist', 'You started writing letters to newspapers about the state of the correctional system. The warden is not a fan, but people outside are reading.', 'I started speaking out about how the correctional system is anything but correctional.', { behavior: -4, karma: 6, smarts: 2, fame: 1 }, 'neutral', '✊'),
      nothing: (g) => say(g, null, 'Not my problem', 'You kept your head down. The machine keeps churning.', 'I decided not to do anything about the broken correctional system.', {}),
      encourage: (g) => say(g, null, 'Mentor', 'You started taking new arrivals aside and warning them about drugs and violence on the inside. A few of them actually listened.', 'I started encouraging new inmates to stay clean and out of trouble.', { behavior: 8, karma: 8, happiness: 3 }, 'good', '🤝'),
    },
  },
  {
    id: 'prison.roofJob',
    emoji: '☀️',
    title: 'Roof Job',
    minAge: 16,
    maxAge: 70,
    where: 'prison',
    when: adultPrison,
    setup: () => ({
      text: "You've been asked to join a select group of prisoners who'll work outside this summer, tarring the prison roof. What will you do?",
      choices: [ch('accept', 'Accept the offer', '👷'), ch('decline', 'No, thanks', '🙅')],
    }),
    resolve: {
      accept: (g) => say(g, null, ['Fresh air', 'Hard labor'], 'You spent the summer tarring the roof in the blazing sun. It was hot, sticky work, but the view of the outside world was worth it.', 'I helped tar the prison roof as a summer project.', { behavior: 8, happiness: 4, health: -2, athleticism: 2 }, 'good', '👷'),
      decline: (g) => say(g, null, 'Pass', 'You declined. The guards made a note of your lack of enthusiasm.', 'I turned down a summer work detail on the prison roof.', { behavior: -3 }),
    },
  },
  {
    id: 'prison.fountain',
    emoji: '🚰',
    title: 'Pollution Problem',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    cooldown: 20,
    setup: (g) => ({
      text: `You're unbelievably thirsty, but the only drinking fountain is attached to a toilet that a very unpleasant inmate has been using for the last ${randInt(g, 10, 45)} minutes. What will you do?`,
      choices: [ch('drink', 'Drink up', '💧'), ch('thirst', "I'd rather die of thirst", '🏜️')],
    }),
    resolve: {
      drink: (g) => {
        if (chance(g, 0.25)) return say(g, null, 'Regret', 'You plugged your nose and drank quickly. Your stomach filed a formal complaint a few hours later.', 'I drank from a disgusting prison fountain and got sick.', { health: -6, happiness: -3, behavior: 2 }, 'bad', '🤢')
        say(g, null, 'Hydrated', 'You plugged your nose and drank quickly. You will never speak of this again.', 'I plugged my nose and drank from a disgusting prison fountain.', { health: 1, behavior: 2 })
      },
      thirst: (g) => say(g, null, 'Parched', 'You held out until dinner. Your lips are now the texture of sandpaper.', "I refused to drink from a disgusting prison fountain.", { health: -2, happiness: -2 }),
    },
  },
  {
    id: 'prison.pica',
    emoji: '🍽️',
    title: 'Pica Chew',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    cooldown: 20,
    when: (g) => cellmates(g).length > 0,
    setup: (g) => {
      const p = anyOf(g, cellmates(g))
      if (!p) return null
      return {
        text: `You discover that your cellmate ${p.firstName} has pica. ${pr(p).He} has already eaten one of your socks and part of a bar of soap. What will you do?`,
        choices: [ch('warn', "Tell them not to eat my stuff", '☝️'), ch('encourage', 'Encourage them to eat up!', '😋'), ch('hide', 'Hide anything they could eat', '🙈')],
        person: p,
      }
    },
    resolve: {
      warn: (g, x) => say(g, x, 'Boundaries', `You told ${cm(x)} there'd be problems if anything else of yours went missing. ${x.p ? pr(x.p).He : 'They'} sheepishly spat out your toothbrush.`, 'I told my cellmate with pica that we would have problems if they ate anything else of mine.', { rel: -3 }),
      encourage: (g, x) => {
        if (chance(g, 0.4)) return say(g, x, 'Bad advice', `You cheered ${cm(x)} on. ${x.p ? pr(x.p).He : 'They'} ate a spoon and spent a week in the infirmary.`, 'I encouraged my cellmate with pica, and they ended up in the infirmary.', { rel: -4, karma: -6, behavior: -3 }, 'bad', '🏥')
        say(g, x, 'Supportive', `You cheered ${cm(x)} on as ${x.p ? pr(x.p).he : 'they'} ate a paperback novel. You've never seen anyone so happy.`, 'I encouraged my cellmate with pica to eat up.', { rel: 6, karma: -3 })
      },
      hide: (g) => say(g, null, 'Safe keeping', 'You hid everything you own behind the toilet. Nobody, not even someone with pica, goes back there.', 'I hid all my belongings from my cellmate who has pica.', {}),
    },
  },
  {
    id: 'prison.escapePlan',
    emoji: '🗺️',
    title: 'Escape Plans',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    setup: (g) => {
      const name = inmate(g)
      const plan = pick(g, ['digging a tunnel with a plastic spoon', 'mailing themselves out in a laundry cart', 'disguising themselves as a guard using cardboard', 'catapulting over the wall with a mattress spring'])
      return {
        text: `An inmate named ${name} asks for your honest opinion on their escape plan: ${plan}. What will you do?`,
        choices: [ch('nohelp', "Don't help", '🙅'), ch('feedback', 'Give some objective feedback', '📝'), ch('discourage', 'Encourage them not to try', '🛑')],
        data: { name, plan },
      }
    },
    resolve: {
      nohelp: (g, x) => say(g, x, 'Stay out of it', `You told ${x.s('name')} you didn't want to know anything about it.`, 'I refused to give another inmate feedback on their escape plan.', { behavior: 3 }),
      feedback: (g, x) => {
        if (chance(g, 0.3)) return say(g, x, 'Accessory', `You pointed out a few flaws. ${x.s('name')} tried it anyway, got caught, and told the guards you helped plan it.`, `I helped another inmate plan an escape and got blamed when it failed.`, { behavior: -12, respect: 4 }, 'bad', '🚨')
        if (chance(g, 0.2)) return say(g, x, 'Gone', `You gave ${x.s('name')} some notes on timing. The next morning, their bunk was empty. Legend.`, 'I gave an inmate tips on their escape plan, and they actually escaped.', { respect: 10, behavior: -4, happiness: 4 }, 'good', '🏃')
        say(g, x, 'Consultant', `You gave ${x.s('name')} some constructive criticism. They're "going back to the drawing board."`, 'I gave another inmate some constructive criticism on their escape plan.', { respect: 5, behavior: -3 })
      },
      discourage: (g, x) => say(g, x, 'Voice of reason', `You talked ${x.s('name')} out of it. They grumbled, but they'll thank you when they're not in solitary.`, `I encouraged another inmate not to try escaping.`, { behavior: 4, karma: 3 }, 'good'),
    },
  },
  {
    id: 'prison.solitary',
    emoji: '🕳️',
    title: 'Solitude',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    cooldown: 15,
    setup: () => ({
      text: "You've been thrown into solitary confinement for a week for something you didn't do. How will you pass the time?",
      choices: [ch('yoga', 'Align my chakras', '🧘'), ch('swole', 'Get swole', '💪'), ch('meditate', 'Clear my mind', '😌'), ch('walls', 'Talk to the walls', '🗣️')],
    }),
    resolve: {
      yoga: (g) => say(g, null, 'Namaste', 'You did yoga all week. Your chakras have never been more aligned, and the cell has never smelled worse.', 'I did yoga all day to keep busy while serving a stint in the hole.', { happiness: 4, health: 3, behavior: 3 }, 'good', '🧘'),
      swole: (g) => say(g, null, 'Prison gains', 'You did push-ups and sit-ups until you lost count. You came out of the hole noticeably bigger.', 'I did push-ups and sit-ups all day while serving a stint in the hole.', { health: 4, looks: 2, athleticism: 3, respect: 3, behavior: 2 }, 'good', '💪'),
      meditate: (g) => say(g, null, 'Inner peace', 'You meditated in the darkness and came out calmer than you went in.', 'I meditated all day while serving a stint in the hole.', { happiness: 6, behavior: 3, count: 'meditate' }, 'good', '😌'),
      walls: (g) => say(g, null, 'Good listeners', 'You had long talks with the walls. One of them, Gary, really gets you.', 'I talked to the walls while I was in solitary confinement.', { happiness: -3, craziness: 6 }, 'bad', '🧱'),
    },
  },
  {
    id: 'prison.singalong',
    emoji: '🎶',
    title: 'Sing-Along',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    setup: (g) => {
      const song = pick(g, SONGS)
      return {
        text: `While you're hanging out in the yard, a group of very large inmates suddenly starts singing ${song}. What will you do?`,
        choices: [ch('watch', 'Watch and listen intently', '👂'), ch('belt', 'Belt it out', '🎤'), ch('own', 'Do my own thing', '🚶')],
        data: { song },
      }
    },
    resolve: {
      watch: (g, x) => say(g, x, 'Captive audience', `You watched closely as some of the toughest people you've ever met performed ${x.s('song')}. You were moved.`, `I watched some fellow prisoners sing ${x.s('song')}.`, { happiness: 4, behavior: 2 }),
      belt: (g, x) => say(g, x, ['Showstopper', 'Encore!'], `You joined in and hit the high note. The yard went silent, then erupted. You're part of the group now.`, `I sang along with some fellow prisoners as we performed ${x.s('song')}.`, { happiness: 7, respect: 3, behavior: -1 }, 'good', '🎤'),
      own: (g) => say(g, null, 'Unmoved', 'You kept doing your laps around the yard and tried not to get the song stuck in your head. You failed.', null, {}),
    },
  },
  {
    id: 'prison.snitchDeal',
    emoji: '🕊️',
    title: 'Release Deal',
    minAge: 14,
    maxAge: 120,
    where: 'prison',
    weight: 3,
    cooldown: 15,
    when: (g) => {
      const p = g.character.prison
      return !!p && !p.life && !p.deathRow && p.sentenceYears - p.yearsServed >= 2
    },
    setup: (g) => {
      const name = inmate(g)
      return {
        text: `The warden calls you into the office and says that if you share everything you know about a fellow prisoner named ${name}, you'll be promptly released. What will you do?`,
        choices: [ch('snitch', 'Tell them everything', '🗣️'), ch('nosnitch', "I ain't no snitch", '🤐')],
        data: { name },
      }
    },
    resolve: {
      snitch: (g, x) => {
        if (chance(g, 0.5)) {
          const where = prisonName(g)
          releaseFromPrison(g, 'informant')
          return say(g, x, ['Sweet freedom', 'Deal done'], `You told the warden everything about ${x.s('name')}. A few days later, you walked out of ${where} a free person. Best not to visit the old neighborhood for a while.`, null, { happiness: 10, karma: -8 }, 'good', '🕊️')
        }
        say(g, x, 'Deal off', `You spilled everything about ${x.s('name')}, but the warden decided your information wasn't worth a release. Worse, word got around the cell block.`, `I tried to snitch on ${x.s('name')} for an early release, but the deal fell through.`, { respect: -20, health: -8, karma: -6 }, 'bad', '🐀')
      },
      nosnitch: (g, x) => say(g, x, 'Code of silence', `You told the warden you don't know anything about ${x.s('name')}. Word of your loyalty spread through the block.`, `I turned down early release rather than snitch on ${x.s('name')}.`, { respect: 10, behavior: 2 }, 'neutral', '🤐'),
    },
  },
  {
    id: 'prison.guardAttack',
    emoji: '👮',
    title: 'Gang Attack',
    minAge: 16,
    maxAge: 120,
    where: 'prison',
    when: adultPrison,
    setup: (g) => {
      const s = strangerName(g)
      const guard = `Officer ${s.last}`
      return {
        text: `You hear that a prison gang is planning to jump ${guard}, one of the few guards you actually like and respect. What will you do?`,
        choices: [ch('warn', 'Tell the guard in secret', '🤫'), ch('silent', "I'm no snitch", '🤐'), ch('talk', 'Encourage them not to', '🗣️')],
        data: { guard },
      }
    },
    resolve: {
      warn: (g, x) => {
        if (chance(g, 0.2)) return say(g, x, 'Found out', `You warned ${x.s('guard')}, who stayed safe. Unfortunately the gang figured out who tipped them off.`, `I warned ${x.s('guard')} about a planned attack, and the gang made me pay for it.`, { behavior: 8, karma: 6, respect: -12, health: -10 }, 'bad', '🤕')
        say(g, x, 'Guardian angel', `You covertly warned ${x.s('guard')}. The attack never happened, and ${x.s('guard')} has been slipping you extra pudding ever since.`, `I covertly warned ${x.s('guard')} that some inmates were planning to attack them.`, { behavior: 10, karma: 8, happiness: 3 }, 'good', '🛡️')
      },
      silent: (g, x) => say(g, x, 'Eyes forward', `You kept your mouth shut. ${x.s('guard')} showed up the next week with a black eye and a cast.`, null, { karma: -6, respect: 3 }),
      talk: (g, x) => {
        if (chance(g, 0.5)) return say(g, x, 'Persuasive', `You convinced the gang that ${x.s('guard')} wasn't worth the extra years. They backed off.`, `I talked a group of inmates out of assaulting ${x.s('guard')}.`, { karma: 6, respect: 4, behavior: 3 }, 'good')
        say(g, x, 'Mind your business', `The gang told you to mind your business, then made sure you understood they meant it.`, 'I tried to talk a gang out of attacking a guard and got roughed up.', { health: -8, respect: -4 }, 'bad', '🤕')
      },
    },
  },
  {
    id: 'prison.gameDay',
    emoji: '♟️',
    title: 'Game Day',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    setup: (g) => {
      const game = pick(g, GAMES)
      const name = strangerName(g, g.character.gender).first
      return {
        text: `While playing ${game} with ${name}, an absolutely enormous inmate, you're told that "bad things happen" when ${name} loses. What will you do?`,
        choices: [ch('zero', '0% effort', '😴'), ch('full', '100% effort', '🔥'), ch('some', "Try, but not too hard", '😬')],
        data: { game, name },
      }
    },
    resolve: {
      zero: (g, x) => say(g, x, 'Strategic loss', `You lost at ${x.s('game')} on purpose. ${x.s('name')} celebrated by lifting you off the ground in a bear hug.`, `I lost at ${x.s('game')} on purpose to an enormous inmate who doesn't like losing.`, { respect: -2, happiness: -1 }),
      full: (g, x) => {
        if (chance(g, 0.5)) return say(g, x, 'Bad things happened', `You crushed ${x.s('name')} at ${x.s('game')}. Then ${x.s('name')} crushed you.`, `I beat an enormous inmate at ${x.s('game')} and paid for it.`, { health: -12, respect: 6 }, 'bad', '🤕')
        say(g, x, 'Champion', `You crushed ${x.s('name')} at ${x.s('game')}. ${x.s('name')} stared at you for a long time, then laughed and demanded a rematch.`, `I beat an enormous inmate at ${x.s('game')} and lived to tell the tale.`, { respect: 10, happiness: 5 }, 'good', '🏆')
      },
      some: (g, x) => say(g, x, 'Close game', `You lost by a hair. ${x.s('name')} said it was the best game of ${x.s('game')} ${x.s('name')} ever played.`, `I narrowly lost a game of ${x.s('game')} to an enormous inmate.`, { respect: 3, happiness: 2 }),
    },
  },
  {
    id: 'prison.daisyChains',
    emoji: '🌼',
    title: 'Daisy Chains',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    cooldown: 20,
    setup: () => ({
      text: 'You spot a group of heavily tattooed inmates making daisy chains while relaxing in the sun. What will you do?',
      choices: [ch('watch', 'Watch in amusement', '😄'), ch('join', 'Join them', '🌼'), ch('own', 'Do my own thing', '🚶')],
    }),
    resolve: {
      watch: (g) => say(g, null, 'Wholesome', 'You watched in amusement as some of the hardest people in the prison made flower crowns for each other.', 'I watched a group of hardened inmates make daisy chains in the sun.', { happiness: 3 }),
      join: (g) => say(g, null, 'Flower power', 'You frolicked in the grass and made a daisy chain. It was the most peaceful afternoon you have had in years.', 'I made daisy chains in the sun with a group of hardened inmates.', { happiness: 7, behavior: 2, respect: -2 }, 'good', '🌼'),
      own: (g) => say(g, null, 'Carry on', 'You left them to it and went to lift weights.', null, {}),
    },
  },
  {
    id: 'prison.contraband',
    emoji: '🍬',
    title: 'Smuggled Candy',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    cooldown: 15,
    setup: (g) => {
      const name = strangerName(g, g.character.gender).first
      return {
        text: `An inmate named ${name} offers you some candy that was smuggled in... somewhere you'd rather not think about. What will you do?`,
        choices: [ch('pass', "I'll pass", '🙅'), ch('eat', "Let's eat", '🍬'), ch('trade', 'Trade it for commissary', '💱')],
        data: { name },
      }
    },
    resolve: {
      pass: (g, x) => say(g, x, 'Hard pass', `You politely declined ${x.s('name')}'s candy. Some questions are better left unasked.`, 'I politely declined some candy that had been smuggled into prison in a disgusting way.', { behavior: 2 }),
      eat: (g, x) => {
        if (chance(g, 0.35)) return say(g, x, 'Mistake', `You ate the candy. You spent the next two days regretting every decision that led you here.`, 'I ate smuggled candy in prison and got sick.', { health: -6, happiness: -2, behavior: -2 }, 'bad', '🤢')
        say(g, x, 'Sweet', `You ate the candy. It tasted like freedom. And a little like something else.`, 'I ate some candy that was smuggled into prison.', { happiness: 4, behavior: -2 })
      },
      trade: (g, x) => say(g, x, 'Entrepreneur', `You traded the candy for two packs of ramen and a pencil. Business is booming.`, 'I traded smuggled candy for commissary goods.', { happiness: 3, respect: 3, behavior: -2 }),
    },
  },
  {
    id: 'prison.wrongRelease',
    emoji: '🤦',
    title: 'Oopsies',
    minAge: 14,
    maxAge: 120,
    where: 'prison',
    cooldown: 25,
    when: adultPrison,
    setup: (g) => {
      const name = inmate(g)
      return {
        text: `You watch the guards accidentally release ${name}, a notoriously dangerous inmate, after mistaking them for someone else. What will you do?`,
        choices: [ch('laugh', 'Chuckle at the incompetence', '😂'), ch('inform', 'Inform the guards', '📢')],
        data: { name },
      }
    },
    resolve: {
      laugh: (g, x) => say(g, x, 'Justice system', `You laughed until you cried. ${x.s('name')} waved goodbye from the bus.`, `I laughed after a dangerous inmate was released from prison by mistake.`, { happiness: 4, respect: 2 }),
      inform: (g, x) => say(g, x, 'Good citizen', `You pointed out the mistake. ${x.s('name')} was dragged back in, glaring at you the whole way.`, 'I told the guards they had released the wrong prisoner.', { behavior: 7, respect: -6, karma: 3 }),
    },
  },
  {
    id: 'prison.ged',
    emoji: '🎓',
    title: 'Back to School',
    minAge: 16,
    maxAge: 70,
    where: 'prison',
    weight: 6,
    cooldown: 4,
    when: (g) => g.character.education.degrees.length === 0,
    setup: (g) => ({
      text: `The prison is offering ${equivalency(g).classes} taught by a volunteer who seems genuinely excited to be here. Do you want to enroll?`,
      choices: [ch('enroll', 'Enroll', '📚'), ch('skip', 'Not interested', '🙅')],
    }),
    resolve: {
      enroll: (g) => {
        const c = g.character
        const passed = chance(g, 0.25 + c.stats.smarts / 200)
        if (passed && c.education.degrees.length === 0) {
          const eq = equivalency(g)
          c.education.degrees.push({ kind: 'ged', name: eq.name, school: prisonName(g), age: c.age })
          return say(g, null, ['Graduate!', 'Cap and jumpsuit'], `You studied every night and passed your ${eq.exam}! The volunteer cried. The guards clapped. One of them, anyway.`, `I earned ${eq.line} in prison.`, { smarts: 6, happiness: 10, behavior: 8, count: 'degrees', memory: `Earned ${eq.line} while in prison.` }, 'good', '🎓')
        }
        say(g, null, 'Almost', "You took the classes seriously but didn't pass the exam this time. There's always next year.", `I took ${equivalency(g).classes} in prison but failed the exam.`, { smarts: 3, behavior: 5, happiness: -2 })
      },
      skip: (g) => say(g, null, 'Dropout', `You passed on the ${equivalency(g).classes}. The volunteer looked heartbroken.`, null, { behavior: -1 }),
    },
  },
  {
    id: 'prison.library',
    emoji: '📚',
    title: 'Book Cart',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    setup: () => ({
      text: 'The book cart rolls past your cell with three books on it. Which one will you grab?',
      choices: [...BOOKS.map((b) => ch(b.id, b.label, '📖')), ch('none', 'None of them', '🙅')],
    }),
    resolve: {
      ...Object.fromEntries(
        BOOKS.map((b) => [b.id, (g: GameState) => say(g, null, 'Bookworm', b.text, `I read ${b.label.toLowerCase()} from the prison book cart.`, b.fx, 'good', '📖')]),
      ),
      none: (g) => say(g, null, 'Illiterate by choice', 'You let the cart roll past. The librarian sighed audibly.', null, {}),
    },
  },
  {
    id: 'prison.visitation',
    emoji: '🪟',
    title: 'Visiting Day',
    minAge: 12,
    maxAge: 120,
    where: 'prison',
    cooldown: 4,
    when: (g) => visitors(g).length > 0,
    setup: (g) => {
      const p = anyOf(g, visitors(g))
      if (!p) return null
      return {
        text: `Your ${relWord(p)}, ${p.firstName}, came to visit you at ${prisonName(g)}. You're talking through the glass. What will you do?`,
        choices: [ch('talk', 'Have a heartfelt talk', '❤️'), ch('smuggle', 'Ask them to smuggle something in', '📦'), ch('refuse', 'Refuse to see them', '🚪')],
        person: p,
      }
    },
    resolve: {
      talk: (g, x) => say(g, x, ['Visiting hours', 'Through the glass'], `You and ${x.p?.firstName ?? 'your visitor'} talked until the guard tapped the clock. You both promised it would get better.`, `My ${x.p ? relWord(x.p) : 'family'} ${x.p?.firstName ?? ''} visited me in prison.`.replace(/\s+/g, ' '), { rel: 8, happiness: 6 }, 'good', '❤️'),
      smuggle: (g, x) => {
        if (!x.p || chance(g, 0.5)) return say(g, x, 'Busted', `${x.p?.firstName ?? 'Your visitor'} tried to sneak in a bag of gummy bears and got caught. Visiting privileges are suspended and ${x.p?.firstName ?? 'they'} won't stop talking about it.`, `I asked ${x.p?.firstName ?? 'a visitor'} to smuggle something into prison and they got caught.`, { rel: -12, behavior: -10 }, 'bad', '🚨')
        say(g, x, 'Special delivery', `${x.p.firstName} smuggled in a bag of real coffee. You are now the most popular person on the block.`, `${x.p.firstName} smuggled coffee into prison for me.`, { rel: -3, respect: 6, happiness: 5 }, 'good', '☕')
      },
      refuse: (g, x) => say(g, x, 'No visitors', `You refused to come out. ${x.p?.firstName ?? 'Your visitor'} waited an hour, then left.`, `I refused to see my ${x.p ? relWord(x.p) : 'visitor'} on visiting day.`, { rel: -10, happiness: -3 }, 'bad'),
    },
  },
  {
    id: 'prison.tattoo',
    emoji: '🖋️',
    title: 'Prison Ink',
    minAge: 14,
    maxAge: 120,
    where: 'prison',
    cooldown: 12,
    setup: (g) => {
      const design = pick(g, ['a teardrop', 'a spider web on your elbow', 'your mom’s name', 'a skull wearing a crown', 'a very wobbly dolphin', 'your prisoner number'])
      return {
        text: `An inmate with a homemade tattoo gun built from a guitar string and a cassette motor offers to give you ${design}. What will you do?`,
        choices: [ch('ink', 'Get the tattoo', '🖋️'), ch('decline', 'No way', '🙅')],
        data: { design },
      }
    },
    resolve: {
      ink: (g, x) => {
        if (chance(g, 0.25)) return say(g, x, 'Infected', `You got ${x.s('design')}. It looked tough for about a day before it got infected.`, `I got a prison tattoo of ${x.s('design')} and it got infected.`, { health: -8, respect: 4, behavior: -4, condition: { name: 'Skin Infection', kind: 'disease', severity: 10 } }, 'bad', '🤒')
        say(g, x, ['Inked', 'Street cred'], `You got ${x.s('design')}. It's crooked, but it's yours. The other inmates nodded in approval.`, `I got a prison tattoo of ${x.s('design')}.`, { respect: 6, looks: -1, behavior: -3 }, 'neutral', '🖋️')
      },
      decline: (g) => say(g, null, 'Clean skin', 'You declined. Your skin, and your future job interviews, thank you.', null, { behavior: 1 }),
    },
  },
  {
    id: 'juvie.prankCall',
    emoji: '📞',
    title: 'Phone Time',
    minAge: 10,
    maxAge: 19,
    where: 'prison',
    when: juvenile,
    setup: () => ({
      text: "You're allowed one 20-minute phone call per week, and you usually spend it on family and your lawyer. This week you want to have a little fun. What will you do?",
      choices: [ch('prank', 'Prank call someone', '😜'), ch('missing', 'Report myself missing', '🔍'), ch('pizza', 'Order a pizza', '🍕')],
    }),
    resolve: {
      prank: (g) => say(g, null, 'Prankster', 'You called a random number and convinced an old lady her refrigerator was running. She went to catch it.', 'In juvie, I used my weekly phone call to prank-call an old lady.', { happiness: 5, behavior: -2, count: 'pranks' }, 'neutral', '😜'),
      missing: (g) => say(g, null, 'Found you', 'You called the front desk and reported yourself missing. They found you pretty quickly.', 'In juvie, I used my phone call to report myself missing. They found me pretty quickly.', { happiness: 3, behavior: -3 }),
      pizza: (g) => {
        if (chance(g, 0.3)) return say(g, null, 'Delivery!', 'Against all odds, the pizza actually arrived. You shared it with your whole unit and became a legend.', 'In juvie, I somehow got a pizza delivered.', { happiness: 8, respect: 8, behavior: -3 }, 'good', '🍕')
        say(g, null, 'No delivery', 'The pizza place hung up when you gave them the address of a juvenile detention center.', 'I tried to order a pizza to juvie.', { happiness: -1 })
      },
    },
  },
  {
    id: 'juvie.breakfastBully',
    emoji: '🍳',
    title: 'Breakfast Bully',
    minAge: 10,
    maxAge: 19,
    where: 'prison',
    when: juvenile,
    setup: () => ({
      text: 'While standing in the cafeteria line, an angry delinquent behind you demands that you scream at the top of your lungs that the food sucks. What will you do?',
      choices: [ch('scream', 'Do as they demand', '📢'), ch('walk', 'Walk away', '🚶'), ch('ignore', 'Ignore them', '😐'), ch('fight', 'Fight them', '👊')],
    }),
    resolve: {
      scream: (g) => say(g, null, 'Food critic', 'You screamed that the food sucks. The whole cafeteria cheered. The lunch lady did not.', "I complied with a bully's demand that I scream that the food sucks.", { respect: 3, behavior: -4 }),
      walk: (g) => say(g, null, 'Skipped breakfast', 'You walked away and skipped breakfast. Your stomach growled until lunch.', 'I walked away from a bully in the juvie cafeteria.', { happiness: -2 }),
      ignore: (g) => say(g, null, 'Unbothered', 'You ignored them. They eventually got bored and picked on someone else.', 'I ignored a bully in the juvie cafeteria.', { respect: 2 }),
      fight: (g) => {
        if (chance(g, 0.5)) return say(g, null, 'Won the fight', 'You shoved them into the condiments station. Nobody bothers you at breakfast anymore.', 'I beat up a bully in the juvie cafeteria.', { respect: 10, behavior: -8, health: -3, count: 'fights' }, 'neutral', '👊')
        say(g, null, 'Lost the fight', 'You swung first and missed. They did not miss.', 'I lost a fight with a bully in the juvie cafeteria.', { respect: -3, behavior: -8, health: -8, count: 'fights' }, 'bad', '🤕')
      },
    },
  },
  {
    id: 'juvie.halfBaked',
    emoji: '🥧',
    title: 'Half-Baked Escape',
    minAge: 10,
    maxAge: 19,
    where: 'prison',
    when: juvenile,
    setup: () => ({
      text: 'During rec time, a few kids tell you they are escaping tonight by hiding in the laundry truck. They want you in. What will you do?',
      choices: [ch('join', "I'm in", '🧺'), ch('report', 'Tell a counselor', '📢'), ch('stay', 'Stay out of it', '🙅')],
    }),
    resolve: {
      join: (g) => say(g, null, 'Caught in four minutes', 'You climbed into the laundry truck. It never left the parking lot. The guards found you under a pile of towels.', 'I tried to escape juvie in a laundry truck and was caught in minutes.', { behavior: -12, happiness: -4, count: 'escapeAttempts' }, 'bad', '🚨'),
      report: (g) => say(g, null, 'Teacher’s pet', 'You told a counselor. The plan was foiled and you got extra TV time. The other kids now call you "the Narc".', 'I told a counselor about an escape plan in juvie.', { behavior: 8, respect: -8 }),
      stay: (g) => say(g, null, 'Not worth it', 'You stayed in bed. The next morning, everyone involved was in solitary.', 'I stayed out of a doomed juvie escape plan.', { behavior: 2 }),
    },
  },
])

function pr(p: Person) {
  return p.gender === 'male' ? { he: 'he', He: 'He' } : { he: 'she', He: 'She' }
}
