# AnotherLife v2.6.0

## Save safety

### Before (v2.4.0)

The main save is one plain JSON string in localStorage. These are its sizes on the unchanged v2.4.0
engine, measured by `scripts/save-size.ts` on a 100-year life: seed 14, a founder in Romania (`ro`) born
in 1926 who owns 12 companies from age 30 and is alive at age 100, in 2026.

The probe uses `keepAlive` (see `probeLife` in `test/probe-life.ts`). It is a measurement aid, not a
faithful life: the founder never sees a doctor, and left alone nobody gets near 100 (the best of seeds 1
to 220 reached 93). So before every year the founder's health is put back to 100 and their conditions
are cleared, and nothing else is changed. Seed 14 is the first of seeds 1 to 60 to reach 100 alive.

"Raw" is the characters of the JSON string, "gzip" is node's gzip at level 6, and each part is measured
on its own, so the parts do not add up exactly to the whole save.

| Part | Raw characters | Gzip bytes (level 6) | Gzip % of raw |
| --- | ---: | ---: | ---: |
| whole save | 2,151,953 | 351,925 | 16.35% |
| flags.worldEconomy.countries | 560,097 | 104,208 | 18.61% |
| flags.worldEconomy.previous | 559,261 | 103,344 | 18.48% |
| flags.worldEconomy.history | 431,892 | 59,519 | 13.78% |
| log | 318,316 | 46,695 | 14.67% |
| assets | 72,016 | 14,838 | 20.60% |
| everything else | 210,318 | 24,168 | 11.49% |

## Part A: voice

Part A takes the AI voice out of the game's text. The guide every writer works from is `docs/VOICE.md`.

### The counter

`node scripts/voice-report.mjs` (`npm run voice`) counts the ten targets of the improvement prompt (A7) over every
string literal in `src/` and prints them next to the v2.4.0 audit. `--json`, `--per-file`, `--summary` (markdown),
`--ci`, `--strict` (exit 1 when a target is missed) and `--root DIR` are the other modes. The definitions are in the
header of `scripts/voice/metrics.mjs` and in the report itself. CI runs `--ci` as a warning only: the table goes to the
job summary, with one `::warning` line when a target is missed. A test, `test/voice-guards.test.ts`, keeps em-dashes in
strings at 24 or fewer.

### Baseline

Measured on `1eb5bff` (the tree this section was added to; nothing under `src/` has been touched). The audit's numbers
are reproduced within 10% by definitions fitted to them, so "Measured" is the number every later change is compared
with.

| Count | v2.4.0 audit | Measured | Target |
| --- | ---: | ---: | --- |
| Strings over 180 characters | 464 | 436 | < 60 |
| Era-pack string length, median / p90 | 75 / 124 | 75 / 131 | <= 50 / <= 100 |
| Fragment punchlines (`. Word.` after a sentence) | 988 | 984 | < 300 |
| `. Especially/Including/Twice... X.` shape | 77 | 74 | < 15 |
| `did not` / `is not` / `cannot` (no contraction) | 544 | 590 | < 100 |
| Mid-sentence colon joins | 722 | 719 | < 250 |
| `Nobody` + `Everyone` | 901 | 866 | < 400 |
| `fictional` / `simulated` / `abstract` / `not guaranteed` | 37 | 36 | <= 3 |
| Chatbot phrasings (files with one; 22 strings) | 17 | 17 | 0 |
| Em-dashes in strings | 24 | 24 | <= 24 |

Nine of the ten targets are missed at the baseline. The 59,093 text strings counted are the literals of 14 or more
characters, holes counting zero.

### What has landed so far, and what has not

Landed (each is a small, tested change; the numbers above moved only a little, because only a few generators
were rewritten):

- **Counter and guide.** `scripts/voice-report.mjs`, `docs/VOICE.md`, a CI warning step, and a test that stops new
  em-dashes.
- **Obituary.** `writeObituary` now writes at most four short lines: name, age, cause and place; the counters
  ("Four marriages. Two prison escapes."); who survives and the estate; one dry closer. The eulogy stock is gone.
- **CEO letters.** One short line per action, 12 words or fewer, in the manager's style (a cost-cutter says
  "Sorry."). The memo keeps 12 lines instead of 10.
- **Business outings.** The `good` and `bad` lines state what happened and carry no punchline fragment.
- **Do Anything.** No more `You decided to ...` frame; the unmatched-action outcomes are one concrete consequence
  with a small stat change. The self-harm outcome keeps its behaviour, its story is plain, and the real-world help line
  is drawn by the popup itself (`NoticeModal.support`, optional, so old saves load as before).
- **Settings, About.** The one disclaimer lives there.
- **Rewrite tool, first half.** `scripts/voice-batch.mjs extract` exports a batch of strings to JSON for rewriting.

Not done yet (this is most of Part A):

- `apply`, the second half of the rewrite tool, which writes validated rewrites back.
- The bulk rewrites: the era packs and year digests (A1), punchlines and `Nobody` / `Everyone` (A2), tooltips, colon
  joins and the in-game disclaimers (A4), and the remaining chatbot lines (A3). The numbers in the baseline table are
  therefore close to unchanged; the current counts are in the pull request description.
- One known leftover: the CEO letter keeps a line, "These are scenarios, not guaranteed results.", because a test
  pins it; the A4 pass removes it together with that assertion.
