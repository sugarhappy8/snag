# AnotherLife v2.6.0 — A plainer voice, and groundwork for safer saves

Obituaries, CEO letters, business outings and the Do Anything box now read like short reports instead of eulogies, Settings gets an About screen with the game's one disclaimer, and the first pieces of a safer save system are in place without changing how your game saves today.

This is the first part of a larger text clean-up. Most of the game's wording (era events, year digests, tooltips, punchlines) is not rewritten yet; see "Not in this release".

## ✍️ A plainer voice

The house style is in `docs/VOICE.md`: bare facts, contractions, no morals, a joke only where the event is itself a joke. This release applies it to the generators that write the most visible text.

- **Obituaries** are at most four short lines: name, age, cause and place; the counters; who survives and the estate; one dry closer. *Dale Morgan, 58. Heart attack, Chicago, United States. Four marriages. Two prison escapes. One lottery win. Survived by Kim and his son, Cody. Left $22,000. A memorial service will be held in Chicago.*
- **CEO letters** are one short line per action in the manager's voice: *Opened 3 restaurants in New York for $1.4M. More next year.* A cost-cutter sometimes signs a line with "Sorry." The memo keeps 12 lines instead of 10.
- **Business outings** (team nights) say what happened instead of ending on a punchline.
- **Do Anything** no longer echoes your action back ("You decided to …"). The outcome is one concrete consequence with a small stat change (*You go for a run. It cost $40.*). The self-harm outcome does what it did before; its story is plain, and the line pointing to real-world help is drawn by the popup itself.
- **Settings › About** holds the one note that the game is fiction and its money and crime systems are simulations.

## 🔧 Under the hood

- `docs/VOICE.md`, and `node scripts/voice-report.mjs` (`npm run voice`), which counts ten voice targets over every string in `src/`. CI runs it as a warning; two rules are tests: no chatbot phrasings, no new em-dashes. The first half of a rewrite tool, `scripts/voice-batch.mjs extract`, exports strings to JSON for rewriting.
- Save groundwork, not used by the game yet: a schema version on every new save (2) with a migration chain, storage backends (IndexedDB, localStorage, memory), byte-exact quarantine of saves that cannot be read, and a coalesced write queue with a 20-second watchdog. Saving works exactly as before.

## Old saves

Nothing changes. New saves carry a schema number (2) and old ones count as schema 1. One optional field marks the self-harm popup; old saves have none, and it loads as "no".

## Not in this release

- The bulk of the text rewrite: era-pack events and year digests, punchlines and `Nobody` / `Everyone`, tooltips and colon joins, the in-game disclaimers, the remaining chatbot phrasings. Nine of the ten voice targets are still missed (table below). One known leftover: a CEO letter keeps a line, "These are scenarios, not guaranteed results.", because a test pins it.
- The second half of the rewrite tool (`apply`).
- The rest of the save-safety work: opening the save from IndexedDB at boot, notices for damaged saves, the Time Machine flush.

## Measurements

### The voice counter

The audit's numbers are reproduced within 10% by definitions fitted to them, so "Baseline" (the v2.4.0 tree, before any change) is the number every later change is compared with. The 59,093 text strings counted are the literals of 14 or more characters, holes counting zero. CI runs `--ci` as a warning only: the table goes to the job summary.

| Count | v2.4.0 audit | Baseline | This release | Target |
| --- | ---: | ---: | ---: | --- |
| Strings over 180 characters | 464 | 436 | 435 | < 60 |
| Era-pack string length, median / p90 | 75 / 124 | 75 / 131 | 75 / 131 | <= 50 / <= 100 |
| Fragment punchlines (`. Word.` after a sentence) | 988 | 984 | 983 | < 300 |
| `. Especially/Including/Twice... X.` shape | 77 | 74 | 73 | < 15 |
| `did not` / `is not` / `cannot` (no contraction) | 544 | 590 | 597 | < 100 |
| Mid-sentence colon joins | 722 | 719 | 713 | < 250 |
| `Nobody` + `Everyone` | 901 | 866 | 861 | < 400 |
| `fictional` / `simulated` / `abstract` / `not guaranteed` | 37 | 36 | 37 | <= 3 |
| Chatbot phrasings (files with one; 22 strings) | 17 | 17 | 15 | 0 |
| Em-dashes in strings | 24 | 24 | 24 | <= 24 |

Politics 2.0 (v2.5.0), merged into this release, adds new text that raises a few of the counts.

### Save sizes before (v2.4.0)

The main save is one plain JSON string in localStorage. These are its sizes on the unchanged v2.4.0 engine, measured by `scripts/save-size.ts` on a 100-year life: seed 14, a founder in Romania (`ro`) born in 1926 who owns 12 companies from age 30 and is alive at age 100, in 2026.

The probe uses `keepAlive` (see `probeLife` in `test/probe-life.ts`). It is a measurement aid, not a faithful life: the founder never sees a doctor, and left alone nobody gets near 100 (the best of seeds 1 to 220 reached 93). So before every year the founder's health is put back to 100 and their conditions are cleared, and nothing else is changed. Seed 14 is the first of seeds 1 to 60 to reach 100 alive.

"Raw" is the characters of the JSON string, "gzip" is node's gzip at level 6, and each part is measured on its own, so the parts do not add up exactly to the whole save.

| Part | Raw characters | Gzip bytes (level 6) | Gzip % of raw |
| --- | ---: | ---: | ---: |
| whole save | 2,151,953 | 351,925 | 16.35% |
| flags.worldEconomy.countries | 560,097 | 104,208 | 18.61% |
| flags.worldEconomy.previous | 559,261 | 103,344 | 18.48% |
| flags.worldEconomy.history | 431,892 | 59,519 | 13.78% |
| log | 318,316 | 46,695 | 14.67% |
| assets | 72,016 | 14,838 | 20.60% |
| everything else | 210,318 | 24,168 | 11.49% |

Design and plans: `docs/superpowers/specs/2026-10-13-save-safety-design.md`, `docs/superpowers/specs/2026-10-14-part-a-voice-design.md`, `docs/superpowers/plans/2026-10-14-part-a-voice.md`.
