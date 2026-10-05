// Identity: gender identity (4+), legal name change (18+) and sexual orientation (12+).
// Gender identity lives in g.flags['identity.gender'] ('cisgender' | 'transgender' |
// 'nonbinary' | 'genderqueer') with the birth gender in g.flags['identity.birthGender'].
// Transgender characters present as the other gender (character.gender flips).
import { addRelationship, count, log, notice, remember, scriptInput } from '../core'
import { notePerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Gender, Json, MenuAction, MenuGroup, MenuNode, Person, Sexuality } from '../types'
import { brokeNotice, cleanName, gate, isAbroad, localPrice, money, result } from './common'

export type GenderIdentity = 'cisgender' | 'transgender' | 'nonbinary' | 'genderqueer'

const IDENTITIES: { id: GenderIdentity; label: string; emoji: string; blurb: string }[] = [
  { id: 'cisgender', label: 'Cisgender', emoji: '\u{1F642}', blurb: 'Same as the gender you were born with' },
  { id: 'transgender', label: 'Transgender', emoji: '\u{1F3F3}\u{FE0F}\u{200D}⚧\u{FE0F}', blurb: 'A different gender from the one you were born with' },
  { id: 'nonbinary', label: 'Non-Binary', emoji: '\u{1F49B}', blurb: 'Neither exclusively male nor female' },
  { id: 'genderqueer', label: 'Genderqueer', emoji: '\u{1F49C}', blurb: 'Outside of or between the usual categories' },
]

function other(gender: Gender): Gender {
  return gender === 'male' ? 'female' : 'male'
}

export function birthGender(g: GameState): Gender {
  const v = g.flags['identity.birthGender']
  return v === 'male' || v === 'female' ? v : g.character.gender
}

export function genderIdentity(g: GameState): GenderIdentity {
  const v = g.flags['identity.gender']
  return IDENTITIES.some((i) => i.id === v) ? (v as GenderIdentity) : 'cisgender'
}

/**
 * Set the gender identity. Transgender characters present as the opposite of their birth
 * gender; everyone else presents as their birth gender. Attraction stays pointed at the same
 * gender (a gay man who transitions becomes a straight woman).
 */
export function setGenderIdentity(g: GameState, id: GenderIdentity, opts: { quiet?: boolean } = {}): void {
  const c = g.character
  const birth = birthGender(g)
  g.flags['identity.birthGender'] = birth
  g.flags['identity.gender'] = id
  const target: Gender = id === 'transgender' ? other(birth) : birth
  if (c.gender !== target) {
    if (c.sexuality === 'straight') c.sexuality = 'gay'
    else if (c.sexuality === 'gay') c.sexuality = 'straight'
    c.gender = target
  }
  if (!opts.quiet) count(g, 'identityChanges')
}

function parentsAtHome(g: GameState): Person[] {
  return g.people.filter((p) => p.alive && (p.relation === 'parent' || p.relation === 'stepparent') && !isAbroad(g, p))
}

