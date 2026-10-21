// R1-T5: the shared table behind the never-route policy (src/game/notice-policy.ts). Each row is a notice and what
// neverRoute must say about it: the reason it has to stay a popup, or null when a minor notice like it may wait in
// the inbox. test/notice-policy.test.ts walks it; R1-T6 (the store) and R1-T10 (the acceptance sweep) import it so the
// three agree on one list. A row's `block` follows the order the policy uses: support, tone, health, legal, money.
import type { RouteBlock } from '../src/game/notice-policy'
import type { NoticeModal, Tone } from '../src/game/types'

export type NeverRouteRow = {
  name: string
  title: string
  text: string
  tone?: Tone
  support?: boolean
  /** What neverRoute must return for this notice; null means a minor one like it routes to the inbox. */
  block: RouteBlock | null
}

export const NEVER_ROUTE_TABLE: readonly NeverRouteRow[] = [
  // Support and tone come first.
  { name: 'bad tone', title: 'Burglary victim', text: 'Someone took your bike from the porch.', tone: 'bad', block: 'tone' },
  { name: 'support line', title: 'You talked to someone', text: 'You talked to someone you trust. It helped a little.', support: true, block: 'support' },
  { name: 'support beats tone', title: 'A rough night', text: 'You called a friend and it helped.', tone: 'bad', support: true, block: 'support' },
  { name: 'tone beats health', title: 'Bad news', text: 'The hospital called.', tone: 'bad', block: 'tone' },
  // Health.
  { name: 'sick', title: 'Sick day', text: 'You stayed home today.', block: 'health' },
  { name: 'hospital', title: 'Visiting hours', text: 'A friend is at the hospital.', block: 'health' },
  { name: 'doctor', title: 'Checkup', text: 'The doctor wants to see you again.', block: 'health' },
  { name: 'surgery', title: 'Surgery went well', text: 'You are home and resting.', tone: 'good', block: 'health' },
  { name: 'diagnosis', title: 'Test results', text: 'They want to talk about the diagnosis.', block: 'health' },
  { name: 'injury', title: 'Sprained ankle', text: 'A small injury, nothing serious.', block: 'health' },
  { name: 'infection', title: 'Ear infection', text: 'Your kid has one.', block: 'health' },
  { name: 'flu', title: 'Flu season', text: 'Everyone at work has the flu.', block: 'health' },
  { name: 'pregnancy', title: 'Big news', text: 'A friend is pregnant.', tone: 'good', block: 'health' },
  { name: 'therapy', title: 'Therapy', text: 'Your therapist moved offices.', block: 'health' },
  { name: 'funeral', title: 'Funeral', text: 'A neighbor is being buried on Saturday.', block: 'health' },
  { name: 'accident', title: 'Fender bender', text: 'There was an accident on your street.', block: 'health' },
  { name: 'pills', title: 'Pharmacy', text: 'You picked up your pills.', block: 'health' },
  // Plurals, endings and plain words a first list of whole words missed.
  { name: 'doctors, plural', title: 'Second opinion', text: 'Their doctors agree.', block: 'health' },
  { name: 'hospitals, plural', title: 'Rounds', text: 'You walked past both hospitals.', block: 'health' },
  { name: 'hospitalized', title: 'Neighbor', text: 'He was hospitalized last week.', block: 'health' },
  { name: 'deaths, plural', title: 'The numbers', text: 'Deaths rose this winter.', block: 'health' },
  { name: 'accidents, plural', title: 'Traffic', text: 'Several accidents closed the bridge.', block: 'health' },
  { name: 'nurses, plural', title: 'Strike', text: 'Nurses on strike downtown.', block: 'health' },
  { name: 'killed', title: 'Local news', text: 'She was killed.', block: 'health' },
  { name: 'stroke', title: 'Grandma', text: 'She had a stroke.', block: 'health' },
  { name: 'heart attack', title: 'Uncle Ray', text: 'He had a heart attack.', block: 'health' },
  { name: 'suicide', title: 'Sad news', text: 'A classmate took their own life by suicide.', block: 'health' },
  { name: 'overdosed', title: 'Next door', text: 'Someone overdosed.', block: 'health' },
  { name: 'health beats legal and money', title: 'The doctor sent a bill', text: 'A fine of $50,000.', block: 'health' },
  // Legal.
  { name: 'police', title: 'Knock knock', text: 'The police stopped by to say hello.', block: 'legal' },
  { name: 'court', title: 'Jury duty', text: 'You got a letter from the court.', block: 'legal' },
  { name: 'lawsuit', title: 'Paperwork', text: 'A lawsuit was filed against the landlord.', block: 'legal' },
  { name: 'lawyer', title: 'Call back', text: 'Your lawyer called.', block: 'legal' },
  { name: 'audit', title: 'Tax mail', text: 'You got a letter about an audit.', block: 'legal' },
  { name: 'fine', title: 'Parking', text: 'You got a fine for parking.', block: 'legal' },
  { name: 'warrant', title: 'Next door', text: 'A warrant was served at the house next door.', block: 'legal' },
  { name: 'immigration', title: 'Visa', text: 'Your immigration papers cleared.', tone: 'good', block: 'legal' },
  { name: 'lawsuits, plural', title: 'Paperwork', text: 'Lawsuits were filed against the landlord.', block: 'legal' },
  { name: 'lawyers, plural', title: 'Call back', text: 'Two lawyers called.', block: 'legal' },
  { name: 'judges, plural', title: 'Ruling', text: 'The judges ruled.', block: 'legal' },
  { name: 'murder', title: 'Local news', text: 'There was a murder nearby.', block: 'legal' },
  { name: 'assaulted', title: 'Local news', text: 'He was assaulted.', block: 'legal' },
  { name: 'evicted', title: 'Notice', text: 'You were evicted.', block: 'legal' },
  { name: 'theft', title: 'Porch', text: 'A theft on your street.', block: 'legal' },
  { name: 'robbed', title: 'Corner store', text: 'The store was robbed.', block: 'legal' },
  { name: 'bankruptcy', title: 'The firm', text: 'It filed for bankruptcy.', block: 'legal' },
  { name: 'legal beats money', title: 'A fine', text: 'The fine is $250,000.', block: 'legal' },
  // Large money.
  { name: 'money, dollars', title: 'A windfall', text: 'You won $250,000 in the lottery.', tone: 'good', block: 'money' },
  { name: 'money, millions', title: 'Deal closed', text: 'The company sold for $1.2M.', tone: 'good', block: 'money' },
  { name: 'money, plain number', title: 'Bonus', text: 'Your bonus is 12,500.', tone: 'good', block: 'money' },
  { name: 'money, rupiah', title: 'Pay day', text: 'You earned Rp 800,000 this month.', block: 'money' },
  { name: 'money, word suffix', title: 'Big fish', text: 'The deal was worth 3 billion.', block: 'money' },
  { name: 'money, quadrillion', title: 'Pay day', text: 'You earned 2 quadrillion this month.', block: 'money' },
  { name: 'money, octillion', title: 'Pay day', text: 'You earned 61 octillion pengő this month.', block: 'money' },
  { name: 'money, nonillion', title: 'Pay day', text: 'The rent is 7 nonillion.', block: 'money' },
  { name: 'money, unlisted illion', title: 'Pay day', text: 'The rent is 3 zillion.', block: 'money' },
  { name: 'money, in the title', title: 'You inherited $40,000', text: 'From an aunt you barely knew.', block: 'money' },
  // Passing rows: a minor notice like each of these routes.
  { name: 'small raise', title: 'A raise', text: 'You got a raise of $1,200.', tone: 'good', block: null },
  { name: 'a letter', title: 'A letter', text: 'A letter arrived from an old friend.', block: null },
  { name: 'friend called', title: 'Your friend called', text: 'They wanted to catch up.', block: null },
  { name: 'invitation', title: 'Barbecue', text: 'You were invited to a barbecue on Sunday.', tone: 'event', block: null },
  { name: 'minutes', title: 'Quick chat', text: 'You talked for 5 minutes.', block: null },
  { name: 'players', title: 'Pickup game', text: '12 players showed up.', block: null },
  { name: 'just under the line', title: 'Garage sale', text: 'You made $9,500.', tone: 'good', block: null },
  // Words that only look like a listed word: the stem rules must leave these alone.
  { name: 'paint is not pain', title: 'Weekend', text: 'You painted the fence.', block: null },
  { name: 'deadline is not dead', title: 'Work', text: 'The deadline moved to Friday.', block: null },
  { name: 'harmony is not harm', title: 'Choir', text: 'The choir sang in harmony.', block: null },
  { name: 'policy is not police', title: 'Mail', text: 'Your insurance policy renewed.', block: null },
  { name: 'courtesy is not court', title: 'Bank', text: 'A courtesy call from the bank.', block: null },
  { name: 'warranty is not warrant', title: 'Kitchen', text: 'The warranty on the toaster ended.', block: null },
  { name: 'accidentally is not an accident', title: 'Oops', text: 'You accidentally took the long way home.', block: null },
  { name: 'legally is not legal', title: 'Birthday', text: 'You can legally drink now.', tone: 'good', block: null },
  { name: 'still, will and skill', title: 'A new skill', text: 'You will still learn it.', block: null },
]

/** The notice a row describes, with or without the minor weight. */
export function noticeOfRow(row: NeverRouteRow, id: string, weight?: 'minor'): NoticeModal {
  return {
    kind: 'notice',
    id,
    title: row.title,
    text: row.text,
    ...(row.tone ? { tone: row.tone } : {}),
    ...(row.support ? { support: true } : {}),
    ...(weight ? { weight } : {}),
  }
}
