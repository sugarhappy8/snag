// Generic outcome for an AI-written choice popup when the AI fails before narrating the
// result: reads the chosen label's wording (risky, kind, aggressive, avoidant...) and
// produces a plausible small outcome with a popup and a life-log line.
import { getPerson, inPrison, pronouns } from '../core'
import { chance, pick, randInt } from '../rng'
import type { ChoiceModal, GameState, Person, Tone } from '../types'
import { clean, toPhrase, you } from './custom'
import { dollars, money, say, type Fx } from './helpers'

type Kind = 'illegal' | 'aggressive' | 'romantic' | 'kind' | 'avoidant' | 'diligent' | 'spend' | 'risky' | 'fun' | 'neutral'

const PATTERNS: [Kind, RegExp][] = [
  ['illegal', /\b(steal|rob|shoplift|vandali[sz]e|graffiti|break in|break into|hack|forge|smuggle|bribe|sell (the )?drugs|pickpocket|arson|loot|blackmail|embezzle|poach)\b/],
  ['aggressive', /\b(fight|punch|hit (them|him|her)|slap|attack|yell|scream|insult|threaten|confront|argue|mock|roast|kick|shove|beat|sue|curse|tell (them|him|her) off|get revenge|retaliate|stand up to)\b/],
  ['romantic', /\b(kiss|flirt|ask (them|him|her) out|go on a date|propose|romance|confess my feelings|hold hands)\b/],
  ['kind', /\b(help|give|donate|share|comfort|hug|forgive|apologi[sz]e|thank|compliment|support|listen|rescue|save|return|adopt|feed|visit|volunteer|pay|tip|encourage|console|invite|cheer|congratulat\w*|tell the truth|truth|honest\w*|call (an ambulance|911|the police|for help)|report|offer|lend|teach|babysit|take care)\b/],
  ['avoidant', /\b(ignore|walk away|leave|nothing|hide|avoid|decline|refuse|no thanks|pass|stay home|pretend|say no|not interested|mind my own|let it go|walk off|go home|skip it|stay out|keep quiet|stay quiet|look away|turn down|ghost)\b|^no\b|^nope\b|^nah\b/],
  ['diligent', /\b(study|work|practice|train|read|learn|research|prepare|focus|revise|review|plan)\b/],
  ['spend', /\b(buy|purchase|spend|splurge|treat (myself|them|everyone)|order|book (a|the)|upgrade|invest)\b/],
  ['risky', /\b(dare|jump|sneak|lie|cheat|gamble|bet|party|drink|smoke|drugs?|skip|ditch|race|speed|risk|wing it|run|climb|dive|yolo|go for it|take it|double down|all in|bluff|prank)\b/],
  ['fun', /\b(play|dance|sing|celebrate|join|accept|yes|sure|go|watch|laugh|joke|explore|enjoy|try|agree|ok|okay|absolutely|let's)\b/],
]

function classify(label: string): Kind {
  const low = label.toLowerCase()
  for (const [kind, re] of PATTERNS) if (re.test(low)) return kind
  return 'neutral'
}

/** Labels that read as speech ("Yes!", "I'll pass", "Why not?") are quoted rather than paraphrased. */
function isQuote(label: string): boolean {
  return /^(i|i'm|i'll|i've|i'd|yes|no|nope|sure|okay|ok|maybe|absolutely|never|heck|why|what|who|nah|yeah|yep|sounds|not|thanks|thank you|please|hey|wow|oh)\b/i.test(label) || /[?!]$/.test(label)
}

interface Outcome {
  t: readonly string[]
  x: readonly string[]
  /** Log suffix after "I decided to ...". */
  l?: string
  fx: Fx
  tone: Tone
  e: string
}

function crimeName(label: string): string {
  const low = label.toLowerCase()
  if (/vandal|graffiti/.test(low)) return 'Vandalism'
  if (/hack/.test(low)) return 'Hacking'
  if (/forge/.test(low)) return 'Forgery'
  if (/smuggle/.test(low)) return 'Smuggling'
  if (/bribe/.test(low)) return 'Bribery'
  if (/drug/.test(low)) return 'Drug Dealing'
  if (/break in|break into/.test(low)) return 'Breaking and Entering'
  if (/arson/.test(low)) return 'Arson'
  if (/blackmail/.test(low)) return 'Blackmail'
  if (/embezzle/.test(low)) return 'Embezzlement'
  return 'Theft'
}

function outcomeFor(g: GameState, kind: Kind, label: string, p: Person | undefined): Outcome {
  const Who = p ? p.firstName : 'They'
  const age = g.character.age
  switch (kind) {
    case 'illegal': {
      if (age >= 14 && !inPrison(g) && chance(g, 0.12)) {
        return { t: ['Busted', 'Caught red-handed'], x: ['Unfortunately, someone saw everything and called the police.', 'It was going fine until the flashing lights showed up.'], l: 'and got caught', fx: { karma: -8, count: 'crimes', arrest: { crime: crimeName(label), severity: 1 } }, tone: 'bad', e: '🚓' }
      }
      if (chance(g, 0.65)) {
        const loot = age >= 14 && /steal|rob|loot|pickpocket|shoplift/.test(label.toLowerCase()) ? dollars(g, 20, 300) : 0
        return { t: ['Got away with it', 'Smooth criminal'], x: [`Nobody noticed a thing.${loot ? ` You came out ${money(loot)} richer.` : ''}`, `You pulled it off without a hitch.${loot ? ` Your take: ${money(loot)}.` : ''}`], l: 'and got away with it', fx: { karma: -8, happiness: 3, money: loot, count: 'crimes' }, tone: 'neutral', e: '🕶️' }
      }
      return { t: ['Close call', 'Bad idea'], x: ['You panicked halfway through and ran. Nobody caught you, but your heart is still pounding.', 'It fell apart immediately. You escaped with nothing but a guilty conscience.'], l: 'but it fell apart', fx: { karma: -5, happiness: -5, count: 'crimes' }, tone: 'bad', e: '😰' }
    }
    case 'aggressive': {
      const physical = /\b(fight|punch|hit|slap|attack|kick|shove|beat)\b/.test(label.toLowerCase())
      if (chance(g, 0.5)) return { t: ['Stood your ground', 'Point made'], x: [`${Who} backed down. You feel powerful, if slightly ashamed.`, `${Who} got the message loud and clear.`], fx: { happiness: 3, karma: -3, rel: -8, count: physical ? 'fights' : undefined }, tone: 'neutral', e: '😤' }
      return { t: ['Backfired', 'That escalated'], x: physical ? [`${Who} fought back harder than you expected. You limped home.`] : [`${Who} gave as good as ${p ? pronouns(p.gender).he : 'they'} got, and everyone nearby took ${p ? pronouns(p.gender).his : 'their'} side.`], l: 'and it backfired', fx: { happiness: -5, health: physical ? -randInt(g, 3, 8) : 0, karma: -3, rel: -12, count: physical ? 'fights' : undefined }, tone: 'bad', e: '💢' }
    }
    case 'romantic':
      if (chance(g, 0.55)) return { t: ['Sparks!', 'Smooth'], x: ['It went better than you dared hope. Your heart is doing cartwheels.', `${Who} blushed and smiled. That's a yes, probably.`], fx: { happiness: 6, rel: 8 }, tone: 'good', e: '💘' }
      return { t: ['Awkward', 'Swing and a miss'], x: ['It was deeply awkward. You will replay this moment in the shower for years.', `${Who} gave you a polite pat on the shoulder. Ouch.`], l: 'and it was awkward', fx: { happiness: -4, rel: -2 }, tone: 'bad', e: '😳' }
    case 'kind': {
      const costly = /\b(pay|donate|give|lend|tip|buy)\b/.test(label.toLowerCase()) && age >= 14
      const cost = costly ? Math.min(Math.max(0, g.character.money), dollars(g, 20, 200)) : 0
      if (chance(g, 0.85)) return { t: ['Good deed', 'Heart of gold', 'Kindness wins'], x: [`${p ? `${p.firstName} was so grateful.` : 'It made someone’s whole day.'} You feel warm inside.${cost ? ` It cost you ${money(cost)}.` : ''}`, `It was the right thing to do, and everyone knew it.${cost ? ` (${money(cost)} well spent.)` : ''}`], fx: { karma: 6, happiness: 4, rel: 8, money: -cost }, tone: 'good', e: '😇' }
      return { t: ['No good deed...', 'Unappreciated'], x: ['Nobody even said thank you. You did the right thing anyway.', 'It went sideways, but your heart was in the right place.'], fx: { karma: 4, happiness: -2, money: -cost }, tone: 'neutral', e: '🙃' }
    }
    case 'avoidant':
      if (chance(g, 0.8)) return { t: ['Steered clear', 'Not my problem', 'Peace and quiet'], x: ['You stayed out of it. Sometimes that is the smartest move.', 'You kept your distance and nothing bad happened. Nothing good happened either.'], fx: { happiness: randInt(g, 0, 1), rel: -2 }, tone: 'neutral', e: '🚶' }
      return { t: ['Missed out', 'Regrets'], x: ['Later you heard what happened and wished you had gotten involved.', 'You played it safe and immediately regretted it.'], l: 'and regretted it', fx: { happiness: -3, rel: -3 }, tone: 'neutral', e: '😕' }
    case 'diligent':
      return { t: ['Hard work', 'Focused'], x: ['You put in the effort and it paid off.', 'You buckled down. Future you says thanks.'], fx: { smarts: randInt(g, 1, 3), happiness: -1, grades: 2, perf: 2 }, tone: 'good', e: '📚' }
    case 'spend': {
      const cost = dollars(g, 20, 300)
      if (age < 14) return { t: ['Allowance'], x: ['You emptied your piggy bank. It was worth it.'], fx: { happiness: 3 }, tone: 'good', e: '🐷' }
      if (g.character.money < cost) return { t: ['Declined'], x: [`You couldn't afford the ${money(cost)} it would have cost. Your card was declined in front of everyone.`], l: "but couldn't afford it", fx: { happiness: -3 }, tone: 'bad', e: '💳' }
      return { t: ['Treat yourself', 'Money well spent'], x: [`It cost ${money(cost)}, but it was worth every penny.`, `You spent ${money(cost)} and have zero regrets. Okay, one regret.`], fx: { money: -cost, happiness: 5 }, tone: 'good', e: '🛍️' }
    }
    case 'risky':
      if (chance(g, 0.55)) return { t: ['Fortune favors the bold', 'Nailed it', 'Living on the edge'], x: ['You took the risk and it paid off. What a rush!', 'Against all odds, it worked out great.'], fx: { happiness: randInt(g, 4, 8), rel: 3 }, tone: 'good', e: '😎' }
      return { t: ['Bad call', 'Oof', 'Lesson learned'], x: ['It went about as badly as it possibly could.', 'You will be telling this story as a cautionary tale.'], l: 'and it went badly', fx: { happiness: -4, health: -randInt(g, 2, 7), karma: -1 }, tone: 'bad', e: '🤕' }
    case 'fun':
      if (chance(g, 0.75)) return { t: ['Good times', 'Fun!', 'What a day'], x: ['You had a genuinely great time.', 'It turned out to be one of the highlights of your year.'], fx: { happiness: randInt(g, 3, 7), rel: 4 }, tone: 'good', e: '🎉' }
      return { t: ['Meh', 'Anticlimactic'], x: ['It was fine. Just fine. Not great.', 'It sounded more fun than it was.'], fx: { happiness: -1 }, tone: 'neutral', e: '😐' }
    case 'neutral':
      if (chance(g, 0.6)) return { t: ['Fair enough', 'Alright then', 'Decision made'], x: ['It worked out fine.', 'Nothing dramatic happened, and that is just fine.'], fx: { happiness: randInt(g, 1, 3), rel: 1 }, tone: 'neutral', e: '👍' }
      return { t: ['Hmm', 'Could have gone better'], x: ['It did not go quite the way you pictured it.', 'You are not sure that was the right call.'], fx: { happiness: -2 }, tone: 'neutral', e: '🤔' }
  }
}

/** Resolve an AI-written choice popup offline. */
export function resolveGenericChoice(g: GameState, event: ChoiceModal, choiceId: string): void {
  if (!g.character.alive) return
  const choice = event.choices.find((c) => c.id === choiceId) ?? event.choices[0]
  const shown = (choice?.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
  const label = clean(shown) || 'go with the flow'
  const kind = classify(label)
  const target = getPerson(g, event.personId)
  const person = target && target.alive && target.relation !== 'pet' ? target : undefined
  const o = outcomeFor(g, kind, label, person)
  const quoted = shown !== '' && isQuote(shown)
  const phrase = toPhrase(label)
  const lead = quoted ? `You said, "${shown}"${/[.?!]$/.test(shown) ? '' : '.'}` : `You decided to ${you(phrase)}.`
  const text = `${lead} ${pick(g, o.x)}`
  const logLine = quoted ? (o.l ? `I said "${label}" ${o.l}.` : `I said "${/[.?!]$/.test(shown) ? shown : `${shown}.`}"`) : `I decided to ${phrase}${o.l ? ` ${o.l}` : ''}.`
  const fx: Fx = { ...o.fx }
  if (person && fx.rel) fx.rels = [{ p: person, d: fx.rel }]
  delete fx.rel
  say(g, null, o.t, text, logLine, fx, o.tone, event.emoji && o.tone === 'neutral' ? event.emoji : o.e)
}
