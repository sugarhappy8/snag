// Era pack 1946-1979, popup events for grown-up life: the free health service, the wedding dress
// sewn from parachute silk, the Tupperware party, life in the new suburb, the supermarket and the
// shopping center, the fallout shelter, a strike, a protest march, the Pill, the gas line, CB
// radio, a scooter and the disco floor. Ids start with 'era.1946.'.
import { techOdds } from '../history/timeline'
import { chance } from '../rng'
import { aParent, ch, defineEvents, money, say } from './helpers'
import { at, rationed } from './era-pack-where'
import { itemCost } from './era-pack-kit'

/** Countries where the contraceptive pill was on sale to married women by the given year. */
const PILL_FROM: Readonly<Record<string, number>> = {
  us: 1961, ca: 1961, gb: 1961, au: 1961, nz: 1961, de: 1961, nl: 1962, se: 1964, no: 1967, dk: 1966, fi: 1962, at: 1969, ch: 1962, be: 1965, fr: 1967, it: 1971, es: 1978, ie: 1973, jp: 2000,
}

export const ADULT_EVENTS_1946 = defineEvents([
  {
    id: 'era.1946.nhs',
    emoji: '🏥',
    title: 'Free at the Point of Use',
    minAge: 3,
    maxAge: 90,
    once: true,
    weight: 80,
    when: (g) => g.character.countryId === 'gb' && g.year >= 1948 && g.year <= 1950,
    setup: () => ({
      text: 'A brand-new national health service has opened its doors: doctors, hospitals, dentists and opticians, free for everyone when they need them. There is a queue of people stretching around the block for spectacles and false teeth. Everyone you know is talking about it. What will you do?',
      choices: [ch('eyes', 'Join the queue for an eye test and glasses', '👓'), ch('teeth', 'Get your teeth seen to at last', '🦷'), ch('wait', 'Wait and see if it lasts', '🤔')],
    }),
    resolve: {
      eyes: (g, x) => say(g, x, 'Seeing Clearly', 'The optician put a frame on your nose and flipped a lens. Suddenly the leaves had edges, the print had gaps and your sister’s face had a freckle you’d never noticed. The glasses cost you nothing, and the world cost nothing to look at.', 'I got free spectacles from the new health service.', { happiness: 6, smarts: 2, health: 2 }, 'good'),
      teeth: (g, x) => say(g, x, 'The Dentist at Last', 'The dentist whistled gently at the state of things. Some fillings and an extraction later, he sent you home with a pamphlet and a lecture about sugar. For the first time in years, you could chew on both sides.', 'I got my teeth fixed on the new health service.', { happiness: 4, health: 4, looks: 1 }, 'good'),
      wait: (g, x) => say(g, x, 'The Cautious One', 'You told everyone it was too good to be true and went on as you always had, with a toothache and a squint. Your neighbors queued and returned beaming. By Christmas, you were queuing too.', 'I waited a while before using the new health service.', { happiness: -1, health: -1 }),
    },
  },

  {
    id: 'era.1946.parachute',
    emoji: '👗',
    title: 'The Wedding Dress',
    minAge: 17,
    maxAge: 38,
    once: true,
    weight: 24,
    when: (g) => rationed(g) && g.year <= 1950 && at(g, 'uk', 'dominion', 'europe') && !g.character.prison,
    setup: (g) => {
      const price = itemCost(g, 'wage', 80)
      return {
        text: `You are to be married soon, and the rationing of cloth and clothing coupons has not ended. A white wedding dress needs more coupons than a family can spare, and shop dresses cost a month’s wages (${money(price)}). A cousin still has parachute silk from the war. What will you do?`,
        choices: [ch('silk', 'Make the dress from parachute silk', '🪂'), ch('borrow', 'Borrow a dress from the neighborhood', '👰'), ch('black', `Buy one under the counter (${money(price)})`, '💰')],
        data: { price },
      }
    },
    resolve: {
      silk: (g, x) => say(g, x, 'Silk from the Sky', 'Your mother, your aunt and two neighbors cut, pinned and stitched for three weeks, with the sewing machine passed from house to house. The dress that emerged was the loveliest thing the street had seen in years. The bride was radiant and the whole community cried.', 'I was married in a dress made from parachute silk.', { happiness: 10, karma: 2, rel: 0, smarts: 1 }, 'good'),
      borrow: (g, x) => say(g, x, 'Third Time Lucky', 'The dress had been worn by three brides before you, taken in twice and let out once, and the hem was held up by a prayer. It was the happiest dress in the county.', 'I was married in a borrowed dress.', { happiness: 7, karma: 1 }, 'good'),
      black: (g, x) => {
        const caught = chance(g, 0.15)
        say(g, x, caught ? 'Found Out' : 'Under the Counter', caught ? 'The dress came wrapped in brown paper from a man in a back room. A neighbor noticed, a rumor spread and the inspector called round with a stern look. The fine was nearly the price of the dress again.' : 'The dress came wrapped in brown paper from a man in a back room. It fit surprisingly well, and nobody asked where it came from. You smiled very carefully in the photographs.', caught ? 'I was fined for a black-market wedding dress.' : 'I bought a black-market wedding dress.', { money: -x.n('price') * (caught ? 2 : 1), happiness: caught ? 2 : 8, karma: -4 }, caught ? 'bad' : 'neutral')
      },
    },
  },

  {
    id: 'era.1946.tupperware',
    emoji: '🥡',
    title: 'The Tupperware Party',
    minAge: 20,
    maxAge: 60,
    cooldown: 8,
    weight: 14,
    when: (g) => g.year >= 1951 && g.year <= 1972 && at(g, 'us', 'uk', 'dominion'),
    setup: () => ({
      text: 'A neighbor is hosting a party in the living room: coffee, little sandwiches and a demonstration of airtight plastic bowls that “burp.” The hostess earns a gift for every sale, and everyone is a little afraid of leaving empty-handed. What will you do?',
      choices: [ch('buy', 'Buy a set of bowls', '🥡'), ch('host', 'Offer to host a party of your own', '🏠'), ch('slip', 'Slip away after the sandwiches', '🥪')],
    }),
    resolve: {
      buy: (g, x) => say(g, x, 'Airtight', 'You bought a set of bowls and found yourself unaccountably pleased with them. The leftovers never went off, the sandwiches never went stale, and the lids lasted far longer than the friendship with the hostess.', 'I bought a set of Tupperware at a neighbor’s party.', { money: -itemCost(g, 'meal', 4), happiness: 3 }),
      host: (g, x) => {
        const good = chance(g, 0.6)
        say(g, x, good ? 'A Successful Evening' : 'Awkward Silence', good ? 'You baked, cleaned and set out your best chairs. Twelve women came, drank your coffee, ate your cake and bought forty pieces. The hostess gift was a handsome set of bowls of your own.' : 'You baked, cleaned and set out your best chairs. Four neighbors turned up, ate the cake and bought one bowl between them. The demonstration was a bit of a damp squib.', good ? 'I hosted a successful Tupperware party.' : 'My Tupperware party was a flop.', { money: good ? itemCost(g, 'meal', 6) : itemCost(g, 'meal', 1), happiness: good ? 5 : -2, smarts: good ? 1 : 0 }, good ? 'good' : 'neutral')
      },
      slip: (g, x) => say(g, x, 'Quick Exit', 'You ate three sandwiches and a slice of cake and excused yourself with a headache. The hostess’s eyebrows said she remembered. Your neighbors will keep every note of it.', 'I left a Tupperware party without buying anything.', { happiness: 1, karma: -2 }),
    },
  },

  {
    id: 'era.1946.suburb',
    emoji: '🏡',
    title: 'Keeping Up with the Neighbors',
    minAge: 24,
    maxAge: 60,
    cooldown: 6,
    weight: 14,
    when: (g) => g.year >= 1950 && g.year <= 1972 && at(g, 'us', 'dominion', 'uk') && g.character.residence.status === 'owned',
    setup: (g) => {
      const mower = itemCost(g, 'wage', 40)
      return {
        text: `Everyone on the street has the same house, the same lawn and, now, the same lawn mower. The man next door has bought the newest model with a motor, and the neighbors are clustered around it in the driveway like worshippers. Yours is a hand mower and a bad conscience. What will you do?`,
        choices: [ch('buy', `Buy the same model (${money(mower)})`, '🚜'), ch('barbecue', 'Host a barbecue to show off the garden', '🔥'), ch('own', 'Ignore them and keep what you have', '🌿')],
        data: { mower },
      }
    },
    resolve: {
      buy: (g, x) => say(g, x, 'Keeping Pace', 'The new mower purred. The lawn was cut in half the time and the neighbors nodded their approval. You felt a brief, shameful glow and then a bill.', 'I bought a power mower to keep up with the neighbors.', { money: -x.n('mower'), happiness: 3, karma: -1 }),
      barbecue: (g, x) => say(g, x, 'Smoke Signals', 'You lit the grill, invited the neighbors and burnt the first dozen sausages. By the second dozen you had become the most popular person on the street. The mower talk faded in the smoke.', 'I hosted a barbecue for the neighbors.', { money: -itemCost(g, 'meal', 6), happiness: 6, karma: 2 }, 'good'),
      own: (g, x) => say(g, x, 'Your Own Man', 'You told yourself that grass grows at its own speed regardless of horsepower. A few neighbors muttered. Your quiet back garden turned out to be the best in the street by August.', 'I ignored the neighbors’ lawn-mower race.', { happiness: 2, karma: 2, willpower: 1 }),
    },
  },

  {
    id: 'era.1946.supermarket',
    emoji: '🛒',
    title: 'The Supermarket Opens',
    minAge: 18,
    maxAge: 90,
    once: true,
    weight: 24,
    when: (g) => g.year >= 1948 && g.year <= 1966 && at(g, 'us', 'uk', 'dominion', 'europe'),
    setup: () => ({
      text: 'A huge new shop has opened at the edge of town: no counter, no clerk, just aisles of shelves, a wire basket on wheels and a row of cash registers. You help yourself to whatever you like, and carry it out in paper sacks. Your grocer on the corner has a long face. What will you do?',
      choices: [ch('shop', 'Do the weekly shop there', '🛒'), ch('loyal', 'Stay loyal to the corner grocer', '🏪'), ch('both', 'Split your shopping between the two', '⚖️')],
    }),
    resolve: {
      shop: (g, x) => say(g, x, 'Aisle After Aisle', 'You wheeled the basket up and down the aisles with the awe of a tourist and filled it with things you did not know you needed. The bill was lower than the grocer’s, and the choice was dizzying. You were home in half the time.', 'I did my weekly shop at the new supermarket.', { money: itemCost(g, 'meal', 2), happiness: 3, smarts: 0 }),
      loyal: (g, x) => say(g, x, 'Old Friends', 'You stayed with your grocer, who knew your name, your children’s names and exactly what you wanted. It cost a little more, and he threw in a bag of broken biscuits. His shop lasted a few years more than most.', 'I stayed loyal to my corner grocer.', { happiness: 2, karma: 3, money: -itemCost(g, 'meal', 1) }, 'good'),
      both: (g, x) => say(g, x, 'Best of Both', 'You bought your staples at the supermarket and your treats from the corner shop, and everybody was a little bit happy. It meant two trips, which was exactly the kind of inefficiency your grandmother approved of.', 'I split my shopping between the supermarket and the corner shop.', { happiness: 3, karma: 1 }),
    },
  },

  {
    id: 'era.1946.shelter',
    emoji: '☢️',
    title: 'The Fallout Shelter',
    minAge: 25,
    maxAge: 65,
    once: true,
    weight: 22,
    when: (g) => g.year >= 1955 && g.year <= 1964 && at(g, 'us', 'uk', 'dominion', 'europe') && g.character.residence.status !== 'homeless',
    setup: (g) => {
      const cost = itemCost(g, 'house', 0.025)
      return {
        text: `Magazines are full of advertisements for backyard fallout shelters, concrete bunkers stocked with tinned food and a hand-cranked radio. The news is grim and your neighbor is digging one. Everyone has an opinion and a pamphlet. A shelter would cost around ${money(cost)}. What will you do?`,
        choices: [ch('build', `Build a shelter (${money(cost)})`, '🧱'), ch('petition', 'Join the campaign for peace', '☮️'), ch('ignore', 'Do nothing and try not to think about it', '🙈')],
        data: { cost },
      }
    },
    resolve: {
      build: (g, x) => say(g, x, 'Below Ground', 'You dug, poured, stocked and sealed. The shelter smelled of damp concrete and sat unused for years, apart from jam storage. The children thought it was the best clubhouse in the neighborhood, and you slept a little more soundly knowing it was there.', 'I built a fallout shelter in the back yard.', { money: -x.n('cost'), happiness: 2, smarts: 1 }),
      petition: (g, x) => say(g, x, 'Marching for Peace', 'You gave out leaflets on the high street, signed petitions and walked with banners. Many people ignored you, some thanked you and one threw a tomato. You came home sunburnt and unrepentant.', 'I campaigned for peace during the Cold War.', { karma: 6, happiness: 3, notoriety: 1 }, 'good'),
      ignore: (g, x) => say(g, x, 'Head in the Sand', 'You turned off the radio, turned over the newspaper and decided that if the worst happened, there was nothing to be done. Your sleep was no worse for it, but your dreams were.', 'I tried not to think about the bomb.', { happiness: -2, karma: 0 }),
    },
  },

  {
    id: 'era.1946.strike',
    emoji: '🪧',
    title: 'The Picket Line',
    minAge: 18,
    maxAge: 62,
    cooldown: 8,
    weight: 22,
    when: (g) => g.year >= 1946 && g.year <= 1979 && at(g, 'us', 'uk', 'dominion', 'europe', 'latam', 'brazil', 'japan') && !!g.character.job && g.character.job.category === 'fulltime',
    setup: (g) => ({
      text: `The union has called a strike at ${g.character.job?.company ?? 'your workplace'} over pay and conditions. Banners are up, a brazier is lit at the gate and the shop steward is asking whether you’re in. Your family needs the wage, but your coworkers are watching to see which side you pick. What will you do?`,
      choices: [ch('picket', 'Join the picket line', '🪧'), ch('cross', 'Cross the line and work', '🚪'), ch('mediate', 'Try to bring both sides together', '🤝')],
    }),
    resolve: {
      picket: (g, x) => {
        const win = chance(g, 0.5)
        const job = g.character.job
        if (win && job) job.salary = Math.round(job.salary * 1.04)
        const lost = Math.round(((job?.salary ?? 0) / 52) * 3)
        say(g, x, win ? 'A Hard-Won Raise' : 'Back for Less', win ? 'You stood in the rain for three weeks with a flask and a sign. In the end the management gave way a little, and the pay went up. Your wages for those weeks were gone, but the raise would pay it back within a year.' : 'You stood in the rain for three weeks with a flask and a sign. In the end the strike fizzled and you went back to work on much the same terms, minus three weeks of wages and a good deal of goodwill.', win ? 'I joined a strike and we won a raise.' : 'I joined a strike that fizzled out.', { money: -lost, karma: 4, happiness: win ? 4 : -4, perf: win ? 2 : -2 }, win ? 'good' : 'bad')
      },
      cross: (g, x) => say(g, x, 'Crossing the Line', 'You walked through the gate under a hail of shouts and a single hurled apple. The wages kept coming and so did the silence in the canteen. Your coworkers did not forget it, even long after the strike was over.', 'I crossed the picket line during a strike.', { money: itemCost(g, 'wage', 40), karma: -7, perf: -4, happiness: -3 }, 'bad'),
      mediate: (g, x) => {
        const ok = chance(g, 0.35 + g.character.stats.smarts / 300)
        say(g, x, ok ? 'Peace at the Gate' : 'Stuck in the Middle', ok ? 'You spent four evenings carrying messages and cups of tea between the shop steward and the manager, and somewhere in the fifth a compromise appeared. Neither side was thrilled; both were relieved.' : 'You spent four evenings carrying messages and cups of tea between the shop steward and the manager. Neither side trusted you, and by the end both had a word to say about it.', ok ? 'I helped broker an end to a strike.' : 'I tried to mediate a strike and both sides distrusted me.', { karma: ok ? 5 : 1, smarts: 1, happiness: ok ? 4 : -3, perf: ok ? 3 : -2 }, ok ? 'good' : 'neutral')
      },
    },
  },

  {
    id: 'era.1946.protest',
    emoji: '✊',
    title: 'The March',
    minAge: 16,
    maxAge: 40,
    cooldown: 6,
    weight: 18,
    when: (g) => g.year >= 1964 && g.year <= 1972 && at(g, 'us', 'uk', 'dominion', 'europe', 'japan', 'latam', 'brazil') && !g.character.prison,
    setup: () => ({
      text: 'Posters on every wall announce a march this weekend against the war and for change at home. Your friends are going. Your parents, who read the same newspaper but draw different conclusions, are not pleased. The police will be watching. What will you do?',
      choices: [ch('march', 'March with the crowd', '✊'), ch('sign', 'Sign the petition but stay home', '✍️'), ch('out', 'Stay out of politics', '🛋️')],
    }),
    resolve: {
      march: (g, x) => {
        const p = aParent(g)
        const arrested = chance(g, 0.07)
        say(g, x, arrested ? 'Taken In' : 'Shoulder to Shoulder', arrested ? 'You walked for miles with ten thousand others, singing and chanting, until a scuffle at the end of the route. You were one of a handful pulled into a van and held overnight. Your parents collected you in the morning, silent.' : 'You walked for miles with ten thousand others, singing, chanting and sharing sandwiches with strangers. You felt, for the first time, part of something larger than yourself. Your feet hurt for days.', arrested ? 'I was arrested at a protest march.' : 'I marched with thousands in a protest.', { happiness: arrested ? -5 : 6, karma: 4, notoriety: arrested ? 2 : 1, rels: p ? [{ p, d: arrested ? -5 : -2 }] : [], ...(arrested ? { arrest: { crime: 'Disorderly conduct', severity: 1 } } : {}) }, arrested ? 'bad' : 'good')
      },
      sign: (g, x) => say(g, x, 'A Signature', 'You signed your name at the bottom of a long list and passed the clipboard on. It was a small act and a safe one, and you were glad you’d done it.', 'I signed a petition at the time of the great protests.', { karma: 3, happiness: 1 }),
      out: (g, x) => {
        const p = aParent(g)
        say(g, x, 'Staying Out', 'You told your friends that you had a family dinner to attend, which you did. You read about the march in the evening paper, and you were no wiser about whether you had done the right thing.', 'I stayed out of the protests.', { happiness: -1, karma: -1, rels: p ? [{ p, d: 2 }] : [] })
      },
    },
  },

  {
    id: 'era.1946.pill',
    emoji: '💊',
    title: 'A Visit to the Doctor',
    minAge: 20,
    maxAge: 44,
    once: true,
    weight: 22,
    when: (g) => {
      const from = PILL_FROM[g.character.countryId]
      return from !== undefined && g.year >= from && g.year <= 1979 && g.character.gender === 'female' && !g.character.prison
    },
    setup: () => ({
      text: 'A new pill that prevents pregnancy has been in the newspapers for months, in whispers at the hairdresser’s and in sermons from the pulpit. Some doctors prescribe it freely, some only to married women, some not at all. It could change your plans, for better or worse. What will you do?',
      choices: [ch('doctor', 'Ask your doctor about it', '🩺'), ch('partner', 'Talk it over with a partner first', '💬'), ch('pass', 'Leave it alone', '🙏')],
    }),
    resolve: {
      doctor: (g, x) => {
        const yes = chance(g, g.year >= 1968 ? 0.8 : 0.6)
        if (yes) g.flags['era.pill'] = true
        say(g, x, yes ? 'A Prescription' : 'Not Prescribed', yes ? 'The doctor looked over his glasses, asked a few questions and wrote a prescription. It felt oddly like being handed a key to a door you had not known was there. You plan a little differently from now on.' : 'The doctor looked over his glasses, shook his head and said such things were “not for a girl like you.” You left with a leaflet and a flush in your cheeks. You may try another doctor.', yes ? 'I got a prescription for the new pill.' : 'My doctor refused to prescribe the pill.', { happiness: yes ? 4 : -2, karma: 0 }, yes ? 'good' : 'neutral')
      },
      partner: (g, x) => say(g, x, 'A Long Talk', 'You and your partner talked until the small hours, about families, money, hopes and fears. You did not settle everything, but you understood each other better than before.', 'I talked family planning over with my partner.', { happiness: 3, smarts: 1, karma: 1 }, 'good'),
      pass: (g, x) => say(g, x, 'Staying Out of It', 'You put the matter aside. Your faith, your family or simply your own mind came down on one side, and you stayed on it. The world changed around you, with or without your say-so.', 'I decided not to use the new pill.', { happiness: 0, karma: 1 }),
    },
  },

  {
    id: 'era.1946.gasLine',
    emoji: '⛽',
    title: 'The Gas Line',
    minAge: 18,
    maxAge: 80,
    cooldown: 4,
    weight: 40,
    when: (g) => (g.year === 1974 || g.year === 1979) && at(g, 'us', 'dominion', 'uk', 'europe', 'japan') && g.character.licenses.includes('driver') && !g.character.prison,
    setup: () => ({
      text: 'Fuel is short, and the line at the station stretches a mile around the block. Hand-lettered signs say SOLD OUT. Cars are allowed to fill up only on certain days, depending on the last digit of their number plate. You need your car for work. What will you do?',
      choices: [ch('queue', 'Queue for hours', '🚗'), ch('pool', 'Carpool or bike for a while', '🚲'), ch('stash', 'Buy a can from a friend who has a stash', '🛢️')],
    }),
    resolve: {
      queue: (g, x) => say(g, x, 'Idling', 'You sat in the line for three hours with the engine off, rolling forward a car-length at a time, reading a paperback. By the time you reached the pump you had formed an opinion on every driver in front of you. The tank filled, and you felt like a winner.', 'I waited hours in the gas line.', { money: -itemCost(g, 'gas', 12), happiness: -3 }),
      pool: (g, x) => say(g, x, 'Pedal Power', 'You swapped the car for a bicycle and a shared lift to work. You arrived windblown and a bit sweaty, but your legs got stronger and you made two friends in the carpool.', 'I carpooled and cycled during the fuel shortage.', { health: 2, athleticism: 2, happiness: 1, karma: 2 }, 'good'),
      stash: (g, x) => {
        const bad = chance(g, 0.2)
        say(g, x, bad ? 'Watered Down' : 'A Friend in Need', bad ? 'Your friend’s “stash” turned out to be mostly something else, and the car coughed and wheezed all the way to the garage. The mechanic had a lot to say, and bill to match.' : 'Your friend dragged a can out of the garage and poured it in with a funnel and a wink. You promised not to tell. It was the best fuel you ever bought.', bad ? 'I bought bad fuel from a friend during the shortage.' : 'A friend with a stash of fuel helped me out.', { money: bad ? -itemCost(g, 'gas', 30) : -itemCost(g, 'gas', 12), karma: -2, happiness: bad ? -4 : 3 }, bad ? 'bad' : 'neutral')
      },
    },
  },

  {
    id: 'era.1946.cb',
    emoji: '📡',
    title: 'Breaker One-Nine',
    minAge: 18,
    maxAge: 60,
    once: true,
    weight: 18,
    when: (g) => g.year >= 1974 && g.year <= 1979 && at(g, 'us', 'dominion', 'uk') && techOdds(g, 'radio') >= 0.5,
    setup: () => ({
      text: 'Everyone is buying a citizens’ band radio, and the highways are alive with truckers, travelers and teenagers talking in code. A friend has fitted one in your car and wants to pick a “handle,” a nickname to go by on the air. What will you do?',
      choices: [ch('handle', 'Pick a handle and join the chatter', '📡'), ch('listen', 'Just listen to the traffic reports', '👂'), ch('skip', 'Think it’s a silly fad', '🙄')],
    }),
    resolve: {
      handle: (g, x) => say(g, x, 'Good Buddy', 'You picked a handle, cleared your throat and said hello. A voice came back from a truck two miles away, then another. Within an hour you knew the speed traps, the best diner for forty miles and a few jokes you couldn’t repeat at home.', 'I joined the CB radio craze and picked a handle.', { happiness: 5, smarts: 1 }, 'good'),
      listen: (g, x) => say(g, x, 'Eavesdropping', 'You listened to the truckers swapping news of speed traps and bad diners, and took a different road when they warned of a jam. It saved you an hour, and you felt like a spy.', 'I listened to the CB radio traffic reports.', { happiness: 2, smarts: 1 }),
      skip: (g, x) => say(g, x, 'Not for Me', 'You rolled your eyes at the fad, and when it faded a few years later you felt vindicated, though somewhat lonely at the diner.', 'I skipped the CB radio craze.', { happiness: 0 }),
    },
  },

  {
    id: 'era.1946.scooter',
    emoji: '🛵',
    title: 'A Scooter',
    minAge: 16,
    maxAge: 45,
    once: true,
    weight: 18,
    when: (g) => g.year >= 1948 && g.year <= 1975 && at(g, 'uk', 'europe', 'india', 'japan', 'latam', 'brazil', 'indonesia', 'seasia', 'mena'),
    setup: (g) => {
      const cost = itemCost(g, 'car', 0.22)
      const adult = g.character.age >= 18
      const choices = [ch('bike', 'Keep using a bicycle', '🚲'), ch('borrow', 'Borrow a friend’s scooter', '🤝')]
      if (adult && g.character.money >= cost) choices.unshift(ch('buy', `Buy a scooter (${money(cost)})`, '🛵'))
      return { text: 'The streets are suddenly buzzing with scooters: a Vespa or a Lambretta is the thing every young person wants, cheaper than a car and more fun than a bus. Your friends are riding to work and to the dance on them. What will you do?', choices, data: { cost } }
    },
    resolve: {
      buy: (g, x) => {
        const crash = chance(g, 0.08)
        say(g, x, crash ? 'A Spill' : 'Freedom on Two Wheels', crash ? 'You bought a scooter and rode it home with a wide grin. Three days later you took a corner too fast and spent a fortnight limping and picking gravel from your elbow. It was worth it, you insisted.' : 'You bought a scooter and rode it home with a wide grin. The wind in your hair, the buzz of the engine and the freedom of the road made every commute a holiday.', crash ? 'I crashed my new scooter.' : 'I bought a scooter and loved it.', { money: -x.n('cost'), happiness: crash ? 1 : 8, health: crash ? -4 : 0, athleticism: 0 }, crash ? 'bad' : 'good')
      },
      borrow: (g, x) => say(g, x, 'Pillion Passenger', 'You rode on the back of a friend’s scooter to the dance, clinging on and shouting over the engine. It was thrilling, terrifying and the best way to arrive.', 'I rode pillion on a friend’s scooter.', { happiness: 4 }),
      bike: (g, x) => say(g, x, 'Pedal Power', 'You stuck with the bicycle and your legs grew strong. The scooters buzzed past, and you arrived at the same place in nearly the same time, with a better complexion.', 'I stuck with my bicycle while everyone bought scooters.', { health: 2, athleticism: 2, happiness: 0 }),
    },
  },

  {
    id: 'era.1946.disco',
    emoji: '🪩',
    title: 'Saturday Night Fever',
    minAge: 16,
    maxAge: 40,
    cooldown: 4,
    weight: 22,
    when: (g) => g.year >= 1976 && g.year <= 1979 && at(g, 'us', 'uk', 'dominion', 'europe', 'latam', 'brazil', 'japan') && !g.character.prison,
    setup: () => ({
      text: 'The new disco on the high street has a mirror ball, a lit-up dance floor and a dance contest tonight, with a trophy and a bottle of something fizzy for the winners. Your flares are pressed and your hair is as high as it will go. What will you do?',
      choices: [ch('contest', 'Enter the dance contest', '🏆'), ch('floor', 'Dance for fun and ignore the contest', '🕺'), ch('bar', 'Watch from the bar', '🥤')],
    }),
    resolve: {
      contest: (g, x) => {
        const score = g.character.hidden.athleticism / 100 + g.character.stats.looks / 200 + g.character.stats.happiness / 300
        const win = chance(g, Math.min(0.55, 0.08 + score * 0.3))
        say(g, x, win ? 'First Prize' : 'Also Danced', win ? 'You pointed to the ceiling, you spun on one heel and you hit every beat. The judges, who were the DJ and a bored bouncer, gave you the trophy. You walked home at dawn with it in your arms.' : 'You pointed to the ceiling, you spun on one heel and you landed in a heap. The crowd loved it. The judges did not. You went home with a bruised pride and a glowing evening.', win ? 'I won a disco dance contest.' : 'I lost a disco dance contest in glorious style.', { happiness: win ? 9 : 2, looks: win ? 1 : 0, fame: win ? 1 : 0, athleticism: 1 }, win ? 'good' : 'neutral')
      },
      floor: (g, x) => say(g, x, 'On the Floor', 'You danced for four hours under the mirror ball in a crowd of strangers who became friends by the third song. You went home with a ringing in your ears, a blister on each heel and a heart full of rhythm.', 'I danced all night at the disco.', { happiness: 6, health: 1, athleticism: 1 }, 'good'),
      bar: (g, x) => say(g, x, 'Wallflower', 'You watched from the bar with a soft drink and a good view, and by the end of the night you had memorized the steps. Next time, you promised yourself.', 'I watched the disco from the bar.', { happiness: 1, smarts: 1 }),
    },
  },

  {
    id: 'era.1946.shoppingCenter',
    emoji: '🛍️',
    title: 'The New Shopping Center',
    minAge: 14,
    maxAge: 70,
    once: true,
    weight: 18,
    when: (g) => g.year >= 1962 && g.year <= 1979 && at(g, 'us', 'dominion', 'uk', 'europe', 'japan', 'latam', 'brazil'),
    setup: () => ({
      text: 'A vast new shopping center has opened on the edge of town: forty shops under one roof, a car park the size of a farm, escalators, a fountain and air conditioning. The old high street is quiet today, and everyone you know is wandering the new corridors. What will you do?',
      choices: [ch('browse', 'Spend the afternoon browsing', '🛍️'), ch('hang', 'Hang out with friends by the fountain', '⛲'), ch('main', 'Stay loyal to the old high street', '🏪')],
    }),
    resolve: {
      browse: (g, x) => say(g, x, 'Window Shopping', 'You walked from one end to the other and back again, trying on hats, smelling candles and looking at a thousand things you didn’t need. You spent more than you meant to, which is what the corridors were designed for.', 'I spent an afternoon at the new shopping center.', { money: -itemCost(g, 'meal', 3), happiness: 4 }),
      hang: (g, x) => say(g, x, 'The Fountain', 'You and your friends sat on the edge of the fountain for hours, throwing coins and comparing hair. Nobody bought anything. It was the greatest invention for teenagers since the telephone.', 'I hung out with friends at the new shopping center.', { happiness: 5, karma: 0 }, 'good'),
      main: (g, x) => say(g, x, 'Old Habits', 'You stayed with the old shops and the old shopkeepers. They remembered your name and your size. The high street held on for a few more years, with you among its last loyal customers.', 'I stayed loyal to the old high street.', { happiness: 2, karma: 2 }),
    },
  },
])
