// Scene variants, part one (R3-Q12, E.T6): the 30 most frequent events of the probe in test/fixtures/event-top60.json, from
// adult.powerOutage down to sos.car. Part two is variants-data-b.ts; how a scene is used is in variants.ts.
//
// What a scene must do: open the same decision the original opens, so the unchanged choices still answer it; say the facts
// (amount, name, the thing found) that the outcome texts repeat, which `facts` lists as tokens; end on the original's closing
// question; stay at or under 140 characters (docs/VOICE.md); and carry an era gate wherever the words or the choices need one.
// Two raw scenes may hold the same text under different gates: that is how a gate says "or".

export interface EventScenes {
  /** Scene templates; see variants.ts for the tokens. A scene may start with an era gate ("@internet "). */
  scenes: readonly string[]
  /** Tokens every scene of this event must state (data keys, or the person and title tokens). */
  facts?: readonly string[]
  /** The data key behind {amt} (default "amt"). */
  amt?: string
}

export const VARIANTS_A: Readonly<Record<string, EventScenes>> = {
  'adult.powerOutage': {
    scenes: [
      `Lightning hit a substation and the whole city went dark. The power company says two days. What will you do?`,
      `The grid failed at dusk. The streetlights are out and the fridge is already warming. What will you do?`,
      `A heat wave overloaded the grid, and the lights went out across town. There's no word on when they'll return. What will you do?`,
    ],
  },
  'friend.newFriend': {
    facts: ['first', 'last'],
    scenes: [
      `{first} {last} keeps turning up wherever you go, and now wants to be friends. What will you do?`,
      `You've chatted a few times with {first} {last}. Today {first} asked if you'd like to hang out. What will you do?`,
      `{first} {last} walked over and said you seem like someone worth knowing. They'd like to be friends. What will you do?`,
    ],
  },
  'adult.foundWallet': {
    facts: ['amt', 'first', 'last'],
    amt: 'cash',
    scenes: [
      `A wallet sits on the sidewalk with {amt} in cash inside. The ID says {first} {last}. What will you do?`,
      `You nearly step on a wallet. It holds {amt} in cash and an ID for {first} {last}. What will you do?`,
      `Someone dropped a wallet at your feet. There's {amt} in it, and it belongs to {first} {last}. What will you do?`,
    ],
  },
  'adult.lostCash': {
    facts: ['amt'],
    scenes: [
      `A {amt} bill blows along the sidewalk, and a stranger nearby has spotted it too. What will you do?`,
      `You see a {amt} bill on the ground. Another passerby is already eyeing it. What will you do?`,
      `The wind lifts a {amt} bill past your shoes. A stranger across the street starts to run. What will you do?`,
    ],
  },
  'adult.witnessCrime': {
    facts: ['who', 'act'],
    scenes: [
      `Downtown, you see {who} {act}. The street is almost empty. What will you do?`,
      `You turn a corner and catch {who} {act}. No one else has seen it yet. What will you do?`,
      `From across the street you watch {who} {act}. Your heart is pounding. What will you do?`,
    ],
  },
  'adult.aliens': {
    scenes: [
      `A stranger grabs your sleeve and asks, wild-eyed, if we're alone in the universe. What will you say?`,
      `While you wait for your ride, a man in a rumpled coat asks if there's life on other planets. What will you say?`,
      `Someone with a notebook full of star charts asks what you think is out there. What will you say?`,
    ],
  },
  'adult.godQuestion': {
    scenes: [
      `A stranger outside the park gate stops you and asks loudly whether you believe in God. What will you say?`,
      `On the park path, a woman with a pamphlet asks if you trust in a higher power. A few people turn to listen. What will you say?`,
      `Someone on a park bench calls you over and asks, very loudly, if you have faith. What will you say?`,
    ],
  },
  'adult.emailScam': {
    scenes: [
      `@internet An email from a "prince" offers you 20% of a fortune. He only needs your bank details first. What will you do?`,
      `@internet A stranger's email says a dead millionaire left you a fortune. All they need is your account number. What will you do?`,
      `@!internet A letter from a "nobleman" jailed abroad offers you a share of his fortune. First you'd bribe his guards. What will you do?`,
      `@!internet Foreign stamps on an envelope. Inside, a rich prisoner promises to split his fortune if you pay his guards. What will you do?`,
    ],
  },
  'adult.fluSeason': {
    scenes: [
      `Flu is going around your street, and you've heard three coughs since breakfast. Free shots are on offer nearby. What will you do?`,
      `A neighbor is in bed with the flu, and a notice offers free flu shots down the road. What will you do?`,
      `It's flu season, and a nurse at the counter is giving out free shots. The line is short. What will you do?`,
    ],
  },
  'adult.badMeal': {
    scenes: [
      `The shrimp arrives warm and a little gray. One bite tastes like pond water. What will you do?`,
      `Halfway through dinner, the shrimp starts to taste wrong. The waiter has just left. What will you do?`,
      `The shrimp smells off before you even lift the fork. The rest of the table is eating happily. What will you do?`,
    ],
  },
  'adult.homeless': {
    scenes: [
      `Outside the grocery store, a homeless man holds out a paper cup and asks if you can spare some change. What will you do?`,
      `A homeless man by the bus stop asks if you can spare a little money. What will you do?`,
      `A homeless man at the corner says he's hungry and asks for help with a meal. What will you do?`,
    ],
  },
  'adult.lostDog': {
    facts: ['name'],
    scenes: [
      `A friendly lost dog trots up to you. Its collar reads "{name}" and the tag has the owner's details. What will you do?`,
      `You find a muddy dog by the road. The tag says "{name}" and shows who owns it. What will you do?`,
      `A lost dog follows you for a block. "{name}," says its collar. The tag tells you where to take it. What will you do?`,
    ],
  },
  'adult.strangerInsult': {
    facts: ['who', 'insult'],
    scenes: [
      `On the street, {who} bumps into you, then calls you {insult}. People nearby are watching. What will you do?`,
      `Without warning, {who} calls you {insult} to your face. What will you do?`,
      `You hold a door for {who}, who thanks you by calling you {insult}. What will you do?`,
    ],
  },
  'adult.charity': {
    facts: ['cause'],
    scenes: [
      `A volunteer on the corner is collecting money for the {cause} and holds out a collection box. What will you do?`,
      `Someone in a bright vest stops you to ask for a donation to the {cause}. What will you do?`,
      `A volunteer with a clipboard heads straight for you. They're raising money for the {cause}. What will you do?`,
    ],
  },
  'adult.phoneScam': {
    facts: ['amt'],
    scenes: [
      `A caller says they're from the tax office and you owe {amt}. Pay now, or you'll be arrested. What will you do?`,
      `The phone rings. A stern voice says you owe {amt} in back taxes and the police are on the way. What will you do?`,
      `A recorded voice claims to be the tax agency. It says you owe {amt} and have one hour to pay. What will you do?`,
    ],
  },
  'adult.scratchTicket': {
    facts: ['amt'],
    amt: 'price',
    scenes: [
      `The clerk at the corner shop swears today is your lucky day and pushes scratch-off tickets at {amt} each. What will you do?`,
      `Scratch-off tickets sit by the register at {amt} each. The clerk says the last winner came in yesterday. What will you do?`,
      `The clerk slides a strip of scratch-off tickets across the counter at {amt} each. Today is supposedly your day. What will you do?`,
    ],
  },
  'family.parentHealth': {
    facts: ['p', 'what'],
    scenes: [
      `Your {rel}, {p}, is in the hospital after {what}. The doctors say {he}'s stable for now. What will you do?`,
      `Word comes that your {rel}, {p}, was admitted after {what}. {He} is stable but weak. What will you do?`,
      `Your {rel} {p} was taken to the hospital after {what}. {He}'s stable, but the family wants you there. What will you do?`,
    ],
  },
  'family.siblingWedding': {
    facts: ['p'],
    scenes: [
      `Your {rel} {p} is getting married and hands you the job of toasting the couple. What will you do?`,
      `At the rehearsal dinner, {p} asks you to give the toast at the wedding. {He}'s counting on you. What will you do?`,
      `{p} is marrying on Saturday and wants you to speak at the reception. The guest list is huge. What will you do?`,
    ],
  },
  'adult.reunion': {
    scenes: [
      `An invitation arrives for your old class reunion. Most of your classmates are going. What will you do?`,
      `Your old school is holding a reunion, and a former rival is on the guest list. What will you do?`,
      `The reunion is on Saturday. Someone from your old class keeps asking if you'll come. What will you do?`,
    ],
  },
  'adult.streetPerformer': {
    facts: ['inst'],
    scenes: [
      `A street performer steps into your path and offers to play you a song on {inst}. What will you do?`,
      `A busker spots you and starts a song on {inst}, eyes locked on you. What will you do?`,
      `A street performer stops mid-act to ask if you'd like a song on {inst}. A few people are watching. What will you do?`,
    ],
  },
  'adult.timeshare': {
    scenes: [
      `The free breakfast came with a four-hour timeshare pitch. The salesperson keeps blocking the exit. What will you do?`,
      `The free breakfast was a timeshare pitch. The contract is on the table and the pen is in your hand. What will you do?`,
      `Hour three of the free breakfast, and the salesperson is still talking about a week in the sun. What will you do?`,
    ],
  },
  'adult.strandedDriver': {
    facts: ['first'],
    scenes: [
      `{first} is stranded on the roadside with a flat tire and no spare, waving at passing cars. What will you do?`,
      `You pass a stalled car with a flat tire. Its driver, {first}, has no spare. No one has stopped. What will you do?`,
      `A driver named {first} kneels by a flat tire at the roadside. There's no spare in the car. What will you do?`,
    ],
  },
  'family.borrowMoney': {
    facts: ['p', 'amt', 'why'],
    scenes: [
      `Your {rel}, {p}, wants to borrow {amt} to {why}. {He} promises to pay you back. What will you do?`,
      `{p} comes to you with a favor. {He} needs {amt} to {why}, and you're the first person {he} asked. What will you do?`,
      `Your {rel} {p} needs {amt} to {why} and says you're the only one who can help. What will you do?`,
    ],
  },
  'adult.fraudAlert': {
    facts: ['amt', 'what'],
    scenes: [
      `Your bank is on the line about a {amt} charge for {what}. They want to know if it's yours. What will you do?`,
      `Your card statement lists {amt} for {what}. The bank has frozen the card until you confirm. What will you do?`,
      `The bank blocked your card over a {amt} charge for {what}. What will you do?`,
    ],
  },
  'adult.juryDuty': {
    facts: ['days'],
    scenes: [
      `A court summons arrives in the mail. The trial could run {days} days. What will you do?`,
      `The court wants you for a trial that's expected to last {days} days. The summons has a deadline. What will you do?`,
      `A letter from the court says you're needed for {days} days of trial. What will you do?`,
    ],
  },
  'teen.viralVideo': {
    facts: ['what'],
    scenes: [
      `@videoSharing A clip of you {what} is all over the internet, and the view count climbs by the minute. What will you do?`,
      `@videoSharing Someone filmed you {what} and put it up for the world to see. Strangers keep sharing it. What will you do?`,
      `@!videoSharing,1989,tv A neighbor's tape of you {what} aired on a TV blooper show last night. Half the town watched. What will you do?`,
      `@!videoSharing,1989,tv People keep mentioning the clip of you {what} on TV. The show has aired it twice. What will you do?`,
      `@!videoSharing,-1989 The local paper ran a photo of you {what}. It was on every doorstep this morning. What will you do?`,
      `@!videoSharing,-1989 A photographer caught you {what}, and the town paper printed it. People are pointing. What will you do?`,
      `@!videoSharing,!tv The local paper ran a photo of you {what}. It was on every doorstep this morning. What will you do?`,
      `@!videoSharing,!tv A photographer caught you {what}, and the town paper printed it. People are pointing. What will you do?`,
    ],
  },
  'elder.earlyBird': {
    scenes: [
      `The early bird special at the diner is half price, but your soup is only lukewarm. The rolls are free. What will you do?`,
      `You made the diner by 4:00 for the early bird special. The soup is tepid and the rolls sit right there. What will you do?`,
      `The early bird soup at your window table was hot an hour ago. Now it's cold. What will you do?`,
    ],
  },
  'elder.healthScare': {
    facts: ['symptom'],
    scenes: [
      `You wake up with {symptom}. An hour later it still hasn't eased. What will you do?`,
      `Halfway through breakfast, you notice {symptom}. You sit down, but it doesn't pass. What will you do?`,
      `By afternoon you can't ignore {symptom} any longer. What will you do?`,
    ],
  },
  'elder.oldFlame': {
    facts: ['first', 'last'],
    scenes: [
      `@socialMedia {first} {last}, your crush from school, found you online. The message says "Do you remember me?" What will you do?`,
      `@socialMedia A friend request from {first} {last}, your old school crush, comes with a note that says "Do you remember me?" What will you do?`,
      `@!socialMedia A letter in unfamiliar handwriting comes from {first} {last}, your old school crush. It asks "Do you remember me?" What will you do?`,
      `@!socialMedia {first} {last}, your crush from school, has written to you after all these years, asking "Do you remember me?" What will you do?`,
    ],
  },
  'sos.car': {
    scenes: [
      `A car has hit a wall and a man is stuck behind the wheel. Fuel is pouring onto the road. What will you do?`,
      `You hear the crash, then see a man trapped in a smoking car. It's leaking fuel. What will you do?`,
      `A man is pinned in a wrecked car and fuel is dripping onto the hot engine. What will you do?`,
    ],
  },
}
