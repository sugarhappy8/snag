// Workplace events for anyone with a job: overtime, team building, rumors, pranks,
// lunch thieves, credit stealers, holiday parties, rude customers and sick days.
import { chance, pick, randInt } from '../rng'
import type { GameState, Person } from '../types'
import { anyOf, ch, defineEvents, dollars, hasJob, jobCompany, money, say, strangerName, type Ctx } from './helpers'

function job(g: GameState) {
  return g.character.job ?? g.character.partTimeJob
}

function fullTime(g: GameState): boolean {
  const j = g.character.job
  return !!j && (j.category === 'fulltime' || j.category === 'parttime')
}

/** A coworker (contact if available, else made-up name). */
function coworker(g: GameState): { p: Person | undefined; first: string; last: string; gender: 'male' | 'female' } {
  const company = jobCompany(g)
  const list = g.people.filter((p) => p.alive && p.relation === 'coworker' && (!p.contextId || p.contextId === company))
  if (list.length && chance(g, 0.75)) {
    const p = pick(g, list)
    return { p, first: p.firstName, last: p.lastName, gender: p.gender }
  }
  const s = strangerName(g)
  return { p: undefined, first: s.first, last: s.last, gender: s.gender }
}

function boss(g: GameState): { p: Person | undefined; first: string; last: string; gender: 'male' | 'female' } {
  const j = job(g)
  const b = (j?.bossId && g.people.find((p) => p.id === j.bossId && p.alive)) || anyOf(g, g.people.filter((p) => p.alive && p.relation === 'boss'))
  if (b) return { p: b, first: b.firstName, last: b.lastName, gender: b.gender }
  const s = strangerName(g)
  return { p: undefined, first: s.first, last: s.last, gender: s.gender }
}

function cwData(c: { first: string; last: string; gender: string }) {
  return { first: c.first, last: c.last, gender: c.gender }
}

const OUTINGS = ['go axe throwing', 'do an escape room', 'go paintballing', 'take a pottery class', 'go bowling', 'do a ropes course', 'go to a karaoke bar']
const RUMORS = ['secretly lives in the office', 'got their job because their uncle owns the company', 'eats other people\'s lunches', 'cried in the supply closet', 'has a pet ferret named after the boss', 'faked a doctor\'s note to go to a theme park']
const ANNOYING = ['clips their toenails at their desk', 'microwaves fish every single day', 'hums the same song all day long', 'replies-all to every company email', 'takes personal calls on speakerphone', 'steals everyone\'s pens']

function nameOf(x: Ctx): string {
  return x.p?.firstName ?? x.s('first')
}

