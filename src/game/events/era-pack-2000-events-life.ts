// Era pack 2000-2026: more popups, for work, school and home in the age of the dot-com bust,
// always-on email, the gig economy, the pandemic years (told with tact) and AI chatbots at school.
// Outcomes are weighted rolls; money is always engine dollars from eraPrice(); real brands only
// as touchstones.
import { endJob, earnIncome, formatMoney, parents } from '../core'
import { hasTalent } from '../talents'
import { employerRef } from '../shops/everyday-brands'
import type { EventDef } from './helpers'
import { friends, jobCompany, money } from './helpers'
import { adoption, eraEvents, eraPrice, wealthOf, type EraEventSpec } from './era-late-kit'

const consumer = (g: Parameters<typeof wealthOf>[0]): boolean => wealthOf(g) >= 0.3
const fullTime = (g: Parameters<typeof wealthOf>[0]): boolean => g.character.job?.category === 'fulltime'
const company = (g: Parameters<typeof wealthOf>[0]): string => employerRef(jobCompany(g), 'your company')
const inSchool = (g: Parameters<typeof wealthOf>[0]): boolean => !!g.character.education.current
const firstParent = (g: Parameters<typeof parents>[0]) => parents(g).find((p) => p.alive)

const SPECS: EraEventSpec[] = [
  {
    id: 'era.2000s.dotcomBust',
    emoji: '\u{1F4C9}',
    title: 'The Bubble Bursts',
    minAge: 21,
    maxAge: 60,
    years: [2000, 2002],
    weight: 26,
    once: true,
    when: (g) => fullTime(g) && adoption(g, 'internet', 0.1) && wealthOf(g) >= 0.6,
    text: (g) => ({
      text: `Technology shares have collapsed, and the free soda fridge at ${company(g)} was locked this morning. A memo announces that "market conditions" will cost the company a third of its staff by Friday. The mood in the elevator is funereal. What will you do?`,
      data: { salary: g.character.job?.salary ?? 0 },
    }),
    opts: [
      {
        id: 'severance',
        label: 'Take the severance package',
        emoji: '\u{1F4E6}',
        outs: [
          {
            t: 'Boxed Up',
            x: (_g, x) => `You packed your desk plant into a cardboard box and took ${formatMoney(Math.round(x.n('salary') * 0.25))} in severance. You were not alone: half the elevator held a box.`,
            l: 'I lost my job when the dot-com bubble burst.',
            fx: (_g, x) => ({ money: Math.round(x.n('salary') * 0.25), happiness: -6 }),
            tone: 'bad',
            after: (g) => endJob(g, 'job', 'laid off'),
          },
        ],
      },
      {
        id: 'stay',
        label: 'Keep my head down and work harder',
        emoji: '\u{1F647}',
        outs: [
          { w: 6, t: 'Survivor', x: 'Your name was not on the list. You inherited the work of three colleagues and a window seat, and you will be eating lunch at your desk for a year.', l: 'I survived the dot-com layoffs, barely.', fx: { perf: 7, happiness: -4, health: -2 } },
          {
            w: 4,
            t: 'On the List',
            x: 'You kept your head down and worked harder than ever. When the list was posted, your name was on it anyway, two lines above your manager’s.',
            l: 'I was laid off in the dot-com bust despite working hard.',
            fx: { happiness: -9 },
            tone: 'bad',
            after: (g) => {
              const sev = Math.round((g.character.job?.salary ?? 0) * 0.15)
              endJob(g, 'job', 'laid off')
              if (sev > 0) earnIncome(g, sev, 'severance')
            },
          },
        ],
      },
      {
        id: 'jump',
        label: 'Call a competitor before the news spreads',
        emoji: '\u{1F4DE}',
        outs: [
          { w: 4, t: 'Lifeboat', x: 'A competitor was still hiring, quietly, and offered you a desk and a modest raise. You started the following Monday, and no one asked about the sodas.', l: 'I jumped to a competitor just before the layoffs.', fx: { perf: 4, happiness: 5 }, tone: 'good' },
          { w: 6, t: 'Everyone Had the Same Idea', x: 'Every competitor had a hiring freeze, a waiting list and an unanswered inbox. You kept your job for now, but the effort showed.', fx: { perf: -3, happiness: -2 } },
        ],
      },
    ],
  },
  {
    id: 'era.2000s.onlineOrder',
    emoji: '\u{1F4E6}',
    title: 'The First Online Order',
    minAge: 18,
    maxAge: 70,
    years: [2000, 2012],
    weight: 18,
    once: true,
    when: (g) => adoption(g, 'onlineShopping', 0.05) && adoption(g, 'creditCards', 0.2) && consumer(g),
    text: (g) => ({
      text: `You are about to buy something over the internet for the first time. The page asks for your credit card number, which you have only ever given to a person in a shop. Your mother says you will be robbed. A book costs ${money(eraPrice(g, 18))}, a pair of shoes ${money(eraPrice(g, 90))}. What will you do?`,
      data: { book: eraPrice(g, 18), shoes: eraPrice(g, 90) },
    }),
    opts: [
      {
        id: 'book',
        label: 'Start small with a book',
        emoji: '\u{1F4D6}',
        when: (g) => g.character.money >= eraPrice(g, 18),
        outs: [{ t: 'Package in the Mail', x: 'The book arrived in a cardboard box eight days later with a packing slip, and an apology you did not need. It was the best present you ever gave yourself.', fx: (_g, x) => ({ money: -x.n('book'), happiness: 5, smarts: 1 }) }],
      },
      {
        id: 'shoes',
        label: 'Order shoes, because I am daring',
        emoji: '\u{1F45F}',
        when: (g) => g.character.money >= eraPrice(g, 90),
        outs: [
          { w: 6, t: 'Perfect Fit', x: 'The shoes arrived in a box three days early and fit like they were made for you. You wore them straight to the office.', l: 'I bought shoes online for the first time.', fx: (_g, x) => ({ money: -x.n('shoes'), happiness: 6 }), tone: 'good' },
          { w: 4, t: 'Not Quite', x: 'The shoes looked nothing like the photograph and were a size too small. Sending them back took eleven forms.', fx: (_g, x) => ({ money: -Math.round(x.n('shoes') * 0.2), happiness: -4 }), tone: 'bad' },
        ],
      },
      {
        id: 'shop',
        label: 'Keep shopping in person',
        emoji: '\u{1F6CD}\u{FE0F}',
        outs: [{ t: 'Old Habits', x: 'You walked to the shop, tried on three pairs and chatted with the assistant. It was pleasant, and expensive, and a little slow.', fx: { happiness: 2 } }],
      },
    ],
  },
  {
    id: 'era.2000s.ringtone',
    emoji: '\u{1F3B6}',
    title: 'Ringtone Craze',
    minAge: 12,
    maxAge: 40,
    years: [2002, 2008],
    weight: 18,
    cooldown: 6,
    when: (g) => adoption(g, 'mobilePhone', 0.25) && consumer(g),
    text: (g) => ({
      text: `Everyone at school is buying ringtones: tinny, polyphonic versions of the hit song of the summer, advertised on TV for ${money(eraPrice(g, 3))} each. Your phone still goes "ring ring" like a telephone from your grandmother's hallway. What will you do?`,
      data: { tone: eraPrice(g, 3) },
    }),
    opts: [
      {
        id: 'buy',
        label: 'Buy the song everybody has',
        emoji: '\u{1F4B8}',
        when: (g) => g.character.money >= eraPrice(g, 3),
        outs: [
          { w: 5, t: 'Hit Parade', x: 'Your phone played the chorus, and so did eleven others in the canteen. Everyone picked up at once.', fx: (_g, x) => ({ money: -x.n('tone'), happiness: 5 }) },
          { w: 5, t: 'Subscription', x: 'The small print said the ringtone was a subscription. The next bill had five other "free" ringtones that you never ordered.', fx: (_g, x) => ({ money: -x.n('tone') * 4, happiness: -3 }), tone: 'bad' },
        ],
      },
      {
        id: 'compose',
        label: 'Compose one myself on the keypad',
        emoji: '\u{1F3B9}',
        outs: [
          { w: (g) => (hasTalent(g, 'Music') ? 8 : 4), t: 'Original Composition', x: 'It took you the whole evening to type in a melody note by note. The result sounded like a small robot humming a hit, and people asked where you got it.', fx: { happiness: 6, smarts: 1, fame: 1 }, tone: 'good' },
          { w: (g) => (hasTalent(g, 'Music') ? 2 : 6), t: 'Beep Beep', x: 'The melody sounded like a microwave dying. You kept it for a month out of stubbornness, and you were the only one.', fx: { happiness: 1 } },
        ],
      },
      {
        id: 'ring',
        label: 'Keep the classic ring',
        emoji: '\u{260E}\u{FE0F}',
        outs: [{ t: 'Retro', x: 'You kept the original ring. At least everyone knew when you were being called, and nobody had to ask whether it was theirs.', fx: { happiness: 0 } }],
      },
    ],
  },
  {
    id: 'era.2000s.alwaysOn',
    emoji: '\u{1F4E7}',
    title: 'Always On',
    minAge: 22,
    maxAge: 62,
    years: [2004, 2014],
    weight: 20,
    cooldown: 6,
    when: (g) => fullTime(g) && adoption(g, 'mobilePhone', 0.2) && adoption(g, 'internet', 0.15) && wealthOf(g) >= 0.5,
    text: (g) => ({
      text: `${company(g)} has given you ${g.year <= 2012 ? 'a BlackBerry, a small handheld device' : 'a work smartphone'} that delivers your work email wherever you are. It buzzes at dinner, at the cinema and once, memorably, in the middle of a funeral. What will you do?`,
    }),
    opts: [
      {
        id: 'always',
        label: 'Answer everything, immediately',
        emoji: '\u{26A1}',
        outs: [
          { w: 6, t: 'Employee of the Month', x: 'You answered an email at 11:48 p.m. and again at 5:02 a.m. Your manager noticed. Your partner noticed too, though not in the same way.', l: 'I answered work email at all hours on my new handheld.', fx: { perf: 7, happiness: -5, health: -1 } },
          { w: 4, t: 'Burnt Out', x: 'You answered every email at every hour, and by the end of the quarter you could not read a screen without feeling ill. The company sent you a very nice fruit basket.', fx: { perf: 3, happiness: -9, health: -4 }, tone: 'bad' },
        ],
      },
      {
        id: 'off',
        label: 'Switch it off after seven o’clock',
        emoji: '\u{1F4F4}',
        outs: [
          { w: 6, t: 'Boundaries', x: 'You told your manager you would reply first thing in the morning. They sighed and agreed. Nothing collapsed overnight.', fx: { happiness: 4, perf: -1, health: 1 } },
          { w: 4, t: 'Missed Call', x: 'You switched it off at seven. At eight, something went wrong, and it was you the manager needed. The next morning was very tense.', fx: { happiness: -2, perf: -5 }, tone: 'bad' },
        ],
      },
      {
        id: 'ask',
        label: 'Ask to be paid for being on call',
        emoji: '\u{1F4B0}',
        outs: [
          { w: 3, t: 'On-Call Pay', x: 'To your surprise, your manager said yes. You received a small allowance for being reachable, and an even smaller sense of freedom.', fx: (g) => ({ money: eraPrice(g, 600), happiness: 2 }), tone: 'good' },
          { w: 7, t: 'The Answer Is No', x: 'Your manager smiled warmly and explained that this was an "opportunity." You were not convinced.', fx: { perf: -2, happiness: -2 } },
        ],
      },
    ],
  },
  {
    id: 'era.2020s.remoteSchool',
    emoji: '\u{1F4BB}',
    title: 'School on a Screen',
    minAge: 6,
    maxAge: 24,
    years: [2020, 2021],
    weight: 40,
    once: true,
    when: (g) => inSchool(g),
    text: () => ({
      text: 'Your school has closed its doors, and lessons now arrive on a screen at the kitchen table. Your teacher is a small rectangle with a frozen face. Everybody is tired and a bit scared, and nobody is quite sure how any of this works. What will you do?',
    }),
    opts: [
      {
        id: 'follow',
        label: 'Turn the camera on and follow the lessons',
        emoji: '\u{1F4D8}',
        outs: [{ t: 'Making It Work', x: 'You sat at the table with a notebook, a mug and the camera on, and followed along. It was exhausting and lonely, and you got through every lesson.', l: 'I kept up with school on a screen at the kitchen table.', fx: { grades: 4, smarts: 1, happiness: -3, discipline: 2 } }],
      },
      {
        id: 'off',
        label: 'Camera off, game on in another window',
        emoji: '\u{1F3AE}',
        outs: [
          { w: 6, t: 'Out of Sight', x: 'You discovered that nobody could see what you did. You spent the term mostly in another window, and your grades have slid.', fx: { grades: -4, happiness: 3, smarts: -1 }, tone: 'bad' },
          { w: 4, t: 'Called On', x: 'Your teacher asked you a question just as your character in the game met a dragon. You said "Can you repeat that?" three times.', fx: { grades: -3, happiness: -2 }, tone: 'bad' },
        ],
      },
      {
        id: 'group',
        label: 'Start a study call with friends',
        emoji: '\u{1F465}',
        when: (g) => friends(g).length > 0,
        outs: [{ t: 'Study Group', x: 'You and three friends opened a call on weekday afternoons to work on homework together, with the cameras on and your snacks off-screen. It was the best part of the day.', fx: { grades: 3, happiness: 5, rel: 5 }, tone: 'good' }],
      },
      {
        id: 'help',
        label: 'Tell my teacher I am struggling',
        emoji: '\u{1F64B}',
        outs: [{ t: 'Asking for Help', x: 'You sent a message saying that you were behind and anxious. The teacher replied with a time slot, a kind word and extra worksheets. It was a relief.', fx: { grades: 3, happiness: 3 } }],
      },
    ],
  },
  {
    id: 'era.2020s.remoteWork',
    emoji: '\u{1F3E0}',
    title: 'The Office at Home',
    minAge: 22,
    maxAge: 64,
    years: [2020, 2026],
    weight: 22,
    cooldown: 5,
    when: (g) => fullTime(g) && adoption(g, 'internet', 0.3) && wealthOf(g) >= 0.5,
    text: (g) => ({
      text: `${company(g)} has told everybody to work from home. Your desk is now the kitchen table, your coworkers are tiles on a screen and your commute is eleven steps. It is Tuesday. What will you do?`,
    }),
    opts: [
      {
        id: 'routine',
        label: 'Keep strict office hours and a proper desk',
        emoji: '\u{1F4C5}',
        outs: [{ t: 'Structure', x: 'You got dressed, started at nine and finished at five. You miss the office a little less than you expected.', fx: { perf: 5, happiness: 1, discipline: 2 } }],
      },
      {
        id: 'flex',
        label: 'Work whenever I feel productive',
        emoji: '\u{1F319}',
        outs: [
          { w: 5, t: 'Night Owl', x: 'You did your best work at 10 p.m. and slept until nine. Your productivity went up and your sleep schedule went sideways.', fx: { perf: 3, happiness: 4, health: -1 } },
          { w: 5, t: 'Slipping', x: 'You promised yourself you would catch up in the evening. The evening had other plans. Your manager sent a very polite message about deadlines.', fx: { perf: -5, happiness: -1 }, tone: 'bad' },
        ],
      },
      {
        id: 'move',
        label: 'Work from somewhere else for a while',
        emoji: '\u{1F3DD}\u{FE0F}',
        when: (g) => g.character.money >= eraPrice(g, 800),
        outs: [
          { w: 6, t: 'Laptop on a Beach', x: 'You rented a small place by the sea for a month and took your video calls with a view. The Wi-Fi dropped only twice.', l: 'I worked remotely from somewhere beautiful for a month.', fx: (g) => ({ money: -eraPrice(g, 800), happiness: 9, perf: 1 }), tone: 'good' },
          { w: 4, t: 'Bad Connection', x: 'The place was lovely, but the internet was not. Half your meetings were conducted from a car park with the best signal in town.', fx: (g) => ({ money: -eraPrice(g, 800), happiness: 2, perf: -3 }) },
        ],
      },
      {
        id: 'lonely',
        label: 'Admit I miss the people',
        emoji: '\u{1F91D}',
        outs: [{ t: 'Virtual Coffee', x: 'You invited three colleagues to a ten-minute call every morning with no agenda. The meetings were awkward at first, then the best part of the week.', fx: { happiness: 5, perf: 2, rel: 2 } }],
      },
    ],
  },
  {
    id: 'era.2020s.pandemicBirthday',
    emoji: '\u{1F382}',
    title: 'A Birthday in Strange Times',
    minAge: 4,
    maxAge: 80,
    years: [2020, 2021],
    weight: 32,
    once: true,
    text: () => ({
      text: 'Your birthday arrived in the middle of the pandemic, when gatherings were discouraged and everyone was careful. The usual party is not possible. What will you do?',
    }),
    opts: [
      {
        id: 'call',
        label: 'Have a party on a video call',
        emoji: '\u{1F4F9}',
        outs: [{ t: 'Pixels and Cake', x: 'Twenty faces sang to you from twenty kitchens, a little out of sync. You blew out a candle and your grandmother clapped, though she was muted.', l: 'I celebrated my birthday on a video call during the pandemic.', fx: { happiness: 5, rel: 3 }, tone: 'good' }],
      },
      {
        id: 'drive',
        label: 'Let friends and family drive past with signs',
        emoji: '\u{1F698}',
        outs: [{ t: 'Honk If You Love Me', x: 'A parade of cars, balloons and honking horns rolled slowly down your street, with people waving from their windows. You stood at the curb and cried a little.', fx: { happiness: 7, rel: 4 }, tone: 'good' }],
      },
      {
        id: 'garden',
        label: 'A few people in the open air, far apart',
        emoji: '\u{1F333}',
        outs: [
          { w: 8, t: 'Fresh Air', x: 'A handful of people stood on the grass in a wide circle, wearing masks until the cake came. Everyone shouted a little louder than usual, and it was lovely.', fx: { happiness: 6, rel: 3 } },
          { w: 2, t: 'Rain', x: 'It rained, naturally. You moved the cake under an umbrella and sang to it as fast as possible.', fx: { happiness: 2 } },
        ],
      },
      {
        id: 'quiet',
        label: 'Keep it quiet and celebrate next year',
        emoji: '\u{1F54A}\u{FE0F}',
        outs: [{ t: 'Next Year', x: 'You had cake with the people in your house and promised yourself that the next one would be the biggest. It is a promise worth keeping.', fx: { happiness: 1 } }],
      },
    ],
  },
  {
    id: 'era.2020s.aiHomework',
    emoji: '\u{1F916}',
    title: 'The Chatbot Does My Homework',
    minAge: 12,
    maxAge: 30,
    years: [2023, 2026],
    weight: 36,
    cooldown: 3,
    when: (g) => inSchool(g) && adoption(g, 'aiAssistants', 0.1),
    text: () => ({
      text: 'Your essay on a book you only half read is due tomorrow. A chatbot can write it in nine seconds, in a style that sounds suspiciously like an adult. Your teacher has announced that she can "always tell." What will you do?',
    }),
    opts: [
      {
        id: 'copy',
        label: 'Paste it in and hand it over',
        emoji: '\u{1F4CB}',
        hint: { talent: 'Academics', of: 0, text: (pct) => `Your teachers know your real voice: about ${pct}% the essay is flagged.` },
        outs: [
          { w: (g) => (hasTalent(g, 'Academics') ? 55 : 35), t: 'Flagged', x: 'Your teacher read three sentences, looked up and said "This doesn\'t sound like you." You were asked to redo the essay in class, with a pencil and no tool in sight.', l: 'My teacher caught me handing in a chatbot essay.', fx: { grades: -7, karma: -3, happiness: -6, smarts: -1 }, tone: 'bad' },
          { w: (g) => (hasTalent(g, 'Academics') ? 45 : 65), t: 'Straight to the Top', x: 'Your essay got an A. You did not learn a word of the book, and the grade does not make you feel proud.', fx: { grades: 4, karma: -2, smarts: -1, happiness: 1 } },
        ],
      },
      {
        id: 'tutor',
        label: 'Ask it to explain the book, then write my own essay',
        emoji: '\u{1F9D1}\u{200D}\u{1F3EB}',
        outs: [{ t: 'Study Buddy', x: 'You asked the chatbot a dozen questions about the characters and the ending, and then wrote the essay yourself. It was the best thing you had written all year.', l: 'I used a chatbot as a tutor and wrote my own essay.', fx: { grades: 4, smarts: 3, happiness: 2 }, tone: 'good' }],
      },
      {
        id: 'draft',
        label: 'Write a draft, then ask the bot to find the mistakes',
        emoji: '\u{270D}\u{FE0F}',
        outs: [{ t: 'Second Opinion', x: 'You wrote your own draft and asked the chatbot to point out weak spots. It found three. You fixed two, and argued with the third.', fx: { grades: 3, smarts: 2, happiness: 1 } }],
      },
      {
        id: 'read',
        label: 'Close the laptop and actually read the book',
        emoji: '\u{1F4D6}',
        outs: [
          { w: 6, t: 'Old School', x: 'You read the last hundred pages by lamplight and wrote the essay in a feverish two hours. It was not your best work, but it was entirely yours.', fx: { smarts: 3, grades: 1, happiness: -1, willpower: 2 } },
          { w: 4, t: 'Night Before', x: 'You read forty pages, panicked and wrote 600 words of confident nonsense. You were proud of the vocabulary.', fx: { smarts: 1, grades: -1, happiness: -2 } },
        ],
      },
    ],
  },
  {
    id: 'era.2010s.gigWork',
    emoji: '\u{1F6B2}',
    title: 'Evening Shifts',
    minAge: 18,
    maxAge: 60,
    years: [2013, 2026],
    // Mostly an option for people who need the money.
    weight: (g) => (g.character.money < 20000 ? 18 : 4),
    cooldown: 6,
    when: (g) => adoption(g, 'smartphone', 0.3) && adoption(g, 'rideHailing', 0.04),
    text: (g) => ({
      text: `Money is tight, and an app says you can start earning tonight by delivering food or driving strangers, whenever you like. You do not need an interview. You do need a phone, a way to get around and a thick skin. A good week might pay ${money(eraPrice(g, 250))}. What will you do?`,
      data: { week: eraPrice(g, 250) },
    }),
    opts: [
      {
        id: 'bike',
        label: 'Deliver food by bicycle in the evenings',
        emoji: '\u{1F6B2}',
        outs: [
          { w: 7, t: 'Quick Cash', x: 'You rode through the evening rush with an insulated bag and a map in your pocket. A month later, you had earned a decent amount and the legs of a cyclist.', l: 'I delivered food by bicycle in the evenings for extra money.', fx: (_g, x) => ({ money: x.n('week') * 3, health: 2, happiness: 1 }), tone: 'good' },
          { w: 3, t: 'Hit and Run', x: 'A delivery in the rain ended with a fall and a scraped knee. You earned money, lost a weekend and learned to wear a helmet.', fx: (_g, x) => ({ money: x.n('week') * 2, health: -4, happiness: -2 }), tone: 'bad' },
        ],
      },
      {
        id: 'drive',
        label: 'Drive strangers around at night',
        emoji: '\u{1F697}',
        when: (g) => g.assets.some((a) => a.kind === 'car'),
        outs: [
          { w: 6, t: 'Rating Five Stars', x: 'You drove forty strangers across town in a month and learned more about the city than you ever did before. Your rating survived, just.', fx: (_g, x) => ({ money: x.n('week') * 3, health: -1, happiness: 1 }) },
          { w: 4, t: 'Wear and Tear', x: 'Between fuel, insurance and repairs, the car ate half of everything you earned. The other half did not feel like a lot.', fx: (_g, x) => ({ money: x.n('week'), happiness: -3 }), tone: 'bad' },
        ],
      },
      {
        id: 'pass',
        label: 'Skip it and look for a regular job',
        emoji: '\u{1F4C4}',
        outs: [{ t: 'Steady Steps', x: 'You spent the weekend polishing your résumé instead. It took longer, but the job you got paid a fixed salary and came with a chair.', fx: { smarts: 1, happiness: 1 } }],
      },
    ],
  },
  {
    id: 'era.2010s.phoneFree',
    emoji: '\u{1F4F5}',
    title: 'Phones in the Basket',
    minAge: 12,
    maxAge: 60,
    years: [2012, 2026],
    weight: 18,
    cooldown: 5,
    when: (g) => adoption(g, 'smartphone', 0.3) && (!!firstParent(g) || friends(g).length > 0),
    text: () => ({
      text: 'At dinner, every person at the table is looking at a small glowing screen. Somebody suggests a rule: everyone puts their phone in a basket by the door until dessert. There are groans. Your screen buzzes. What will you do?',
    }),
    opts: [
      {
        id: 'basket',
        label: 'Put it in the basket and enjoy the meal',
        emoji: '\u{1F9FA}',
        outs: [{ t: 'Eye Contact', x: 'For forty minutes you talked, told stories and laughed at your own bad jokes. It was the longest conversation you had had in months.', l: 'I put my phone in a basket at dinner and finally talked to people.', fx: { happiness: 5, rel: 5 }, tone: 'good' }],
      },
      {
        id: 'cheat',
        label: 'Slip my phone under the table',
        emoji: '\u{1F575}\u{FE0F}',
        outs: [
          { w: 5, t: 'Under the Table', x: 'You checked your messages twice and nobody noticed. You also missed three jokes and an entire story about your cousin.', fx: { happiness: 1, rel: -2 } },
          { w: 5, t: 'Busted', x: 'Your phone lit up under the table like a lantern. The whole table pointed. Dessert was served to everyone except you.', fx: { happiness: -3, rel: -3 }, tone: 'bad' },
        ],
      },
      {
        id: 'argue',
        label: 'Argue that the rule is unfair',
        emoji: '\u{1F5E3}\u{FE0F}',
        outs: [{ t: 'Parliament of Dinner', x: 'You made a long speech about how phones are how people connect now. It was a good speech, and the basket stayed on the shelf for the rest of the evening.', fx: { happiness: 1, smarts: 1 } }],
      },
    ],
  },
  {
    id: 'era.2000s.flashing',
    emoji: '\u{1F4F1}',
    title: 'Call Me Back',
    minAge: 13,
    maxAge: 50,
    years: [2002, 2014],
    weight: 24,
    cooldown: 4,
    when: (g) => wealthOf(g) < 0.45 && adoption(g, 'mobilePhone', 0.08),
    text: (g) => {
      const f = friends(g)[0]
      return {
        text: `You have ${money(eraPrice(g, 0.2))} of credit left on your phone, and a message to get to ${f ? f.firstName : 'a friend'} before tonight. A call costs more than you have. A text costs just a little. A friend suggests the old trick of letting it ring once and hanging up. What will you do?`,
        person: f,
        data: { credit: eraPrice(g, 0.2) },
      }
    },
    opts: [
      {
        id: 'text',
        label: 'Send a short message and save the credit',
        emoji: '\u{2709}\u{FE0F}',
        outs: [{ t: 'Short and Sweet', x: 'You wrote the whole message in eleven abbreviated words and counted every character, because the message was cut off at one hundred and sixty. It arrived, and it was enough.', fx: (_g, x) => ({ money: -Math.round(x.n('credit') * 0.2), happiness: 2, smarts: 1 }) }],
      },
      {
        id: 'ring',
        label: 'Let it ring once and hang up',
        emoji: '\u{1F4DE}',
        outs: [
          { w: 6, t: 'The Code', x: (_g, x) => `${x.p?.firstName ?? 'Your friend'} saw the missed call, understood at once and called you back, paying for the conversation. It is an unwritten rule that you will pay next time.`, fx: { happiness: 3, rel: 1 } },
          { w: 4, t: 'Free Rider', x: (_g, x) => `${x.p?.firstName ?? 'Your friend'} was out of credit as well, and neither of you called the other. The message was never delivered, and you both thought the other one was angry.`, fx: { happiness: -3, rel: -3 }, tone: 'bad' },
        ],
      },
      {
        id: 'call',
        label: 'Make the call and talk fast',
        emoji: '\u{23F1}\u{FE0F}',
        when: (g) => g.character.money >= eraPrice(g, 0.2),
        outs: [{ t: 'Credit Gone', x: 'You spoke so fast that your friend asked you to repeat everything. Then the line cut out. Your credit went to zero in the middle of "see you at," and the friend still showed up.', fx: (_g, x) => ({ money: -x.n('credit'), happiness: 1 }) }],
      },
      {
        id: 'walk',
        label: 'Walk over and tell them in person',
        emoji: '\u{1F6B6}',
        outs: [{ t: 'The Long Way', x: 'You walked twenty minutes in the heat to deliver a message that could have been a text. You also got a cold drink and a very long conversation out of it.', fx: { happiness: 3, health: 1, rel: 3 } }],
      },
    ],
  },
  {
    id: 'era.2000s.memoryCard',
    emoji: '\u{1F4BE}',
    title: 'The Memory Card Stall',
    minAge: 11,
    maxAge: 45,
    years: [2005, 2015],
    weight: 24,
    cooldown: 5,
    when: (g) => wealthOf(g) < 0.5 && adoption(g, 'mobilePhone', 0.2),
    text: (g) => ({
      text: `At a stall by the bus station, a man with a laptop and a tray of tiny memory cards will load your phone with two hundred songs or a few films for ${money(eraPrice(g, 1))}. Half the street has songs from his shop. Your friends also swap songs by short-range wireless. What will you do?`,
      data: { fee: eraPrice(g, 1) },
    }),
    opts: [
      {
        id: 'pay',
        label: 'Pay the man and choose the songs',
        emoji: '\u{1F3B5}',
        when: (g) => g.character.money >= eraPrice(g, 1),
        outs: [{ t: 'Full Card', x: 'You handed over a few coins and left with two hundred songs, three films and one folder you never opened. Your phone became the most popular device in the compound.', l: 'I loaded my phone with songs at a memory card stall.', fx: (_g, x) => ({ money: -x.n('fee'), happiness: 7 }), tone: 'good' }],
      },
      {
        id: 'share',
        label: 'Swap songs with friends',
        emoji: '\u{1F91D}',
        when: (g) => friends(g).length > 0,
        outs: [
          { w: 8, t: 'Chain Letter of Songs', x: 'You sent songs from phone to phone across the group. A friend of a friend of a cousin had the one you had been looking for, and the whole circle ended up with the same playlist.', fx: { happiness: 5, rel: 4 } },
          { w: 2, t: 'Uninvited Guest', x: 'One of the files carried something extra, and your phone began to restart every three minutes. It cost a stall owner and a week of patience to put right.', fx: (g) => ({ money: -eraPrice(g, 1.5), happiness: -3 }), tone: 'bad' },
        ],
      },
      {
        id: 'radio',
        label: 'Stick with the radio on my phone',
        emoji: '\u{1F4FB}',
        outs: [{ t: 'Free and Live', x: 'You listened to whatever the station played, which was a surprise more often than not. You discovered three singers you would never have chosen yourself.', fx: { happiness: 2 } }],
      },
    ],
  },
  {
    id: 'era.2010s.borrowedPhone',
    emoji: '\u{1F4F2}',
    title: 'A Smartphone for Ten Minutes',
    minAge: 11,
    maxAge: 50,
    years: [2011, 2020],
    weight: 24,
    cooldown: 5,
    when: (g) => wealthOf(g) < 0.4 && adoption(g, 'smartphone', 0.03) && !adoption(g, 'smartphone', 0.5),
    text: (g) => {
      const f = friends(g)[0]
      return {
        text: `${f ? f.firstName : 'A cousin'} has a smartphone, a gift from an uncle abroad, and says you can use it for ten minutes. Data is expensive, and a megabyte feels like a bar of soap. What will you do?`,
        person: f,
      }
    },
    opts: [
      {
        id: 'learn',
        label: 'Look up something useful for school or work',
        emoji: '\u{1F50D}',
        outs: [{ t: 'Ten Useful Minutes', x: 'You searched for the answer to a question that had bothered you all week, and found it, with a video. The ten minutes felt like ten hours in the best way.', fx: { smarts: 3, happiness: 3 } }],
      },
      {
        id: 'video',
        label: 'Watch a funny video',
        emoji: '\u{1F602}',
        outs: [{ t: 'Worth the Data', x: 'You watched a video of a goat in a wedding dress, which made you laugh until you cried. The data it used was worth a loaf of bread, and nobody regretted a minute.', fx: { happiness: 8 } }],
      },
      {
        id: 'call',
        label: 'Video-call a relative who lives abroad',
        emoji: '\u{1F4F9}',
        outs: [
          { w: 6, t: 'Face to Face', x: 'The picture was blurry and the sound dropped twice, but for the first time in six years you saw your aunt\u2019s face. She cried. You cried. The data ran out two minutes later.', l: 'I saw a faraway relative on a video call for the first time.', fx: { happiness: 11, rel: 4 }, tone: 'good' },
          { w: 4, t: 'Frozen', x: 'The connection froze on your aunt\u2019s face, mouth open. You said hello to the frozen picture for four minutes.', fx: { happiness: 2 } },
        ],
      },
      {
        id: 'return',
        label: 'Hand it back politely',
        emoji: '\u{1F64F}',
        outs: [{ t: 'Not Today', x: 'You thanked your friend, handed back the phone and went home. It sat on your mind for weeks, like a brightly colored fish you could not catch.', fx: { happiness: -1 } }],
      },
    ],
  },
]

export const EVENTS_2000_LIFE: EventDef[] = eraEvents(SPECS)
