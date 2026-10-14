# Voice guide

How the game's text sounds. It applies to every string you touch or add: events, popups, life-log
lines, menus, tooltips and generated text. `node scripts/voice-report.mjs` counts the result, and the
exact phrase lists live in `scripts/voice/rules.mjs`.

## The voice

A plain narrator who reports. Short sentences. One concrete thing per line: an object, a number, a
name. No opinions about the moment, no morals, no encouragement. Any humour comes from the facts, not
from a punchline added after them. When unsure, cut the sentence.

The reference files, which are already right: `events/flavor.ts` (BABY and TODDLER pools),
`events/baby.ts`, `events/kid.ts`, `crime.ts`, `prison.ts`, `careers.ts`, `education.ts`,
`relationships.ts`, `health.ts`. Their median line is 27 to 52 characters.

## Rules

1. **Facts first.** Say what happened, not what it meant. If a line ends on a feeling ("proud",
   "relieved", "magical"), cut that sentence.
2. **Jokes are rationed.** The default is none. At most one per popup, at the end. None in life-log
   lines. Never the same joke shape twice in a file. When unsure, cut it.
3. **Short.** See the table below. Aim at the second column, never pass the first.
4. **Contractions always:** didn't, wasn't, can't.
5. **Name people.** "Your aunt" beats "Everyone". A number beats "Nobody". Don't open a sentence
   with Nobody or Everyone.
6. **No lists of three.** Two items at most, and no abstract noun in the list. Year digests may be
   fragments.
7. **Colons are for prices and labels** ("Cost: $40"). Two clauses get a full stop.
8. **The narrator reports.** It never encourages, thanks, reassures, congratulates, or talks like an
   assistant.
9. **No disclaimers in game text.** "Fictional", "simulated", "abstract" and "not guaranteed" live
   once, in Settings, About.
10. **An event ends with "What will you do?"** and nothing else takes its place. Choice labels are
    five words or fewer and imperative: "Pay up", "Run", "Tell Mom".
11. **Keep what isn't prose.** Every number, `${...}` hole, `{token}` and leading `@gate` stays exactly
    as it was. Money goes through the money helper. The words 18+, consent and adults only stay
    wherever they were.
12. **No em-dashes**, and don't swap them for colons.

## Lengths

Characters of static text; a `${...}` hole counts as zero.

| Kind | Hard cap | Aim |
|---|---|---|
| Life-log line | 90 | 60 |
| Outcome (what happened after a choice) | 120 | 100 |
| Scene (the setup of an event) | 140 | 110 |
| Tooltip (what it does, then what it costs) | 120 | 100 |
| Year digest | 110 | 100 |
| Choice label | 5 words | 3 |

## Banned

**Anywhere in new text:** here's what, Good call, Look at you, You matter, honestly?, Note that,
Consider, You might want to, Feel free, Let's, Welcome to, remarkable years, taken far too soon,
well-earned retirement, ripe old age, dearly missed, lived it his own way, lived it her own way,
lived it their own way.

**As a one-word verdict or tail, not as ordinary words:** Ouch, Classic, Mostly, Worth it, Barely,
Fair, Still, Yet, For now, Nice, Honestly, Apparently, Allegedly, Yes really, needs a nap, at 3 AM,
Nobody noticed, What could possibly go wrong. "Still life" and "not yet" are fine. ". Mostly." isn't.

**Tells, avoid** (the tool warns): quietly, somehow, suddenly, a sense of, "not X but Y" turns,
rhetorical questions other than the one closer, and one sentence shape repeated down a whole file.

## Before and after

| Kind | Before | After |
|---|---|---|
| Scene | At a stall by the bus station, a man with a laptop and a tray of tiny memory cards will load your phone with two hundred songs or a few films for ${...}. Half the street has songs from his shop. Your friends also swap songs by short-range wireless. What will you do? | A man at the bus station stall loads phones with 200 songs for ${...}. What will you do? |
| Outcome | The book arrived in a cardboard box eight days later with a packing slip, and an apology you did not need. It was the best present you ever gave yourself. | The book came eight days later in a cardboard box. |
| Digest | Live Aid is on every television, Back to the Future makes everybody want a DeLorean, and the Nintendo Entertainment System turns Super Mario Bros. into a household name. Blockbuster opens its first video rental store and Windows 1.0 puts boxes on a screen for the first time. | Live Aid on TV. Mario on the NES. Windows 1.0. |
| Life-log | I went to confession and told the priest my sins, none of which were very interesting. | I went to confession. I had little to say. |
| Life-log | I started jogging in a tracksuit and felt silly, then invincible, then sore. | I started jogging in a tracksuit. |
| Tic | You played {sport} with some locals and held your own. Mostly. | You played {sport} with some locals and held your own. |
| Chatbot | You decided to ${action}. Several people saw. You will be thinking about it at 3 AM for years. | You ${action}. Three people saw. |
| Tooltip | Jo now owns 12% of Acme. Your stake is 60%. Shareholders never resign or retire while they hold shares, even after dilution or a skill increase. Salary is still payable. If they ever leave (dismissed, replaced or otherwise), the shares come back to you. | Jo now owns 12% of Acme, so you hold 60%. If they leave, the shares come back. |
| Disclaimer | ${clean} is a fictional criminal enterprise. Its treasury is separate from your bank. Hire a crew, choose a market, and age up to resolve abstract production, sales, wages and enforcement. Money can be lost or seized. | ${clean} keeps its own cash, apart from your bank. Hire a crew and pick a market. Cash can be seized. |

A line that already follows the rules stays as it is: "I got a detention for laughing at something I
can't remember."