export const WORK_EVENTS = defineEvents([
  {
    id: 'work.overtime',
    emoji: '⏰',
    title: 'Overtime',
    minAge: 16,
    maxAge: 80,
    when: fullTime,
    setup: (g) => {
      const b = boss(g)
      const hours = pick(g, [5, 10, 15, 20])
      return {
        text: `Your supervisor, ${b.first}, tells you they need you to start putting in ${hours} more hours a week of unpaid overtime. What will you do?`,
        choices: [ch('agree', 'Agree to put in the extra hours'), ch('explain', "Explain that I can't do that"), ch('insult', 'Refuse and insult them')],
        person: b.p,
        data: { ...cwData(b), hours },
      }
    },
    resolve: {
      agree: (g, x) => say(g, x, ['Whatever it takes', 'A slave to my craft', 'Paid with love'], `You committed to working ${x.n('hours')} extra hours a week. ${nameOf(x)} called you a team player.`, `I agreed to work ${x.n('hours')} hours of unpaid overtime a week.`, { perf: 10, happiness: -8, health: -2, rel: 6 }),
      explain: (g, x) => {
        const ok = chance(g, 0.6)
        say(g, x, ['Time = Money', 'Afraid not', 'Nothing in life is free'], ok ? `You explained that unpaid overtime isn't compatible with a healthy work-life balance. ${nameOf(x)} reluctantly agreed.` : `You explained your position. ${nameOf(x)} nodded and wrote something in a little notebook.`, 'I turned down unpaid overtime.', ok ? { happiness: 2 } : { perf: -5, rel: -4 })
      },
      insult: (g, x) => {
        const insult = pick(g, ['a slave driver', 'a cheapskate', 'a corporate goblin', 'a walking spreadsheet'])
        const fired = chance(g, 0.2)
        say(g, x, ['Should I lick the floors too?', "Don't ask me again"], `You laughed in ${nameOf(x)}'s face and called them ${insult}.${fired ? ' They were not amused, and your performance review was brutal.' : ''}`, `I laughed in my supervisor's face and called them ${insult}.`, { perf: fired ? -25 : -12, happiness: 4, rel: -20, count: 'insults' }, 'bad')
      },
    },
  },
  {
    id: 'work.teamBuilding',
    emoji: '👥',
    title: 'Team Building',
    minAge: 16,
    maxAge: 80,
    when: hasJob,
    setup: (g) => {
      const b = boss(g)
      const outing = pick(g, OUTINGS)
      return {
        text: `${b.first}, your supervisor at ${jobCompany(g)}, is sponsoring a team building activity: the whole team is going to ${outing}. Will you go?`,
        choices: [ch('go', "Sure, I'll go"), ch('no', 'No, that sounds lame')],
        person: b.p,
        data: { outing },
      }
    },
    resolve: {
      go: (g, x) => {
        const star = chance(g, 0.3)
        say(g, x, star ? 'MVP' : 'Team player', star ? `You went to ${x.s('outing')} with your coworkers and were the star of the day.` : `You went to ${x.s('outing')} with your coworkers. Bonds were formed. Mostly awkward ones.`, `I went to ${x.s('outing')} with my company for team building.`, { perf: star ? 10 : 6, happiness: star ? 8 : 3, rel: 4 }, 'good')
      },
      no: (g, x) => say(g, x, 'Lone wolf', 'You skipped it. Everyone came back with inside jokes you will never understand.', `I refused to ${x.s('outing')} with my company for team building.`, { perf: -6, rel: -4 }),
    },
  },
  {
    id: 'work.rumor',
    emoji: '😧',
    title: 'Office Rumor',
    minAge: 16,
    maxAge: 80,
    when: hasJob,
    setup: (g) => {
      const c = coworker(g)
      const rumor = pick(g, RUMORS)
      return {
        text: `Your coworker ${c.first} started a rumor that you ${rumor}. What will you do?`,
        choices: [ch('confront', 'Confront them'), ch('talk', 'Have a talk with them'), ch('counter', 'Start a rumor about them'), ch('ignore', 'Pay no attention')],
        person: c.p,
        data: { ...cwData(c), rumor },
      }
    },
    resolve: {
      confront: (g, x) => {
        const scuffle = chance(g, 0.35)
        say(g, x, scuffle ? 'HR meeting' : 'Cleared the air', scuffle ? `You confronted ${nameOf(x)} by the coffee machine. It turned into a shoving match and you both got written up.` : `You confronted ${nameOf(x)} in front of everyone. They turned bright red and retracted it.`, `I confronted my coworker ${nameOf(x)} about a rumor.`, scuffle ? { perf: -10, rel: -15, count: 'fights' } : { perf: 2, rel: -10, happiness: 4 }, scuffle ? 'bad' : 'neutral')
      },
      talk: (g, x) => say(g, x, "Who do you think you are?", `You had a calm talk with ${nameOf(x)} about why you don't appreciate false rumors. They apologized, sort of.`, `I talked to my coworker ${nameOf(x)} about a false rumor.`, { rel: 4, happiness: 2 }),
      counter: (g, x) => {
        const r = pick(g, RUMORS)
        say(g, x, 'Rumor mill', `You started a rumor that ${nameOf(x)} ${r}. The office is in chaos.`, `I started a rumor at work that my coworker ${nameOf(x)} ${r}.`, { rel: -15, karma: -6, happiness: 4 })
      },
      ignore: (g, x) => say(g, x, 'Unbothered', 'You paid no attention. The rumor died within a week.', `I ignored a rumor my coworker ${nameOf(x)} spread about me.`, { happiness: -2 }),
    },
  },
  {
    id: 'work.prank',
    emoji: '🤡',
    title: 'Workplace Prank',
    minAge: 16,
    maxAge: 80,
    when: hasJob,
    setup: (g) => {
      const c = coworker(g)
      const prank = pick(g, ['wrapped your entire desk in aluminum foil', 'filled your car with balloons', 'replaced your desk photos with pictures of a celebrity', 'put your stapler in a block of jelly', 'set your keyboard to a different language'])
      return {
        text: `Your coworker ${c.first} ${prank}. What will you do?`,
        choices: [ch('laugh', 'Laugh it off'), ch('talk', 'Have a talk with them'), ch('report', 'Report them to my supervisor'), ch('revenge', 'Plot revenge')],
        person: c.p,
        data: { ...cwData(c), prank },
      }
    },
    resolve: {
      laugh: (g, x) => say(g, x, 'Good sport', `You laughed it off. ${nameOf(x)} respects you more now.`, 'I laughed off a workplace prank.', { rel: 10, happiness: 4 }, 'good'),
      talk: (g, x) => say(g, x, 'Not funny', `You told ${nameOf(x)} you don't appreciate their pranks. They said "jeez, okay."`, `I talked to my coworker ${nameOf(x)} about their prank.`, { rel: -4 }),
      report: (g, x) => say(g, x, ['Out of my hands now', 'Snitch'], `You reported ${nameOf(x)}. They got a warning and the whole office thinks you have no sense of humor.`, `I reported my coworker ${nameOf(x)} for a prank.`, { rel: -15, perf: 2 }),
      revenge: (g, x) => {
        const ok = chance(g, 0.6)
        say(g, x, ok ? 'Prank war champion' : 'Backfired', ok ? `You filled ${nameOf(x)}'s office with 3,000 sticky notes. The prank war is yours.` : `Your revenge prank set off the fire alarm. The building was evacuated and the boss was not happy.`, `I got revenge on my coworker ${nameOf(x)} with a prank.`, ok ? { rel: 6, happiness: 8, count: 'pranks' } : { perf: -10, happiness: -4, count: 'pranks' }, ok ? 'good' : 'bad')
      },
    },
  },
  {
    id: 'work.annoying',
    emoji: '🤭',
    title: 'Workplace Behavior',
    minAge: 16,
    maxAge: 80,
    when: hasJob,
    setup: (g) => {
      const c = coworker(g)
      const habit = pick(g, ANNOYING)
      return {
        text: `Your coworker ${c.first} ${habit}. It's driving you insane. What will you do?`,
        choices: [ch('talk', 'Have a talk with them'), ch('report', 'Report them'), ch('passive', 'Leave a passive-aggressive note'), ch('endure', 'Suffer in silence')],
        person: c.p,
        data: { ...cwData(c), habit },
      }
    },
    resolve: {
      talk: (g, x) => {
        const r = randInt(g, 1, 10)
        if (r <= 6) say(g, x, 'Understood', `${nameOf(x)} apologized and promised to stop. Peace returns.`, `I asked my coworker ${nameOf(x)} to stop an annoying habit.`, { happiness: 6, rel: 2 }, 'good')
        else if (r <= 9) say(g, x, 'Insulted', `${nameOf(x)} called you uptight and kept doing it.`, `My coworker ${nameOf(x)} insulted me when I asked them to stop an annoying habit.`, { happiness: -6, rel: -8 }, 'bad')
        else say(g, x, 'Shoved', `${nameOf(x)} shoved you into a filing cabinet. HR is involved now.`, `My coworker ${nameOf(x)} shoved me at work.`, { happiness: -16, health: -4, rel: -20 }, 'bad')
      },
      report: (g, x) => say(g, x, 'Filed', `You reported ${nameOf(x)} to your supervisor. The habit stopped, but the stares did not.`, `I reported my coworker ${nameOf(x)} for annoying behavior.`, { rel: -12, happiness: 2 }),
      passive: (g, x) => say(g, x, 'Per my last note', `You left a note that said "Some of us have NOSES." ${nameOf(x)} knows it was you.`, 'I left a passive-aggressive note for a coworker.', { rel: -8, happiness: 3 }),
      endure: (g) => say(g, null, 'Inner screaming', 'You suffered in silence. Your eye has developed a twitch.', 'I silently endured a coworker\'s annoying habit.', { happiness: -6, craziness: 2 }),
    },
  },
  {
    id: 'work.lunchThief',
    emoji: '🥪',
    title: 'Lunch Thief',
    minAge: 16,
    maxAge: 80,
    when: hasJob,
    setup: (g) => ({
      text: `Someone at ${jobCompany(g)} keeps stealing your lunch from the office fridge. What will you do?`,
      choices: [ch('spicy', 'Make it insanely spicy'), ch('note', 'Leave a note on the fridge'), ch('camera', 'Set up a hidden camera'), ch('eatout', 'Just eat out from now on')],
    }),
    resolve: {
      spicy: (g) => {
        const c = coworker(g)
        say(g, null, ['Caught red-mouthed', 'Sweet revenge'], `You laced your sandwich with ghost peppers. An hour later, ${c.first} was sobbing in the break room. Mystery solved.`, `I caught my coworker ${c.first} stealing my lunch with a ghost pepper trap.`, { happiness: 10, karma: -1 }, 'good', '🌶️')
      },
      note: (g) => say(g, null, 'Ignored', 'You left a note. The thief ate your lunch and left a smiley face on the note.', 'I left a note on the office fridge about my stolen lunch.', { happiness: -4 }),
      camera: (g) => {
        const c = coworker(g)
        const isBoss = chance(g, 0.25)
        say(g, null, isBoss ? 'Plot twist' : 'Busted', isBoss ? 'The hidden camera revealed the thief: your own boss. You decided to keep this information for leverage.' : `The camera caught ${c.first} red-handed. They've been buying you coffee ever since.`, 'I caught the office lunch thief on a hidden camera.', { happiness: 8, smarts: 2 }, 'good', '📹')
      },
      eatout: (g) => {
        const cost = Math.min(Math.max(0, g.character.money), dollars(g, 300, 900))
        say(g, null, 'Expensive peace', `You started eating out every day. It cost you ${money(cost)} this year, but your lunches are safe.`, 'I started eating out to avoid the office lunch thief.', { money: -cost, happiness: 2 })
      },
    },
  },
  {
    id: 'work.credit',
    emoji: '🏆',
    title: 'Stolen Credit',
    minAge: 18,
    maxAge: 80,
    when: fullTime,
    setup: (g) => {
      const c = coworker(g)
      return {
        text: `Your coworker ${c.first} presented your project in the big meeting and took all the credit. What will you do?`,
        choices: [ch('call', 'Call them out in the meeting'), ch('boss', 'Talk to my boss privately'), ch('let', 'Let it go'), ch('sabotage', 'Sabotage their next project')],
        person: c.p,
        data: cwData(c),
      }
    },
    resolve: {
      call: (g, x) => {
        const ok = chance(g, 0.5)
        say(g, x, ok ? 'Receipts' : 'Awkward', ok ? `You pulled up your file history in front of everyone. ${nameOf(x)} turned pale. Your boss took notice.` : `You called out ${nameOf(x)}, but it came off as petty. The meeting got very quiet.`, `I called out my coworker ${nameOf(x)} for stealing credit for my work.`, ok ? { perf: 10, rel: -20, happiness: 8 } : { perf: -4, rel: -15, happiness: -4 }, ok ? 'good' : 'bad')
      },
      boss: (g, x) => say(g, x, 'Set the record straight', 'You quietly showed your boss the evidence. They thanked you and gave you the next big project.', `I told my boss that ${nameOf(x)} stole credit for my work.`, { perf: 8, rel: -10 }, 'good'),
      let: (g, x) => say(g, x, 'Let it go', `You let it go. ${nameOf(x)} got a bonus. You got a lesson in office politics.`, 'I let a coworker take credit for my work.', { perf: -3, happiness: -8 }, 'bad'),
      sabotage: (g, x) => {
        const caught = chance(g, 0.35)
        say(g, x, caught ? 'Caught sabotaging' : 'Petty revenge', caught ? 'IT traced the "accidental" file deletion back to your computer. Your performance review will be interesting.' : `${nameOf(x)}'s next presentation mysteriously had all the slides in Comic Sans. Justice.`, `I sabotaged my coworker ${nameOf(x)}'s project.`, caught ? { perf: -20, karma: -8 } : { happiness: 8, karma: -8, rel: -10 }, caught ? 'bad' : 'neutral')
      },
    },
  },
  {
    id: 'work.holidayParty',
    emoji: '🎄',
    title: 'Office Party',
    minAge: 18,
    maxAge: 80,
    when: hasJob,
    setup: () => ({
      text: 'It is the annual office holiday party and there is an open bar. What will you do?',
      choices: [ch('wild', 'Get wild'), ch('behave', 'Have one drink and mingle'), ch('karaoke', 'Dominate the karaoke'), ch('skip', 'Skip it')],
    }),
    resolve: {
      wild: (g) => {
        const bad = chance(g, 0.5)
        say(g, null, bad ? 'Legendary, for the wrong reasons' : 'Party animal', bad ? 'You photocopied your face, told the CEO they "look tired," and fell asleep under the buffet table.' : 'You were the life of the party and nobody did anything regrettable. Somehow.', 'I got wild at the office holiday party.', bad ? { perf: -12, happiness: 6, health: -3 } : { perf: 2, happiness: 10, health: -2 }, bad ? 'bad' : 'good', '🍸')
      },
      behave: (g) => say(g, null, 'Networking pro', 'You had one drink, complimented the right people and left early. Very professional.', 'I networked at the office holiday party.', { perf: 6, happiness: 4 }, 'good'),
      karaoke: (g) => {
        const good = chance(g, 0.4)
        say(g, null, good ? 'Encore!' : 'Tone deaf', good ? 'You sang a power ballad and got a standing ovation. Even the CEO cried.' : 'You sang a power ballad. Multiple people pretended to get phone calls.', 'I sang karaoke at the office holiday party.', good ? { perf: 4, happiness: 10 } : { happiness: -2 }, good ? 'good' : 'neutral', '🎤')
      },
      skip: (g) => say(g, null, 'Introvert', 'You skipped it and went home to your couch.', 'I skipped the office holiday party.', { perf: -2 }),
    },
  },
  {
    id: 'work.mistake',
    emoji: '😬',
    title: 'Big Mistake',
    minAge: 16,
    maxAge: 80,
    when: hasJob,
    setup: (g) => {
      const oops = pick(g, ['emailed the whole company a picture of your cat instead of the quarterly report', 'accidentally deleted an important client file', 'ordered 10,000 staplers instead of 100', 'locked the boss out of the building', 'sent a confidential memo to a competitor'])
      return {
        text: `You ${oops}. Nobody knows it was you yet. What will you do?`,
        choices: [ch('confess', 'Confess'), ch('fix', 'Quietly try to fix it'), ch('blame', 'Blame the new intern')],
        data: { oops },
      }
    },
    resolve: {
      confess: (g, x) => {
        const ok = chance(g, 0.6)
        say(g, x, ok ? 'Respect' : 'Disappointed', ok ? 'You owned up to it. Your boss appreciated the honesty and helped you fix it.' : 'You confessed. Your boss sighed so deeply that the windows fogged.', `I confessed at work that I ${x.s('oops')}.`, ok ? { perf: 2, karma: 4 } : { perf: -8, karma: 4 }, ok ? 'good' : 'bad')
      },
      fix: (g, x) => {
        const ok = chance(g, 0.5)
        say(g, x, ok ? 'Crisis averted' : 'Discovered', ok ? 'You stayed late and fixed it before anyone noticed. Sweaty, but successful.' : 'You tried to cover it up. IT found out. Now it looks way worse.', ok ? 'I quietly fixed a big mistake at work.' : 'I tried to cover up a mistake at work and got caught.', ok ? { happiness: 4, health: -2 } : { perf: -15, happiness: -8 }, ok ? 'good' : 'bad')
      },
      blame: (g) => {
        const caught = chance(g, 0.4)
        say(g, null, caught ? 'Exposed' : 'Scapegoat', caught ? "The intern had a timestamped alibi. Now everyone knows it was you and that you'll throw people under the bus." : 'The intern got the blame and was let go. You keep seeing them in your dreams.', 'I blamed an intern for my mistake at work.', caught ? { perf: -20, karma: -10 } : { karma: -12, happiness: -2 }, 'bad')
      },
    },
  },
  {
    id: 'work.sickDay',
    emoji: '🤧',
    title: 'Sick Day',
    minAge: 16,
    maxAge: 80,
    when: hasJob,
    setup: () => ({
      text: 'You woke up feeling awful: fever, sore throat, the works. What will you do?',
      choices: [ch('go', 'Go to work anyway'), ch('call', 'Call in sick'), ch('home', 'Work from bed')],
    }),
    resolve: {
      go: (g) => {
        const spread = chance(g, 0.5)
        say(g, null, spread ? 'Patient zero' : 'Powered through', spread ? 'You went in and infected half the office. Your boss sent you home and the team is furious.' : 'You powered through the day on cold medicine. Nobody could understand a word you said.', 'I went to work sick.', spread ? { perf: -6, health: -6 } : { perf: 4, health: -6 }, spread ? 'bad' : 'neutral')
      },
      call: (g) => say(g, null, 'Rest up', 'You called in sick and slept for 16 hours. You feel much better.', 'I called in sick to work.', { health: 6, perf: -1 }, 'good'),
      home: (g) => say(g, null, 'Dedicated', 'You answered emails from bed in a haze. Half of them made sense.', 'I worked from bed while sick.', { perf: 2, health: -2 }),
    },
  },
  {
    id: 'work.layoffRumors',
    emoji: '📉',
    title: 'Layoff Rumors',
    minAge: 18,
    maxAge: 70,
    when: (g) => g.character.job?.category === 'fulltime',
    setup: (g) => ({
      text: `Rumors are swirling that ${jobCompany(g)} is about to announce layoffs. What will you do?`,
      choices: [ch('harder', 'Work twice as hard'), ch('resume', 'Polish my resume'), ch('suck', 'Suck up to the boss'), ch('ignore', 'Ignore the rumors')],
    }),
    resolve: {
      harder: (g) => say(g, null, 'Indispensable', 'You worked like a machine for weeks. The layoffs came, and you survived.', 'I worked extra hard during a round of layoff rumors.', { perf: 12, happiness: -6, health: -3 }, 'good'),
      resume: (g) => say(g, null, 'Plan B', 'You updated your resume and took a few calls. Good to have options.', 'I polished my resume during layoff rumors.', { smarts: 2, happiness: 2 }),
      suck: (g) => {
        const b = boss(g)
        const works = chance(g, 0.5)
        say(g, null, works ? 'Teacher\'s pet' : 'Too obvious', works ? `You brought ${b.first} coffee every morning. You made the "keep" list.` : `${b.first} saw right through your sudden enthusiasm.`, 'I sucked up to my boss during layoff rumors.', works ? { perf: 8, rels: [{ p: b.p, d: 10 }] } : { perf: -2, rels: [{ p: b.p, d: -4 }] })
      },
      ignore: (g) => say(g, null, 'Calm', "You ignored the rumors. They turned out to be about a different department.", 'I ignored layoff rumors at work.', {}),
    },
  },
  {
    id: 'work.rudeCustomer',
    emoji: '😤',
    title: 'Rude Customer',
    minAge: 14,
    maxAge: 80,
    when: (g) => hasJob(g) && (g.character.partTimeJob !== null || /cashier|waiter|barista|clerk|server|sales|retail|associate|host/i.test(job(g)?.title ?? '')),
    setup: () => ({
      text: 'A customer is screaming at you because their coupon expired in 2009 and is demanding to speak to your manager. What will you do?',
      choices: [ch('manager', 'Get the manager'), ch('calm', 'Stay calm and kill them with kindness'), ch('snap', 'Snap back at them'), ch('honor', 'Just honor the coupon')],
    }),
    resolve: {
      manager: (g) => say(g, null, 'Escalated', 'The manager arrived and the customer was somehow even louder. You watched from a safe distance.', 'I called my manager on a rude customer.', { happiness: 2 }),
      calm: (g) => say(g, null, ['Customer service legend', 'Unshakeable'], 'You stayed so calm and polite that the customer eventually apologized. A miracle.', 'I handled a rude customer with kindness.', { perf: 6, karma: 4 }, 'good'),
      snap: (g) => say(g, null, 'Finally', 'You told them exactly what you thought. It felt incredible. Your manager disagreed.', 'I snapped at a rude customer at work.', { happiness: 8, perf: -12 }, 'bad'),
      honor: (g) => say(g, null, 'Path of least resistance', 'You honored the coupon. They left without saying thank you.', 'I honored an expired coupon to calm down a rude customer.', { perf: -2, happiness: -2 }),
    },
  },
  {
    id: 'work.afterHours',
    emoji: '🍽️',
    title: 'After Hours',
    minAge: 18,
    maxAge: 80,
    when: fullTime,
    setup: (g) => {
      const b = boss(g)
      const outing = pick(g, ['play golf', 'go to a jazz club', 'grab dinner at a steakhouse', 'go to a hockey game'])
      return {
        text: `Your supervisor, ${b.first}, has taken a liking to you and asked you to ${outing} with them. You're worried your coworkers will be jealous. What will you do?`,
        choices: [ch('go', 'Do it'), ch('decline', 'Politely decline')],
        person: b.p,
        data: { outing },
      }
    },
    resolve: {
      go: (g, x) => say(g, x, 'Inner circle', `You went to ${x.s('outing')} with your boss and had a great time. Your coworkers have noticed.`, `I went to ${x.s('outing')} with my boss.`, { perf: 10, happiness: 6, rel: 12 }, 'good'),
      decline: (g, x) => say(g, x, 'Boundaries', 'You politely declined. Your boss said "no worries," but seemed a little hurt.', 'I declined an after-hours invitation from my boss.', { rel: -5 }),
    },
  },
  {
    id: 'work.collection',
    emoji: '🎁',
    title: 'Office Collection',
    minAge: 16,
    maxAge: 80,
    when: hasJob,
    setup: (g) => {
      const c = coworker(g)
      const reason = pick(g, ['birthday', 'retirement', 'new baby', 'farewell'])
      return {
        text: `Someone is passing around an envelope to collect money for ${c.first}'s ${reason} gift. What will you do?`,
        choices: [ch('generous', 'Put in $20'), ch('small', 'Put in $2'), ch('sign', 'Just sign the card'), ch('skip', 'Pretend I didn\'t see it')],
        person: c.p,
        data: { ...cwData(c), reason },
      }
    },
    resolve: {
      generous: (g, x) => {
        if (g.character.money < 20) return say(g, x, 'Broke', 'You opened your wallet and a moth flew out. You signed the card instead.', null, { rel: 2 })
        say(g, x, 'Generous', `You put in $20. ${nameOf(x)} was touched by the gift.`, `I chipped in $20 for my coworker ${nameOf(x)}'s ${x.s('reason')} gift.`, { money: -20, rel: 10, karma: 3 }, 'good')
      },
      small: (g, x) => say(g, x, 'Every bit counts', 'You put in $2 and a button. Nobody can prove it was you.', `I chipped in $2 for a coworker's gift.`, { money: -Math.min(Math.max(0, g.character.money), 2), rel: 2 }),
      sign: (g, x) => say(g, x, 'Heartfelt', `You wrote "Congrats!!" with three exclamation points. ${nameOf(x)} will never read it.`, null, { rel: 1 }),
      skip: (g, x) => say(g, x, 'Cheapskate', 'You hid in the bathroom until the envelope passed. Someone noticed.', null, { rel: -5, karma: -2 }),
    },
  },
])