/** How each parent takes the news. Returns a paragraph for the popup. */
function familyReactions(g: GameState, topic: string): string {
  const lines: string[] = []
  for (const p of parentsAtHome(g)) {
    const word = p.relation === 'stepparent' ? (p.gender === 'male' ? 'stepdad' : 'stepmom') : p.gender === 'male' ? 'dad' : 'mom'
    const religious = p.traits.includes('religious')
    const roll = randInt(g, 1, 100) + (religious ? 30 : 0) - Math.round(p.relationship / 5)
    if (roll < 55) {
      addRelationship(p, randInt(g, 2, 6))
      notePerson(p, `Was supportive when the player shared their ${topic}.`)
      lines.push(pick(g, [`Your ${word} hugged you and said they love you no matter what.`, `Your ${word} said they're proud of you for being yourself.`, `Your ${word} shrugged and asked what you wanted for dinner. Total acceptance.`]))
    } else if (roll < 85) {
      addRelationship(p, -randInt(g, 3, 8))
      notePerson(p, `Needed time to process the player's ${topic}.`)
      lines.push(pick(g, [`Your ${word} said they need some time to process.`, `Your ${word} went quiet and changed the subject.`]))
    } else {
      addRelationship(p, -randInt(g, 10, 20))
      notePerson(p, `Reacted badly to the player's ${topic}.`)
      lines.push(pick(g, [`Your ${word} did not take it well and you two had a big argument.`, `Your ${word} said some hurtful things. You hope they come around.`]))
    }
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Gender identity

function chooseIdentity(g: GameState, id: GenderIdentity): void {
  const before = genderIdentity(g)
  if (before === id) return
  setGenderIdentity(g, id)
  const c = g.character
  const label = IDENTITIES.find((i) => i.id === id)?.label ?? id
  const reactions = familyReactions(g, 'gender identity')
  if (id === 'cisgender') {
    log(g, 'I realized I identify with the gender I was born with.', 'event')
    result(g, 'Identity', `You've decided you identify as cisgender.${reactions ? `\n\n${reactions}` : ''}`, '\u{1F642}')
    return
  }
  remember(g, `Came out as ${label.toLowerCase()}.`)
  log(g, `I came out as ${label.toLowerCase()}.`, 'event')
  if (id === 'transgender') {
    const now = c.gender === 'male' ? 'man' : 'woman'
    notice(g, 'Coming Out', `You came out as transgender. You are a ${c.age < 18 ? (c.gender === 'male' ? 'boy' : 'girl') : now}, and you're done pretending otherwise.${reactions ? `\n\n${reactions}` : ''}`, { emoji: '\u{1F3F3}\u{FE0F}\u{200D}⚧\u{FE0F}', tone: 'event' })
    scriptInput(g, {
      title: 'New Name',
      emoji: '\u{1FAAA}',
      text: 'Would you like to go by a new first name? Leave it as is to keep your current one.',
      input: 'text',
      defaultValue: c.firstName,
      placeholder: 'First name',
      scriptId: TRANS_RENAME,
    })
    return
  }
  notice(g, 'Coming Out', `You came out as ${label.toLowerCase()}. It feels good to finally say it out loud.${reactions ? `\n\n${reactions}` : ''}`, { emoji: '\u{1F308}', tone: 'event' })
}

const TRANS_RENAME = defineScript('act.identity.transRename', (g, value) => {
  const name = cleanName(value)
  if (!name || name === g.character.firstName) return
  const old = g.character.firstName
  g.character.firstName = name
  log(g, `I started going by ${name} instead of ${old}.`, 'event')
  remember(g, `Changed first name from ${old} to ${name}.`)
})

const genderMenu: MenuGroup = {
  type: 'menu',
  id: 'identity.gender',
  label: 'Gender Identity',
  emoji: '⚧\u{FE0F}',
  subtitle: (g) => `${IDENTITIES.find((i) => i.id === genderIdentity(g))?.label ?? 'Cisgender'} · Born ${birthGender(g)}`,
  disabledReason: (g) => gate(g, { minAge: 4, prison: true }),
  header: (g) => `You were born ${birthGender(g)}. How do you identify?`,
  children: (): MenuNode[] =>
    IDENTITIES.map(
      (i): MenuAction => ({
        type: 'action',
        id: `identity.gender.${i.id}`,
        label: i.label,
        emoji: i.emoji,
        subtitle: i.blurb,
        disabledReason: (s) => (genderIdentity(s) === i.id ? 'That is how you already identify.' : null),
        confirm: () => (i.id === 'cisgender' ? null : `Come out as ${i.label.toLowerCase()} to your family and friends?`),
        run: (d) => chooseIdentity(d, i.id),
      }),
    ),
}

// ---------------------------------------------------------------------------
// Name change

const nameFee = (g: GameState) => localPrice(g, 150)

const FIRST = defineScript('act.identity.first', (g, value) => {
  const first = cleanName(value) || g.character.firstName
  scriptInput(g, {
    title: 'Last Name',
    emoji: '\u{1FAAA}',
    text: 'And your new last name?',
    input: 'text',
    defaultValue: g.character.lastName,
    placeholder: 'Last name',
    scriptId: LAST,
    data: { first },
  })
})

const LAST = defineScript('act.identity.last', (g, value, data) => {
  const c = g.character
  const d = (data ?? {}) as Record<string, Json>
  const first = typeof d.first === 'string' && d.first ? d.first : c.firstName
  const last = cleanName(value) || c.lastName
  if (first === c.firstName && last === c.lastName) {
    result(g, 'Name Change', 'You decided to keep your name after all. It suits you.', '\u{1FAAA}')
    return
  }
  const fee = nameFee(g)
  if (c.money < fee) {
    brokeNotice(g, fee, 'the name change filing fee')
    return
  }
  c.money -= fee
  g.yearActions['act.identity.name'] = 1
  const pOk = c.criminalRecord.some((r) => r.convicted) ? 0.6 : 0.92
  if (!chance(g, pOk)) {
    log(g, 'The government rejected my request to change my name.', 'bad')
    result(g, 'Request Denied', `The government rejected your request to become ${first} ${last}. You're stuck being ${c.firstName} ${c.lastName} for now.`, '\u{1F6AB}', 'bad')
    return
  }
  const oldFull = `${c.firstName} ${c.lastName}`
  c.firstName = first
  c.lastName = last
  count(g, 'nameChanges')
  remember(g, `Legally changed name from ${oldFull} to ${first} ${last}.`)
  log(g, `I legally changed my name from ${oldFull} to ${first} ${last}.`, 'event')
  const upset = parentsAtHome(g).filter((p) => p.traits.includes('religious') || chance(g, 0.15))
  for (const p of upset) {
    addRelationship(p, -randInt(g, 5, 15))
    notePerson(p, `Was upset the player changed their name to ${first} ${last}.`)
  }
  const reaction = upset.length
    ? `\n\nYour ${upset.map((p) => (p.gender === 'male' ? 'dad' : 'mom')).join(' and ')} ${upset.length > 1 ? 'are' : 'is'} upset you changed the name they gave you.`
    : ''
  result(g, 'Name Changed', `The paperwork went through. You are now officially ${first} ${last}!${reaction}`, '\u{1FAAA}', 'good')
})

const nameChangeAction: MenuAction = {
  type: 'action',
  id: 'identity.name',
  label: 'Name Change',
  emoji: '\u{1FAAA}',
  subtitle: (g) => `Legally change your name · ${money(nameFee(g))}`,
  disabledReason: (g) =>
    gate(g, { minAge: 18 }) ?? ((g.yearActions['act.identity.name'] ?? 0) > 0 ? "You've already filed a name change this year." : null),
  run: (g) => {
    if (g.character.money < nameFee(g)) {
      brokeNotice(g, nameFee(g), 'the name change filing fee')
      return
    }
    scriptInput(g, {
      title: 'Name Change',
      emoji: '\u{1FAAA}',
      text: 'What would you like your new first name to be?',
      input: 'text',
      defaultValue: g.character.firstName,
      placeholder: 'First name',
      scriptId: FIRST,
    })
  },
}

// ---------------------------------------------------------------------------
// Sexual orientation

const ORIENTATIONS: { id: Sexuality; label: string; emoji: string }[] = [
  { id: 'straight', label: 'Straight', emoji: '\u{1F46B}' },
  { id: 'gay', label: 'Gay', emoji: '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}' },
  { id: 'bisexual', label: 'Bisexual', emoji: '\u{1F49C}' },
]

function chooseOrientation(g: GameState, id: Sexuality): void {
  const c = g.character
  if (c.sexuality === id) return
  c.sexuality = id
  count(g, 'identityChanges')
  if (id === 'straight') {
    log(g, 'I realized I am straight.', 'event')
    result(g, 'Orientation', "You've realized you're straight.", '\u{1F46B}')
    return
  }
  const word = id === 'gay' ? (c.gender === 'female' ? 'gay (a lesbian)' : 'gay') : 'bisexual'
  remember(g, `Came out as ${id}.`)
  log(g, `I came out as ${id}.`, 'event')
  const reactions = familyReactions(g, 'sexual orientation')
  notice(g, 'Coming Out', `You came out as ${word}. ${pick(g, ['A weight has been lifted off your shoulders.', 'You feel more like yourself than ever.'])}${reactions ? `\n\n${reactions}` : ''}`, { emoji: '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}', tone: 'event' })
}

const orientationMenu: MenuGroup = {
  type: 'menu',
  id: 'identity.orientation',
  label: 'Sexual Orientation',
  emoji: '\u{1F308}',
  subtitle: (g) => ORIENTATIONS.find((o) => o.id === g.character.sexuality)?.label ?? 'Straight',
  disabledReason: (g) => gate(g, { minAge: 12, prison: true }),
  header: () => 'Who are you attracted to?',
  children: (): MenuNode[] =>
    ORIENTATIONS.map(
      (o): MenuAction => ({
        type: 'action',
        id: `identity.orientation.${o.id}`,
        label: o.label,
        emoji: o.emoji,
        disabledReason: (s) => (s.character.sexuality === o.id ? "That's already your orientation." : null),
        run: (d) => chooseOrientation(d, o.id),
      }),
    ),
}

export const identityMenu: MenuGroup = {
  type: 'menu',
  id: 'identity',
  label: 'Identity',
  emoji: '\u{1FAAA}',
  subtitle: 'Define your identity',
  disabledReason: (g) => gate(g, { minAge: 4 }),
  children: () => [genderMenu, nameChangeAction, orientationMenu],
}
