// Charity: donate money to a cause. Karma and happiness scale with how generous the gift is
// relative to your wealth; huge gifts make the news (and sometimes get a building named after
// you). A few "charities" turn out to be scams.
import { addHidden, addStat, count, log, netWorth, remember, spend } from '../core'
import { chance, pick, randInt } from '../rng'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { brokeNotice, gate, money, result, stablePick, usesLeft } from './common'
import { common } from '../events/era'
import { givingFundMenu } from './giving-fund'

const DONATIONS_PER_YEAR = 6
const KEY = 'act.donate'

interface Charity {
  id: string
  name: string
  emoji: string
  cause: string
  /** Past-tense flavor for big gifts: "fund a new wing". */
  thanks: string[]
  /** First year the cause had charities (ocean cleanups are an eighties idea). */
  since?: number
}

const CHARITIES: Charity[] = [
  { id: 'shelter', name: 'Paws & Whiskers Animal Rescue', emoji: '\u{1F43E}', cause: 'rescue animals', thanks: ['The shelter sent you a photo of a three-legged dog wearing a thank-you bandana.', 'A volunteer said your money will feed every cat in the building for a month.'] },
  { id: 'hospital', name: "Hope Children's Hospital", emoji: '\u{1F3E5}', cause: 'sick kids', thanks: ['The kids made you a giant card covered in glitter. It will never leave your house.', 'A nurse called to thank you personally and accidentally made you cry.'] },
  { id: 'food', name: 'Community Food Bank', emoji: '\u{1F96B}', cause: 'feeding families', thanks: ['Your donation will put a lot of meals on a lot of tables.', 'The food bank pinned a thank-you note to its bulletin board. Your name is next to the canned peaches.'] },
  { id: 'ocean', since: 1990, name: 'Clean Oceans Initiative', emoji: '\u{1F30A}', cause: 'cleaning up the oceans', thanks: ['Somewhere, a sea turtle is a little less tangled thanks to you.', 'They sent you a certificate printed on recycled seaweed. It smells.'] },
  { id: 'cancer', name: 'Cancer Research Fund', emoji: '\u{1F397}\u{FE0F}', cause: 'cancer research', thanks: ['Your money is going straight into a lab full of very smart people.', 'The foundation sent you a pin. You wear it proudly.'] },
  { id: 'homeless', name: 'Safe Harbor Homeless Shelter', emoji: '\u{1F3E0}', cause: 'people experiencing homelessness', thanks: ['The shelter can keep its doors open all winter now.', 'The director hugged you so hard your back cracked.'] },
  { id: 'wildlife', since: 1961, name: 'Global Wildlife Fund', emoji: '\u{1F43C}', cause: 'endangered species', thanks: ['You officially adopted a panda. It does not know who you are.', 'They named a baby rhino after you. Sort of. It is called "Donor 4471".'] },
  { id: 'disaster', name: 'Disaster Relief Network', emoji: '\u{1F6D1}', cause: 'disaster relief', thanks: ['Your donation helped families rebuild after a terrible flood.', 'Relief workers sent a thank-you letter from the field, with a photo of the new houses.'] },
  { id: 'library', name: 'Public Library Foundation', emoji: '\u{1F4DA}', cause: 'public libraries', thanks: ['The library forgave all your late fees. All of them.', 'They put a little bookplate with your name in a book about tax law. An honor.'] },
  { id: 'veterans', name: 'Veterans Support Alliance', emoji: '\u{1F396}\u{FE0F}', cause: 'veterans', thanks: ['A veteran wrote you a handwritten thank-you letter.', 'Your gift will pay for counseling and job training.'] },
  { id: 'arts', name: 'Young Artists Fund', emoji: '\u{1F3A8}', cause: 'arts education', thanks: ['A kid painted your portrait as a thank-you. It looks nothing like you. You love it.'] },
  { id: 'clean', name: 'Clean Water Project', emoji: '\u{1F6B0}', cause: 'clean drinking water', thanks: ['Your donation will help build a well for an entire village.'] },
  { id: 'school', name: 'Books for Every Kid', emoji: '\u{1F392}', cause: 'school supplies', thanks: ['Your money will fill a lot of backpacks this fall.'] },
  { id: 'trees', since: 1970, name: 'Plant a Million Trees', emoji: '\u{1F333}', cause: 'reforestation', thanks: ['Somewhere, a forest is a little bigger because of you.'] },
]

export function charitiesThisYear(g: GameState): Charity[] {
  return stablePick(g, 'charities', CHARITIES.filter((c) => g.year >= (c.since ?? 0)), 6)
}

