// Scene variants, part two (R3-Q12, E.T6): the other 30 events of the probe in test/fixtures/event-top60.json, from
// baby.vaccination down to sos.cpr. The rules for a scene are at the top of variants-data-a.ts.
import type { EventScenes } from './variants-data-a'

export const VARIANTS_B: Readonly<Record<string, EventScenes>> = {
  'baby.vaccination': {
    scenes: [
      `At the doctor's office, a nurse comes at you with a needle. You're held tight. How will you behave?`,
      `The waiting room is full of crying babies, and your turn for the needle is next. How will you behave?`,
      `The nurse rolls up your sleeve and wipes your arm with something cold. How will you behave?`,
    ],
  },
  'friend.advice': {
    facts: ['p'],
    scenes: [
      `Your friend {p} is stuck on a decision and asks what you'd do in {his} place. What will you do?`,
      `{p} sits down next to you and says {he} needs advice. It sounds serious. What will you do?`,
      `Over coffee, your friend {p} asks what you think of a plan that's been keeping {him} up at night. What will you do?`,
    ],
  },
  'friend.late': {
    facts: ['p'],
    scenes: [
      `Your friend {p} is 40 minutes late to dinner again. The waiter keeps asking if you're ready to order. What will you do?`,
      `{p} said seven o'clock. It's now twenty to eight, and the table is still set for two. What will you do?`,
      `You've been at the restaurant for 40 minutes and {p} still hasn't shown. {He}'s always late. What will you do?`,
    ],
  },
  'sos.disaster': {
    facts: ['kind'],
    scenes: [
      `The {kind} has reached your neighborhood. Windows are rattling and neighbors are shouting. What will you do?`,
      `Word spreads fast that the {kind} is here. You have minutes to decide. What will you do?`,
      `It's the {kind} you were warned about, and it has arrived. Your street is emptying. What will you do?`,
    ],
  },
  'toddler.bigFlex': {
    scenes: [
      `It's time to show the grown-ups what you can do. You only have room to master one skill. Which will you choose?`,
      `The grown-ups keep asking what you're good at. You can perfect one skill for now. Which will you choose?`,
      `You want to impress the people around you, and there's time to master just one skill. Which will you choose?`,
    ],
  },
  'elder.memoir': {
    scenes: [
      `Someone at the library says your stories belong in a book. Do you want to write your memoir?`,
      `People keep asking you to put your life on paper. Do you want to write your memoir?`,
      `A neighbor gives you a blank notebook and says it's time to tell your story. Do you want to write your memoir?`,
    ],
  },
  'elder.pickleball': {
    facts: ['title'],
    scenes: [
      `The community center is starting a {title|lc} group. The regulars take it seriously. Will you join?`,
      `A flyer at the library says the local {title|lc} crowd is recruiting. Word is they play to win. Will you join?`,
      `Your neighbor swears by {title|lc} and wants you at Thursday's session. The rivalry is real. Will you join?`,
    ],
  },
  'era.1900.marketDay': {
    scenes: [
      `It's market day. Baskets and chickens crowd the square, and every price is open to argument. What will you do?`,
      `The weekly market fills the square with stalls and shouting. Your family could sell something, or you could buy. What will you do?`,
      `The whole village has walked in to the market with goods to trade and gossip to share. What will you do?`,
    ],
  },
  'era.1900.pictureHall': {
    facts: ['amt'],
    amt: 'fee',
    scenes: [
      `The picture hall is showing the film the whole town is talking about. Cheap seats are {amt}. What will you do?`,
      `Tonight's picture at the hall is a romance with songs. The cheap seats cost {amt}. What will you do?`,
      `A queue is forming outside the picture hall. Cheap seats are {amt}, and friends are saving you a place. What will you do?`,
    ],
  },
  'sos.fire': {
    scenes: [
      `Smoke is pouring from your neighbor's house, and someone is screaming inside. What will you do?`,
      `Flames fill your neighbor's windows and you can hear a scream from upstairs. What will you do?`,
      `Your neighbor's roof is burning and someone inside is calling for help. What will you do?`,
    ],
  },
  'sos.tree': {
    scenes: [
      `A small child is clinging to the top of a tree, and the branch under them has started to crack. What will you do?`,
      `You hear a child crying and look up. They're stuck high in a tree, on a branch that's splitting. What will you do?`,
      `High above the path, a child is stuck in a tree. The branch groans with every move. What will you do?`,
    ],
  },
  'teen.wrongText': {
    facts: ['first'],
    scenes: [
      `@texting You meant to text your best friend that {first} is cute. You sent it to {first}. Three dots appear. What will you do?`,
      `@texting Your message about {first} was meant for your best friend. It went to {first}, who's typing a reply. What will you do?`,
      `@!texting You passed your best friend a note about {first}. It went down the wrong row, and {first} is unfolding it. What will you do?`,
      `@!texting Your note saying {first} is cute reached {first}'s desk instead. {first} is reading it now. What will you do?`,
    ],
  },
  'adult.midlife': {
    scenes: [
      `You passed forty a while ago, and the mirror has started to agree. Something has to change. How will you handle this?`,
      `A birthday card says "over the hill," and for once it stings. How will you handle this?`,
      `Your old classmates are buying sports cars and booking solo trips. You feel the clock. How will you handle this?`,
    ],
  },
  'baby.cheekSqueezer': {
    facts: ['word'],
    scenes: [
      `At the park, a lady with huge hair is chatting with your {word}. She squeezes your cheek and reaches for you. How will you react?`,
      `A loud lady in perfume leans over and pinches your cheek. Your {word} keeps talking. How will you react?`,
      `Your {word} stops to chat at the park. A colorful woman grabs your cheek and tries to lift you. How will you react?`,
    ],
  },
  'elder.hearing': {
    scenes: [
      `You answer a question at dinner with total confidence, and the table goes quiet. Your hearing may be going. What will you do?`,
      `A neighbor says good morning, and you reply with something about the weather. Your hearing may be going. What will you do?`,
      `You've asked three people to repeat themselves today, and the day is half over. What will you do?`,
    ],
  },
  'era.2000s.allNighter': {
    scenes: [
      `It's past midnight and your team is begging for one more match. Your alarm is five hours away. What will you do?`,
      `You're on a winning streak online, and the team wants one more match. The clock says 1 a.m. What will you do?`,
      `Three wins in a row, and it's well past midnight. The team says just one more game. What will you do?`,
    ],
  },
  'kid.siblingSpat': {
    facts: ['p', 'topic'],
    scenes: [
      `You and your {rel} {p} are in a loud fight about {topic}. Neither of you will give in. What will you do?`,
      `{p} says you're wrong about {topic}, and you say {he}'s wrong. The voices are rising. What will you do?`,
      `The argument with your {rel} {p} over {topic} is about to turn physical. What will you do?`,
    ],
  },
  'kid.strayAnimal': {
    facts: ['species'],
    scenes: [
      `A scruffy stray {species|lc} has trailed you home and now sits on the step, staring up at you. What will you do?`,
      `There's a thin, muddy {species|lc} on your doorstep. It followed you for six blocks. What will you do?`,
      `A stray {species|lc} curled up by your door and won't leave. It looks hungry. What will you do?`,
    ],
  },
  'school.classClown': {
    scenes: [
      `The teacher asks a question, and the perfect joke lands in your head. Then the teacher says your name. What will you do?`,
      `You've got a joke ready for the next question. The teacher looks around the room and picks you. What will you do?`,
      `Mid-lesson, a hilarious answer comes to you. The teacher turns and calls on you. What will you do?`,
    ],
  },
  'adult.gameShow': {
    scenes: [
      `@tv You've been picked from the audience to be a contestant on a TV game show. The host is waving you up. What will you do?`,
      `@tv A TV game show wants you on stage as a contestant. The cameras are already on you. What will you do?`,
      `@!tv A radio quiz show host picks you out of the studio audience to compete. What will you do?`,
      `@!tv You're pulled from the studio audience to play on a live radio quiz. The microphone is waiting. What will you do?`,
    ],
  },
  'adult.inheritance': {
    facts: ['first', 'amt'],
    scenes: [
      `A lawyer writes that a distant relative named {first} has died and left you {amt}. You never met. What will you do?`,
      `A lawyer asks you to come in. {first}, a relative you never met, has left you {amt} in a will. What will you do?`,
      `A letter from a law office says {first}, a distant relative, named you in the will for {amt}. What will you do?`,
    ],
  },
  'elder.bingo': {
    facts: ['amt'],
    amt: 'pot',
    scenes: [
      `Bingo night is down to the last card. The pot is {amt} and you need one number. What will you do?`,
      `The caller is on the final numbers and you're one short of a {amt} pot. What will you do?`,
      `You're a single number from winning {amt} at bingo. The hall is silent as the next ball rolls. What will you do?`,
    ],
  },
  'family.siblingJealous': {
    facts: ['p'],
    scenes: [
      `Your {rel}, {p}, made another dig about your success at the family dinner. It isn't the first. What will you do?`,
      `{p} can't hide {his} resentment of your success anymore, and brings it up at every family gathering. What will you do?`,
      `At the last gathering, your {rel} {p} muttered something sharp about your success. People heard it. What will you do?`,
    ],
  },
  'friend.flatTire': {
    facts: ['p'],
    scenes: [
      `Your friend {p} calls at 2 AM from the roadside. There's a flat tire and no one else to ask. What will you do?`,
      `At 2 AM, {p} is stuck on the highway with a flat and needs you. The phone keeps ringing. What will you do?`,
      `{p} has a flat tire in the dark and wants your help. It's 2 AM and you were asleep. What will you do?`,
    ],
  },
  'friend.moving': {
    facts: ['p'],
    scenes: [
      `{p} is moving on Saturday and needs hands. There's a piano and four flights of stairs. What will you do?`,
      `Your friend {p} wants help moving into {his} new place. The couch is huge and the elevator is broken. What will you do?`,
      `{p} just got the keys and asked you to help carry boxes. The piano is on the fourth floor. What will you do?`,
    ],
  },
  'kid.grossDinner': {
    facts: ['name'],
    scenes: [
      `At {name}'s house, dinner arrives in a bowl that's gray and still steaming. It smells strange. What will you do?`,
      `{name}'s parents put a plate in front of you. You can't tell what it is. What will you do?`,
      `You're a guest at {name}'s table, and dinner looks like nothing you've seen. The family is watching you. What will you do?`,
    ],
  },
  'kid.roadTrip': {
    facts: ['city', 'trip'],
    scenes: [
      `Your parents are planning a {trip} to {city} to see relatives. It's a long way. How will you behave?`,
      `The family is heading to {city} on a {trip} to visit relatives. You'll have to sit still for hours. How will you behave?`,
      `Your parents announce a {trip} to see the relatives in {city}. Your friends are staying home. How will you behave?`,
    ],
  },
  'kid.snowDay': {
    scenes: [
      `Your parents say school is closed today. The whole day is yours. How will you spend it?`,
      `A notice on the school gate says it's closed today, and your friends are already outside. How will you spend the day?`,
      `The doors are locked and the yard is empty. There's no school today. How will you spend it?`,
    ],
  },
  'school.sneeze': {
    scenes: [
      `Mid-presentation, you sneeze into your hand and there's nothing in your pocket. The class is watching. What will you do?`,
      `You're presenting with your group when a sneeze catches you. Your hand takes the hit. What will you do?`,
      `Your slide just came up when you sneezed into your palm. Your groupmates are staring at it. What will you do?`,
    ],
  },
  'sos.cpr': {
    scenes: [
      `An elderly woman drops to the floor in the grocery aisle. She isn't breathing. What will you do?`,
      `An elderly woman collapses near the checkout and lies still. You can't see her breathing. What will you do?`,
      `You hear a thud in the grocery store and find an elderly woman on the floor, not breathing. What will you do?`,
    ],
  },
}
