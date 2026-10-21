// Licenses: driver's license (country driving age), boating license, pilot license (after 40
// hours of flight school) and firearm license (background check). Each test is a short quiz
// played through popups; get every question right to pass.
import { count, hasLicense, log, notice, remember, scriptChoice } from '../core'
import { masterFirstTime } from '../mastery'
import { chance, pick, randInt, shuffle, uid } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import { hasMainCharacter } from '../talents'
import type { Asset, GameState, Json, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../types'
import { brokeNotice, countryOf, flagNumber, gate, localPrice, money, payingParents, result } from './common'
import { localTerm } from '../data/locales'
import { anachronistic } from '../events/era'

function uc(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

interface Question {
  q: string
  a: string
  wrong: [string, string]
  emoji?: string
  /** First year the question makes sense (transponders arrived in the sixties). */
  since?: number
}

const ROAD_SIGNS: Question[] = [
  { emoji: '\u{1F6D1}', q: 'What does a red octagon sign mean?', a: 'Stop', wrong: ['Yield', 'Slow down'] },
  { emoji: '\u{1F53B}', q: 'What does an upside-down red-and-white triangle sign mean?', a: 'Yield', wrong: ['Stop', 'Do not enter'] },
  { emoji: '⛔', q: 'What does a red circle with a white horizontal bar mean?', a: 'Do not enter', wrong: ['No parking', 'Speed bump ahead'] },
  { emoji: '\u{1F6B8}', q: 'What does a yellow pentagon showing two walking children mean?', a: 'School zone', wrong: ['Playground for sale', 'Pedestrian bridge'] },
  { emoji: '\u{1F98C}', q: 'What does a yellow diamond with a leaping deer mean?', a: 'Deer crossing', wrong: ['Petting zoo ahead', 'Hunting season'] },
  { emoji: '\u{1F522}', q: 'What does a white sign reading "SPEED LIMIT 55" mean?', a: 'The maximum speed is 55', wrong: ['The minimum speed is 55', 'You must drive exactly 55'] },
  { emoji: '\u{1F6E4}\u{FE0F}', q: 'What does a round yellow sign with an X and "RR" mean?', a: 'Railroad crossing ahead', wrong: ['Road repair', 'Rest area'] },
  { emoji: '\u{1F6A7}', q: 'What does an orange diamond with a worker holding a shovel mean?', a: 'Road work ahead', wrong: ['Community garden', 'Buried treasure'] },
  { emoji: '\u{1F504}', q: 'What does a circle with a red slash over a U-shaped arrow mean?', a: 'No U-turns', wrong: ['U-turns only', 'Roundabout ahead'] },
  { emoji: '〰\u{FE0F}', q: 'What does a yellow diamond with a squiggly arrow mean?', a: 'Winding road ahead', wrong: ['Slippery when wet', 'Snake crossing'] },
  { emoji: '\u{1F697}', q: 'What does a yellow diamond showing a car with wavy skid marks mean?', a: 'Slippery when wet', wrong: ['Drifting allowed', 'Car wash ahead'] },
  { emoji: '\u{1F3E5}', q: 'What does a blue square sign with a white "H" mean?', a: 'Hospital', wrong: ['Hotel', 'Helipad'] },
  { emoji: '\u{1F6B3}', q: 'What does a bicycle inside a red circle with a slash mean?', a: 'No bicycles', wrong: ['Bike lane', 'Bike rental'] },
  { emoji: '\u{1F6B7}', q: 'What does a pedestrian inside a red circle with a slash mean?', a: 'No pedestrians', wrong: ['Pedestrian crossing', 'Sidewalk ends'] },
  { emoji: '\u{1F6A6}', q: 'What does a flashing yellow traffic light mean?', a: 'Proceed with caution', wrong: ['Speed up before it turns red', 'Stop and wait'] },
  { emoji: '\u{1F6A5}', q: 'What does a flashing red traffic light mean?', a: 'Treat it like a stop sign', wrong: ['Proceed with caution', "It's broken, ignore it"] },
  { emoji: '↕\u{FE0F}', q: 'What does a yellow diamond with two arrows pointing in opposite directions mean?', a: 'Two-way traffic', wrong: ['One way', 'Lane ends'] },
  { emoji: '⤴\u{FE0F}', q: 'What does a yellow diamond with a lane joining from the side mean?', a: 'Merging traffic', wrong: ['Exit only', 'Lane closed'] },
  { emoji: '\u{1F503}', q: 'What does a round sign with three arrows chasing each other mean?', a: 'Roundabout ahead', wrong: ['Recycling center', 'U-turn permitted'] },
  { emoji: '\u{1F3D5}\u{FE0F}', q: 'What does a brown sign with a tent on it mean?', a: 'Campground', wrong: ['Circus', 'Tent sale'] },
  { emoji: '\u{1F17F}\u{FE0F}', q: 'What does a red circle with a slash over a "P" mean?', a: 'No parking', wrong: ['Parking only', 'Police station'] },
]

const ROAD_RULES: Question[] = [
  { emoji: '\u{1F68C}', q: 'A school bus ahead stops and extends its red STOP arm. You should:', a: 'Stop and wait until the arm is pulled back', wrong: ['Pass it carefully on the left', 'Honk so the kids hurry up'] },
  { emoji: '\u{1F691}', q: 'An ambulance with flashing lights and a siren comes up behind you. You should:', a: 'Pull over to the side and stop', wrong: ['Speed up to stay ahead of it', 'Stop dead in your lane'] },
  { emoji: '\u{1F6A6}', q: 'Two cars arrive at a four-way stop at the same time. Who goes first?', a: 'The car on the right', wrong: ['The bigger car', 'Whoever honks first'] },
  { emoji: '\u{1F7E8}', q: 'When may you pass on a solid yellow line on your side of the road?', a: 'Never', wrong: ["When nobody's coming", "When you're running late"] },
  { emoji: '❄\u{FE0F}', q: 'Your car starts to skid on ice. You should:', a: 'Ease off the gas and steer where you want to go', wrong: ['Slam on the brakes', 'Close your eyes and pray'] },
  { emoji: '\u{1F6E3}\u{FE0F}', q: "You're merging onto a highway. You should:", a: 'Match the speed of traffic and merge into a gap', wrong: ['Stop at the end of the ramp', 'Merge at 20 mph'] },
  { emoji: '\u{1F526}', q: 'When must your headlights be on?', a: 'From sunset to sunrise and in poor visibility', wrong: ['Only in tunnels', 'Only when it rains'] },
  { emoji: '\u{1F6B6}', q: 'A pedestrian is in the crosswalk ahead of you. You should:', a: 'Stop and let them cross', wrong: ['Honk to hurry them along', 'Drive around them'] },
  { emoji: '↔\u{FE0F}', q: 'Before changing lanes you should:', a: 'Signal, check your mirrors and your blind spot', wrong: ['Just go for it', 'Honk twice'] },
  { emoji: '\u{1F634}', q: "You're getting sleepy while driving. You should:", a: 'Pull over somewhere safe and rest', wrong: ['Blast music and open the windows', 'Drive faster to get home sooner'] },
  { emoji: '\u{1F4F1}', q: 'Texting while driving is:', a: 'Dangerous and illegal in most places', wrong: ["Fine at red lights", "Fine if you're good at it"] },
  { emoji: '\u{1F37A}', q: 'Is it okay to drive after a few drinks if you feel fine?', a: 'No, call a cab or a friend instead', wrong: ["Yes, if you drive slowly", 'Yes, if the roads are empty'] },
]

const BOATING: Question[] = [
  { emoji: '\u{1F534}', q: 'Returning to harbor from open water, a red buoy should be on which side of your boat?', a: 'The right ("red, right, returning")', wrong: ['The left', "It doesn't matter"] },
  { emoji: '\u{1F4EF}', q: 'Five or more short blasts of a boat horn mean:', a: "Danger, or I don't understand your intentions", wrong: ['There is a party on board', 'Follow me'] },
  { emoji: '\u{1F6A4}', q: 'Two powerboats approach each other head-on. Each should:', a: 'Turn to the right (starboard)', wrong: ['Turn to the left', 'Speed up and hope'] },
  { emoji: '\u{1F9BA}', q: 'What must be on board for every person?', a: 'A properly fitting life jacket', wrong: ['A snorkel', 'A fishing rod'] },
  { emoji: '⚓', q: 'Which side of a boat is "port"?', a: 'The left side when facing forward', wrong: ['The right side', 'The back'] },
  { emoji: '\u{1F6E5}\u{FE0F}', q: 'Another boat is overtaking yours. Who must keep clear?', a: 'The boat that is overtaking', wrong: ['You', 'Whichever boat is bigger'] },
  { emoji: '\u{1F30A}', q: 'Someone falls overboard. What should you do first?', a: 'Throw them something that floats and keep them in sight', wrong: ['Dive in immediately', 'Keep going and circle back later'] },
]

const AVIATION: Question[] = [
  { emoji: '\u{1F7E2}', q: 'In flight, a steady green light from the control tower means:', a: 'Cleared to land', wrong: ['Go around', 'Return to the gate'] },
  { emoji: '\u{1F534}', q: 'In flight, a flashing red light from the tower means:', a: 'Airport unsafe, do not land', wrong: ['Cleared to land', 'Land immediately'] },
  { emoji: '\u{1F6D1}', q: 'In flight, a steady red light from the tower means:', a: 'Give way to other aircraft and keep circling', wrong: ['Cleared to land', 'Leave the area permanently'] },
  { emoji: '⚪', q: 'On the ground, a flashing white light from the tower means:', a: 'Return to your starting point on the airport', wrong: ['Cleared for takeoff', 'Shut down your engine'] },
  { emoji: '\u{1F6A8}', q: 'Alternating red and green lights from the tower mean:', a: 'Exercise extreme caution', wrong: ['Happy holidays', 'Cleared to taxi'] },
  { emoji: '\u{1F4DF}', q: 'Setting your transponder to 7700 tells air traffic control:', a: 'You have an emergency', wrong: ['You are bored', 'You need fuel prices'], since: 1965 },
  { emoji: '\u{1F4CB}', q: 'Before every flight you must:', a: 'Complete the preflight checklist', wrong: ['Take a cockpit selfie', "Skip it if you're running late"], since: 2012 },
  { emoji: '\u{1F4CB}', q: 'Before every flight you must:', a: 'Complete the preflight checklist', wrong: ['Polish your goggles', "Skip it if you're running late"] },
  { emoji: '\u{1F4CF}', q: 'Which instrument shows your altitude?', a: 'The altimeter', wrong: ['The tachometer', 'The compass'] },
]

const FIREARMS: Question[] = [
  { emoji: '\u{1F52B}', q: 'You should always treat a firearm as if it is:', a: 'Loaded', wrong: ['A toy', 'Unloaded'] },
  { emoji: '☝\u{FE0F}', q: 'Where should your finger be until you are ready to shoot?', a: 'Outside the trigger guard', wrong: ['On the trigger', 'Anywhere comfortable'] },
  { emoji: '\u{1F3AF}', q: 'Before firing, you must be sure of:', a: 'Your target and what is beyond it', wrong: ['Your outfit', 'Nothing in particular'] },
  { emoji: '\u{1F512}', q: 'How should firearms be stored at home?', a: 'Unloaded and locked up, away from children', wrong: ['Under your pillow', 'Loaded on the kitchen counter'] },
]

type LicenseKind = 'driver' | 'boating' | 'pilot' | 'firearm'

/** Signs and rules that only exist on American roads (yellow diamonds, school bus arms, 55 mph...). */
const US_ROADS = /yellow diamond|yellow pentagon|orange diamond|SPEED LIMIT 55|"RR"|school bus|solid yellow|four-way stop|20 mph/

const INTL_SIGNS: Question[] = [
  { emoji: '\u{26A0}\u{FE0F}', q: 'What does a red-bordered triangle with an exclamation mark mean?', a: 'Other danger ahead', wrong: ['Road ends', 'Free parking'] },
  { emoji: '\u{1F6B8}', q: 'What does a red-bordered triangle showing two children mean?', a: 'Children crossing or a school nearby', wrong: ['Playground for sale', 'Family parking'] },
  { emoji: '\u{1F98C}', q: 'What does a red-bordered triangle with a leaping deer mean?', a: 'Wild animals may cross', wrong: ['Petting zoo ahead', 'Hunting season'] },
  { emoji: '\u{1F522}', q: 'What does a round sign with a red border and the number 50 mean?', a: 'The speed limit is 50 km/h', wrong: ['The minimum speed is 50 km/h', 'Route 50'] },
  { emoji: '\u{1F682}', q: 'What does a red-bordered triangle showing a steam train mean?', a: 'Railway crossing without barriers', wrong: ['Train museum', 'Steam bath ahead'] },
  { emoji: '\u{1F6A7}', q: 'What does a red-bordered triangle with a person digging mean?', a: 'Road works ahead', wrong: ['Community garden', 'Buried treasure'] },
]

const INTL_RULES: Question[] = [
  { emoji: '\u{2B1C}', q: 'When may you cross a solid white line in the middle of the road?', a: 'Never', wrong: ["When nobody's coming", "When you're running late"] },
  { emoji: '\u{1F6E3}\u{FE0F}', q: "You're merging onto a motorway. You should:", a: 'Match the speed of traffic and merge into a gap', wrong: ['Stop at the end of the slip road', 'Merge at 30 km/h'] },
]

const BANKS_LOCAL: Record<'us' | 'intl', Question[][]> = {
  us: [ROAD_SIGNS, ROAD_RULES],
  intl: [[...ROAD_SIGNS.filter((x) => !US_ROADS.test(x.q)), ...INTL_SIGNS], [...ROAD_RULES.filter((x) => !US_ROADS.test(x.q)), ...INTL_RULES]],
}

/** Does a question fit this year (no texting-while-driving questions in 1950)? */
function questionFits(g: GameState, q: Question): boolean {
  if (q.since !== undefined && g.year < q.since) return false
  return !anachronistic(g, [q.q, q.a, ...q.wrong].join(' \n '))
}

/** The question banks for a test where the player lives (American road signs only in the US). */
function banksFor(g: GameState, kind: LicenseKind): Question[][] {
  const banks = kind !== 'driver' ? BANKS[kind] : BANKS_LOCAL[g.character.countryId === 'us' ? 'us' : 'intl']
  return banks.map((bank) => {
    const fits = bank.filter((q) => questionFits(g, q))
    return fits.length ? fits : bank
  })
}


const BANKS: Record<LicenseKind, Question[][]> = {
  driver: [ROAD_SIGNS, ROAD_RULES],
  boating: [BOATING, BOATING],
  pilot: [AVIATION, AVIATION],
  firearm: [FIREARMS],
}

const NAMES: Record<LicenseKind, string> = {
  driver: "driver's license",
  boating: 'boating license',
  pilot: "pilot's license",
  firearm: 'firearm license',
}

const TITLES: Record<LicenseKind, string> = {
  driver: 'Driving Test',
  boating: 'Boating Test',
  pilot: "Pilot's Test",
  firearm: 'Firearm Safety Test',
}

const ATTEMPTS_PER_YEAR = 2

function attemptsLeft(g: GameState, kind: LicenseKind): number {
  return Math.max(0, ATTEMPTS_PER_YEAR - (g.yearActions[`act.license.${kind}`] ?? 0))
}

function pickQuestions(g: GameState, kind: LicenseKind): number[] {
  const banks = banksFor(g, kind)
  const picked: number[] = []
  banks.forEach((bank, i) => {
    let idx = randInt(g, 0, bank.length - 1)
    // Don't ask the same question twice from the same bank.
    if (i > 0 && banks[i - 1] === bank && idx === picked[i - 1]) idx = (idx + 1) % bank.length
    picked.push(idx)
  })
  return picked
}

function ask(g: GameState, kind: LicenseKind, qs: number[], step: number): void {
  const bank = banksFor(g, kind)[step]
  const q = bank[qs[step]]
  const options = shuffle(g, [q.a, ...q.wrong])
  const correct = options.indexOf(q.a)
  scriptChoice(
    g,
    ANSWER,
    `${TITLES[kind]} · Question ${step + 1} of ${qs.length}`,
    `${q.emoji ? `${q.emoji}\n\n` : ''}${q.q}`,
    options.map((o, i) => ({ id: String(i), label: o })),
    { emoji: kind === 'driver' ? '\u{1F697}' : kind === 'boating' ? '\u{1F6A4}' : kind === 'pilot' ? '✈\u{FE0F}' : '\u{1F3AF}', data: { kind, qs, step, correct } },
  )
}

const ANSWER = defineScript('act.license.answer', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const kind = (['driver', 'boating', 'pilot', 'firearm'] as LicenseKind[]).find((k) => k === d.kind) ?? 'driver'
  const qs = Array.isArray(d.qs) ? d.qs.filter((x): x is number => typeof x === 'number') : []
  const step = typeof d.step === 'number' ? d.step : 0
  const correct = typeof d.correct === 'number' ? d.correct : -1
  if (choice !== String(correct)) {
    failTest(g, kind)
    return
  }
  if (step + 1 < qs.length && step + 1 < banksFor(g, kind).length) {
    ask(g, kind, qs, step + 1)
    return
  }
  passTest(g, kind)
})

const FAIL_LINES: Record<LicenseKind, string[]> = {
  driver: [
    'You failed your driving test. The examiner wrote something on the clipboard and sighed loudly.',
    'You failed! The examiner said, "See you next time," in the tone of someone who hopes not to.',
    "You failed your driving test. On the bright side, nobody got hurt. This time.",
  ],
  boating: ['You failed your boating test. The examiner suggested you stick to rubber ducks.', 'You failed. You may want to learn which side is port before your next attempt.'],
  pilot: ["You failed your pilot's test. The examiner looked visibly relieved to be back on the ground.", "You failed your pilot's test. The examiner was last seen kissing the tarmac."],
  firearm: ['You failed the firearm safety test. The instructor quietly moved further away from you.'],
}

function failTest(g: GameState, kind: LicenseKind): void {
  log(g, `I failed my ${kind === 'driver' ? 'driving' : kind === 'firearm' ? 'firearm safety' : kind === 'pilot' ? "pilot's" : 'boating'} test.`, 'bad')
  const left = attemptsLeft(g, kind)
  result(g, 'Failed', `${pick(g, FAIL_LINES[kind])}${left > 0 ? `\n\nYou can try again ${left === 1 ? 'one more time' : `${left} more times`} this year.` : '\n\nYou can retake it next year.'}`, '❌', 'bad')
}

function passTest(g: GameState, kind: LicenseKind): void {
  const c = g.character
  if (!c.licenses.includes(kind)) c.licenses.push(kind)
  count(g, 'licenses')
  remember(g, `Got a ${NAMES[kind]}.`)
  log(g, `I got my ${NAMES[kind]}!`, 'good')
  const passLines: Record<LicenseKind, string> = {
    driver: pickSite(g, ['You passed your driving test! The open road is yours.', `You passed! The examiner even cracked a smile. Your license photo from ${localTerm(g, 'licenseOffice')}, however, is a crime.`], 0x86fa54f5),
    boating: 'You passed your boating test! You are now legally allowed to captain a boat. Ahoy!',
    pilot: "You passed your pilot's test! You are now a licensed pilot. The sky is no longer the limit.",
    firearm: 'You passed the safety test and your background check came back clean. Your firearm license arrived in the mail.',
  }
  result(g, 'Passed!', passLines[kind], '\u{1FAAA}', 'good')
  if (kind === 'driver' && c.age < 18) maybeGiftCar(g)
}

const GIFT_CARS = ['Used Sedan', 'Used Hatchback', 'Used Compact Car', 'Used Pickup Truck', 'Used Minivan']

function maybeGiftCar(g: GameState): void {
  const parent = payingParents(g).filter((p) => p.money >= 25_000 && p.relationship >= 40).sort((a, b) => b.money - a.money)[0]
  if (!parent || !chance(g, 0.35)) return
  const name = pick(g, GIFT_CARS)
  const value = localPrice(g, randInt(g, 4_000, 11_000))
  parent.money = Math.max(0, parent.money - value)
  const asset: Asset = {
    id: uid(g, 'a'),
    kind: 'car',
    name,
    emoji: name.includes('Truck') ? '\u{1F6FB}' : name.includes('Minivan') ? '\u{1F690}' : '\u{1F697}',
    purchasePrice: value,
    value,
    condition: randInt(g, 55, 85),
    purchasedAge: g.character.age,
    upkeep: localPrice(g, 900),
    details: { make: 'Used', model: name.replace('Used ', ''), year: g.year - randInt(g, 4, 12), gift: true, giftFrom: parent.firstName },
  }
  g.assets.push(asset)
  const word = parent.gender === 'male' ? 'dad' : 'mom'
  log(g, `My ${word} bought me a car for getting my license!`, 'good')
  notice(g, 'Surprise!', `To celebrate your new license, your ${word} bought you a ${name.toLowerCase()}! It smells a little like old fries, but it's yours.`, { emoji: '\u{1F381}', tone: 'good' })
}

// ---------------------------------------------------------------------------
// Taking a test

function startTest(g: GameState, kind: LicenseKind, fee: number): void {
  if (hasLicense(g, kind)) {
    result(g, 'Already Licensed', `You already have a ${NAMES[kind]}.`, '\u{1FAAA}')
    return
  }
  if (attemptsLeft(g, kind) <= 0) {
    result(g, 'Come Back Later', kind === 'driver'
      ? `${uc(localTerm(g, 'licenseOffice'))} won't let you take the test again until next year.`
      : `You've used up your test attempts for this year. Try again next year.`, '\u{1F4C5}')
    return
  }
  if (fee > 0 && g.character.money < fee) {
    brokeNotice(g, fee, `the ${NAMES[kind]} test`)
    return
  }
  g.character.money -= fee
  g.yearActions[`act.license.${kind}`] = (g.yearActions[`act.license.${kind}`] ?? 0) + 1
  count(g, `${kind}Tests`)
  // Main Character Syndrome: the first time at the wheel (or the helm, or the yoke) is already mastery,
  // so the test is aced. The age, the fee, the flight hours and the attempts still apply.
  if (hasMainCharacter(g)) {
    masterFirstTime(g, `drive.${kind}`, 'driving', kind === 'driver' ? 'driving test' : kind === 'boating' ? 'boating test' : kind === 'pilot' ? "pilot's test" : 'firearm safety test')
    passTest(g, kind)
    return
  }
  ask(g, kind, pickQuestions(g, kind), 0)
}

// Driver's license -----------------------------------------------------------

export function drivingAge(g: GameState): number {
  const a = countryOf(g).drivingAge
  return typeof a === 'number' && a > 0 ? a : 16
}

export function driverBlock(g: GameState): string | null {
  const age = drivingAge(g)
  return gate(g, { minAge: age, minAgeText: `You must be at least ${age} to take the driving test in ${countryOf(g).name}.` })
}

export const driverTestAction: MenuAction = {
  type: 'action',
  id: 'license.driver',
  label: "Driver's License",
  emoji: '\u{1F697}',
  subtitle: (g) => (hasLicense(g, 'driver') ? 'Licensed ✔' : `Take the driving test · ${attemptsLeft(g, 'driver')} attempts left this year`),
  disabledReason: (g) => driverBlock(g) ?? (hasLicense(g, 'driver') ? 'You already have a driver’s license.' : null),
  run: (g) => startTest(g, 'driver', 0),
}

// Boating license ------------------------------------------------------------

const boatingFee = (g: GameState) => localPrice(g, 50)

export const boatingTestAction: MenuAction = {
  type: 'action',
  id: 'license.boating',
  label: 'Boating License',
  emoji: '\u{1F6A4}',
  subtitle: (g) => (hasLicense(g, 'boating') ? 'Licensed ✔' : `Take the boating test · ${money(boatingFee(g))}`),
  disabledReason: (g) => gate(g, { minAge: 18 }) ?? (hasLicense(g, 'boating') ? 'You already have a boating license.' : null),
  run: (g) => startTest(g, 'boating', boatingFee(g)),
}

// Pilot license --------------------------------------------------------------

const FLIGHT_HOURS = 'license.flightHours'
const REQUIRED_HOURS = 40
const pilotFee = (g: GameState) => localPrice(g, 300)

const PACKAGES = [
  { hours: 10, usd: 3000 },
  { hours: 20, usd: 5600 },
  { hours: 40, usd: 10500 },
]

function flightLesson(g: GameState, hours: number, usd: number): void {
  const c = g.character
  const used = g.yearActions['act.flightHours'] ?? 0
  if (used + hours > 60) {
    result(g, 'Grounded', "Your instructor won't log more than 60 flight hours with you in one year. You need some sleep.", '\u{1F634}')
    return
  }
  const cost = localPrice(g, usd)
  if (c.money < cost) {
    brokeNotice(g, cost, `${hours} hours of flight school`)
    return
  }
  c.money -= cost
  g.yearActions['act.flightHours'] = used + hours
  const total = flagNumber(g, FLIGHT_HOURS) + hours
  g.flags[FLIGHT_HOURS] = total
  count(g, 'flightSchool')
  if (hasMainCharacter(g)) masterFirstTime(g, 'drive.pilot', 'driving', 'flight lesson')
  log(g, `I logged ${hours} hours at flight school.`, 'good')
  const line = pickLine(g, [
    'You practiced takeoffs and landings until you could do them in your sleep. Please do not do them in your sleep.',
    'Your instructor only grabbed the controls from you twice. Progress!',
    'You flew over the city at sunset and nearly forgot you were being graded.',
    'You practiced stalls and recoveries. Your stomach is still somewhere over the airport.',
  ])
  result(g, 'Flight School', `${line}\n\nFlight hours logged: ${total}${total >= REQUIRED_HOURS ? ". You're ready to take your pilot's test!" : ` of ${REQUIRED_HOURS}`}`, '\u{1F6E9}\u{FE0F}', 'good')
}

export const pilotMenu: MenuGroup = {
  type: 'menu',
  id: 'license.pilot',
  label: "Pilot's License",
  emoji: '✈\u{FE0F}',
  subtitle: (g) => (hasLicense(g, 'pilot') ? 'Licensed ✔' : `Flight hours: ${flagNumber(g, FLIGHT_HOURS)} of ${REQUIRED_HOURS}`),
  // Pilot licensing began after the First World War.
  visible: (g) => g.year >= 1920 || hasLicense(g, 'pilot'),
  disabledReason: (g) => gate(g, { minAge: 18 }),
  header: (g) =>
    hasLicense(g, 'pilot')
      ? "You're a licensed pilot."
      : `You need at least ${REQUIRED_HOURS} hours of flight school before you can take the pilot's test. You have ${flagNumber(g, FLIGHT_HOURS)}.`,
  children: (g): MenuNode[] => {
    if (hasLicense(g, 'pilot')) {
      const info: MenuInfo = { type: 'info', id: 'license.pilot.done', text: 'You already have your pilot’s license. Go buy a plane!', emoji: '✈\u{FE0F}' }
      return [info]
    }
    const nodes: MenuNode[] = [{ type: 'heading', id: 'license.pilot.school', label: 'Flight School' }]
    for (const p of PACKAGES) {
      nodes.push({
        type: 'action',
        id: `license.pilot.hours.${p.hours}`,
        label: `${p.hours} Flight Hours`,
        emoji: '\u{1F6E9}\u{FE0F}',
        subtitle: (s) => money(localPrice(s, p.usd)),
        run: (d) => flightLesson(d, p.hours, p.usd),
      })
    }
    nodes.push({ type: 'heading', id: 'license.pilot.exam', label: 'Exam' })
    nodes.push({
      type: 'action',
      id: 'license.pilot.test',
      label: "Take the Pilot's Test",
      emoji: '\u{1F4DD}',
      subtitle: (s) => `${money(pilotFee(s))} · ${attemptsLeft(s, 'pilot')} attempts left this year`,
      disabledReason: (s) =>
        flagNumber(s, FLIGHT_HOURS) < REQUIRED_HOURS ? `You need ${REQUIRED_HOURS - flagNumber(s, FLIGHT_HOURS)} more flight hours first.` : s.character.stats.health < 25 ? 'You would never pass the medical exam in your current health.' : null,
      run: (d) => startTest(d, 'pilot', pilotFee(d)),
    })
    return nodes
  },
}

// Firearm license ------------------------------------------------------------

const STRICT = ['gb', 'jp', 'cn', 'kr', 'sg', 'au']
const firearmFee = (g: GameState) => localPrice(g, 100)

function firearmAge(g: GameState): number {
  return g.character.countryId === 'us' ? 21 : 18
}

function applyFirearm(g: GameState): void {
  const c = g.character
  if (hasLicense(g, 'firearm')) {
    result(g, 'Already Licensed', 'You already have a firearm license.', '\u{1FAAA}')
    return
  }
  if (attemptsLeft(g, 'firearm') <= 0) {
    result(g, 'Come Back Later', 'You have to wait until next year to apply again.', '\u{1F4C5}')
    return
  }
  const fee = firearmFee(g)
  if (c.money < fee) {
    brokeNotice(g, fee, 'a firearm license application')
    return
  }
  const convicted = c.criminalRecord.some((r) => r.convicted)
  const mental = c.conditions.some((x) => x.kind === 'mental' && x.diagnosed)
  const country = countryOf(g)
  let denial: string | null = null
  if (convicted) denial = 'Your background check revealed a criminal conviction.'
  else if (c.wantedLevel > 0) denial = 'Your background check revealed an outstanding warrant. Awkward.'
  else if (mental) denial = 'Your background check flagged your mental health history.'
  else if (STRICT.includes(country.id) && !chance(g, 0.15)) denial = `Civilian firearm licenses are extremely restricted in ${country.name}. Your application was rejected.`
  if (denial) {
    c.money -= fee
    g.yearActions['act.license.firearm'] = ATTEMPTS_PER_YEAR
    log(g, 'My firearm license application was denied.', 'bad')
    result(g, 'Application Denied', `${denial}

The ${money(fee)} application fee is non-refundable.`, '\u{1F6AB}', 'bad')
    return
  }
  startTest(g, 'firearm', fee)
}

export const firearmAction: MenuAction = {
  type: 'action',
  id: 'license.firearm',
  label: 'Firearm License',
  emoji: '\u{1F3AF}',
  subtitle: (g) => (hasLicense(g, 'firearm') ? 'Licensed ✔' : `Background check and safety test · ${money(firearmFee(g))}`),
  disabledReason: (g) => {
    const age = firearmAge(g)
    return gate(g, { minAge: age, minAgeText: `You must be at least ${age} to apply for a firearm license.` }) ?? (hasLicense(g, 'firearm') ? 'You already have a firearm license.' : null)
  },
  run: applyFirearm,
}

// ---------------------------------------------------------------------------

export const licensesMenu: MenuGroup = {
  type: 'menu',
  id: 'licenses',
  label: 'Licenses',
  emoji: '\u{1FAAA}',
  subtitle: 'Manage your licenses',
  disabledReason: (g) => gate(g, { minAge: Math.min(drivingAge(g), 16) }),
  header: (g) => {
    const held = g.character.licenses
    return held.length ? `Licenses held: ${held.map((l) => (l === 'driver' ? "Driver's" : l.charAt(0).toUpperCase() + l.slice(1))).join(', ')}` : "You don't have any licenses yet."
  },
  children: (g): MenuNode[] => [driverTestAction, boatingTestAction, pilotMenu, firearmAction].filter((n) => !n.visible || n.visible(g)),
}