/** Parse a typed amount like "1,000" or "$500". */
export function parseAmount(input: string | undefined): number {
  const n = Number.parseFloat(String(input ?? '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? Math.floor(n) : 0
}

function donate(g: GameState, ch: Charity, input: string | undefined): void {
  const c = g.character
  const amount = parseAmount(input)
  if (amount <= 0) {
    result(g, 'Donation', pick(g, ['You pretended to drop something in the donation box. The volunteer saw.', 'You donated your thoughts and prayers. The charity asked for money instead.']), ch.emoji)
    return
  }
  if ((g.yearActions[KEY] ?? 0) >= DONATIONS_PER_YEAR) {
    result(g, 'Donation', "You've donated plenty this year. The charities' thank-you letters are starting to pile up.", ch.emoji)
    return
  }
  if (!spend(g, amount)) {
    brokeNotice(g, amount, `a donation of ${money(amount)}`)
    return
  }
  g.yearActions[KEY] = (g.yearActions[KEY] ?? 0) + 1
  count(g, 'donated')
  count(g, 'moneyDonated', amount)

  const wealth = Math.max(1_000, netWorth(g) + amount)
  const share = amount / wealth
  // Karma grows with how much of your wealth you gave and (a little) with the absolute size.
  const karma = Math.min(15, Math.round(1 + share * 25 + Math.log10(Math.max(10, amount)) - 1))
  const happy = Math.min(12, Math.round(1 + share * 20 + randInt(g, 0, 3)))
  addHidden(g, 'karma', karma)
  addStat(g, 'happiness', happy)

  if (amount < 10) {
    log(g, `I donated ${money(amount)} to ${ch.name}.`, 'neutral')
    result(g, 'Donation', pick(g, [
      `You donated ${money(amount)} to ${ch.name}. The volunteer squinted at it, then thanked you very politely.`,
      `You dropped ${money(amount)} into the ${ch.name} jar. Every little bit helps. This was a very little bit.`,
    ]), ch.emoji)
    return
  }

  if (amount >= 1_000 && chance(g, 0.04)) {
    log(g, `I donated ${money(amount)} to a charity that turned out to be a scam.`, 'bad')
    addStat(g, 'happiness', -happy - randInt(g, 3, 8))
    result(g, 'Scammed!', pick(g, [
      `You donated ${money(amount)} to "${ch.name}". A week later, its founder was arrested for fraud. Your money is now ${g.year >= 1975 ? 'a jet ski' : g.year >= 1925 ? 'a speedboat' : 'a racehorse'}.`,
      common(g, 'internet') ? `The "${ch.name}" you gave ${money(amount)} to was a fake website run out of a basement. The police are looking into it.` : `The "${ch.name}" you gave ${money(amount)} to was a fake office with a rented typewriter. The police are looking into it.`,
    ]), '\u{1F6A8}', 'bad')
    return
  }

  const big = amount >= 1_000_000
  if (big) {
    addHidden(g, 'fame', Math.min(10, Math.round(Math.log10(amount / 100_000) * 3)))
    remember(g, `Donated ${money(amount)} to ${ch.name}.`)
  }
  log(g, `I donated ${money(amount)} to ${ch.name}.`, 'good')
  let text = `You donated ${money(amount)} to ${ch.name} to support ${ch.cause}. ${pick(g, ch.thanks)}`
  if (amount >= 10_000_000) {
    text += `\n\nThey're naming a building after you: the ${c.lastName} Center. The ribbon-cutting made ${common(g, 'tv') ? 'the evening news' : 'the front page'}.`
  } else if (big) {
    text += '\n\nYour gift made the local news. Strangers keep calling you a hero.'
  } else if (share >= 0.5) {
    text += '\n\nYou gave away most of what you have. That is either saintly or reckless.'
  }
  result(g, 'Thank You!', text, ch.emoji, 'good')
}

function charityAction(ch: Charity): MenuAction {
  return {
    type: 'action',
    id: `charity.${ch.id}`,
    label: ch.name,
    emoji: ch.emoji,
    subtitle: `Support ${ch.cause}`,
    disabledReason: (g) =>
      g.character.money < 1 ? "You don't have any money to donate." : usesLeft(g, KEY, DONATIONS_PER_YEAR) === 0 ? "You've already donated plenty this year." : null,
    input: {
      kind: 'number',
      money: true,
      label: 'How much do you want to donate?',
      placeholder: 'Amount',
      min: 1,
      defaultValue: (g) => String(Math.max(1, Math.min(Math.floor(g.character.money), Math.round(Math.max(10, g.character.money * 0.01) / 10) * 10))),
    },
    run: (g, input) => donate(g, ch, input),
  }
}

export const charityMenu: MenuGroup = {
  type: 'menu',
  id: 'charity',
  label: 'Charity',
  emoji: '\u{1F49D}',
  subtitle: 'Donate to a good cause',
  disabledReason: (g) => gate(g, { minAge: 18, minAgeText: 'You must be 18 to donate your own money. Try a lemonade stand fundraiser.' }),
  header: (g) => `Your balance: ${money(Math.max(0, g.character.money))}. You can make ${usesLeft(g, KEY, DONATIONS_PER_YEAR)} more donations this year.`,
  children: (g): MenuNode[] => [...charitiesThisYear(g).map(charityAction), givingFundMenu],
}
