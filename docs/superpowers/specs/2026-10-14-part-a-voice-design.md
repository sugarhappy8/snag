# Part A: take the AI voice out of the game's text (v2.5)

Status: design for review. Scope is Part A of "AnotherLife v2.5 Improvement Prompt" only. Parts B, C
and D are out of scope by the user's instruction (2026-10-14), including the unfinished save-safety work
(see "Not in scope").

## What was asked for

Remove everything in the game's text that sounds like an AI wrote it, at its source, and prove it with
numbers. The PDF (Part A) names four voice-prints and where each lives:

| Id | Problem | Where |
|---|---|---|
| A1 | Literary era-pack vignettes, about 12k lines | `events/era-pack-{1900,1946,1980,2000}-*.ts`, `history/digest-early.ts`, `digest-late.ts` |
| A2 | The deadpan one-word punchline, and `Nobody` / `Everyone` | the whole codebase (988 fragments) |
| A3 | Chatbot phrasing, 17 files | `events/custom.ts` (Do Anything) and 16 more |
| A4 | Rules-manual tooltips, repeated disclaimers | `business/*-menu.ts`, `conglomerate-menu.ts`, `underworld.ts`, `household.ts`, more |
| A5 | Generators that need rule changes, not edits | obituary, CEO letters, history digest, era log pools, business outings |
| A6 | House style, 14 rules | applies to every string touched or added |
| A7 | Measurable targets, reported by a script run in CI as a warning | `scripts/` |

The user's decision on voice (2026-10-14, after seeing real before/after lines): **drier and shorter**.
Bare facts over jokes. A joke only when the event is itself a joke, and never in the life-log.

Global rules carried over from the PDF: typecheck, tests and build stay green; no `any`, no
`@ts-ignore`; engine RNG only through `src/game/rng.ts`; old saves load; money formatted only through
the core helper; a line per change in `docs/RELEASE-v2.5.0.md`; do not touch the seeded RNG, the
no-server rule, the README's fictional-names note, the 18+ consent gating on adult venues, existing
ribbon ids, or saved-game key names.

## Principle: only string text changes

Almost all of Part A is rewriting string literals. The design makes that safe by construction: a
tool changes the text inside a literal and nothing else. No mechanic, effect, RNG draw or saved-state
shape moves. Two exceptions, both named below: A3 adds one optional `support` flag to `NoticeModal`
(missing means false, so old saves load as before), and A5 changes generator rules in code.

## 1. The voice guide: `docs/VOICE.md`

One page every writer (human or agent) works from. It holds the PDF's A6 rules, the decision above,
the ban list and worked examples. Concretely:

- **Facts first.** Say what happened, with one concrete object, number or name per line. If a line
  ends on a feeling or a moral, cut that sentence. Contractions always.
- **Jokes are rationed.** Default is no joke. At most one per popup, at the end, never in a life-log
  line, and no joke shape twice in a file. When unsure, cut it.
- **Caps (hard, enforced by the tool):** life-log line 90 characters, outcome 120, scene 140, tooltip
  120, choice label 5 words and imperative. The aim is lower: the reference files
  (`baby.ts`, `kid.ts`, `crime.ts`, `prison.ts`, `careers.ts`) have a median line of 27 to 52
  characters, the era packs 74 to 86. The A7 target (median 50 or less, p90 100 or less) is the
  reference voice, and rewrites aim at a median of about 45.
- **Names over crowds.** `Nobody` / `Everyone` as a subject becomes a named person or a number.
- **No lists of three.** Two items at most, no abstract noun in the list. Digests may be fragments.
- **Colons are for prices and labels.** Two clauses get a full stop.
- **The narrator reports.** It never encourages, thanks, reassures, or addresses the player like an
  assistant. Disclaimers live in Settings → About and nowhere else.
- **The only event closer is `What will you do?`.**
- **Two ban lists.**
  - *Banned anywhere in new text:* the A3 phrases (`Dear ${name}, here's what`, `Good call`, `Look at
    you`, `You matter`, `honestly?`, `Note that`, `Consider`, `You might want to`, `Feel free`,
    `Let's`, `Welcome to X!`), the eulogy stock (`remarkable years`, `taken far too soon`,
    `well-earned retirement`, `ripe old age`, `dearly missed`), and tells a replacement tends to bring
    in: `not X but Y` pivots, `quietly`, `somehow`, `suddenly`, `a sense of`, rhetorical questions
    (except the one closer), and one sentence shape repeated down a whole file.
  - *Banned as a one-word verdict or tail, not as ordinary words:* the A2 stock words (`Ouch`,
    `Classic`, `Mostly`, `Worth it`, `Barely`, `Fair`, `Still`, `Yet`, `For now`, `Nice`, `Honestly`,
    `Apparently`, `Allegedly`, `Yes really`, `needs a nap`, `at 3 AM`, `Nobody noticed`, `What could
    possibly go wrong`). "Still life" and "not yet" are fine; ". Mostly." is not.

## 2. The counter: `scripts/voice-report.mjs`

The A7 script. Dependency-free Node ESM (TypeScript 7 ships no JavaScript compiler API, so the lexer is
hand-written). It is productised from a prototype that was validated against the real TypeScript parser
on all 486 source files (196,886 of 196,904 tokens identical) and reproduces all 16 headline numbers of the
PDF's audit within 10%.

- `node scripts/voice-report.mjs` prints a table: metric, v2.4.0 audit value, now, target, status.
  `--json`, `--per-file`, `--root DIR` (tests point it at a fixture tree) and `--summary` (markdown for
  the CI job summary) are the other modes. Exit code is 0 unless `--strict`.
- Metric definitions are written next to the code and in the report (what counts as a text string:
  at least 14 static characters, holes count zero; what a fragment punchline is; and so on).
- **CI:** one step in `.github/workflows/ci.yml`, `continue-on-error: true`, writing the table to the job
  summary and one `::warning::` line when targets are missed.
- **Two hard guards live in the test suite**, because they are absolute rules and cheap to check:
  the chatbot phrase count (the report's metric 9, which counts literals that start with an A3
  phrase) is 0, and em-dashes in strings never exceed today's 24.

## 3. The rewrite tool: `scripts/voice-batch.mjs`

The tool that makes thousands of rewrites reviewable and safe. Agents never edit game code. They get a
JSON file of strings and return a JSON file of replacements.

**`extract`** selects units from files or, by flag, from the whole codebase (`--flags punchline,nobody`),
and writes a batch. A unit is one text literal:

| Field | Meaning |
|---|---|
| `id`, `sha` | `file:line:col` and a hash of the literal's source, so a stale batch is refused |
| `role` | `log`, `scene`, `outcome`, `title`, `label`, `tooltip`, `digest` or `text`, inferred from the call or property the literal sits in (`pool(...)` lines are `log`; `say(g, x, title, text, log)` is positional; a `label:` property is `label`) |
| `text` | decoded text with `${...}` holes shown as `{{0}}`, `{{1}}` |
| `tag` | a leading era gate such as `@1998,own:mobilePhone `, kept out of the editable text |
| `limit`, `flags` | the cap for the role and which rules the text breaks |
| `siblings`, `code` | the other literals in the same call or object, and the source line, so the agent sees the scene |

Excluded: ids and keys, comparison operands, import and type literals, and any string that a test
pins verbatim (106 of about 26,000 plain strings today, mostly names and labels).

**`apply`** takes a batch and a result and splices accepted rewrites into the source. A rewrite is
**rejected** (the others still apply) unless all of these hold:

1. the `sha` still matches the file;
2. the same `{{n}}` holes appear, as a multiset;
3. the era tag is untouched;
4. static length is within the role's cap;
5. no phrase from the "banned anywhere" list, no stock word as a verdict or tail, no em-dash, no
   uncontracted negative, no mid-sentence colon join, no newline;
6. a `log` line still ends in `.`, `!`, `?` or a closing quote (existing tests require it);
7. a scene that ended in `What will you do?` still does;
8. every digit sequence and `%` in the original appears in the rewrite for `tooltip` and `outcome`
   roles (rule text must keep its numbers);
9. the tokens `18+`, `consent` and `adults only` survive, where the original had them (consent gating
   is a do-not-touch).

Softer checks are reported, not blocking: a list of three, an ending feeling-word, a rewrite longer than
the original, the same opening three words more than 5% of a batch, a leftover fragment punchline.

After splicing, the tool re-lexes the file and verifies that every token outside the rewritten
literals is byte-identical (the structure-preserving check). `typecheck` and the file-scoped tests then
run, and the tool prints a before/after metrics table for the touched files, which goes into the commit
message and `docs/RELEASE-v2.5.0.md`.

Quote handling keeps the original delimiter where the new text allows it, and escapes otherwise.

## 4. Work, in the PDF's order

The pilot comes first so the voice is checked on real data before it is applied at scale.

| Step | What | How |
|---|---|---|
| 0 | `VOICE.md`, `voice-report`, CI step, guard tests, baseline in the release notes | normal tasks, test-first |
| 1 | The rewrite tool and its tests | normal task, fixture trees |
| 2 | **Pilot:** `era-pack-1900-kids.ts` (log pools) and one tooltip file | tool run, committed |
| | **Checkpoint:** the user sees 15 before/after pairs and the new numbers before the fan-out | |
| 3 | **A5** obituary; CEO letters; business outings | normal tasks, test-first (below) |
| 4 | **A3** Do Anything and the 16 other chatbot sites; the `support` footer | tasks plus one tool batch |
| 5 | **A4** Settings → About; tooltips, colon joins and disclaimers | tool batches |
| 6 | **A1** the remaining era-pack files and both digests, with **A5** digest and era-pool rules | tool batches plus tests |
| 7 | **A2** punchlines, `Nobody` / `Everyone`, stock words, across the codebase | tool batches by flag |
| 8 | Final report: A7 numbers, release notes, PR description | |

A5's digest and era-pool rules are tests (`digestLine(y)` is 110 characters or fewer for every year,
every era-pool line is 90 or fewer and has no feeling-word ending), so they land with the A1 rewrite
of the same data and the tree stays green at each commit.

**Batch protocol.** Batches are up to 300 units, grouped by file. Rewriting agents (Sonnet) run in
parallel because they only read and write JSON and have no write access to the repo (the one place
parallel agents are safe; code tasks stay one at a time). The controller applies results one batch at a time,
runs the checks, and commits one batch per commit. A second agent samples 30 pairs per batch against
`VOICE.md` and the original meaning, and flagged ids get one redo. Units still flagged after two
passes are listed in the release notes instead of being forced.

## 5. The generators (A5), by rule

| Generator | Rule | Test |
|---|---|---|
| `writeObituary` (`events/obituary.ts`) | at most 4 sentences; opener `${name}, ${age}. ${Cause}, ${place}.`; the eulogy stock deleted; the counters are the body ("Four marriages. Two prison escapes."); closers only from the existing dry pool | 200 seeded lives: sentence count, opener shape, no stock phrases, counters present when non-zero |
| CEO letters (`ceoLetter`, bullets in `board-ceo.ts`, `yearly.ts`, `gamestudio.ts`, `deeptech-manager.ts`) | one line per action, 12 words or fewer; no "Verb-ed X for $Y: reason" shape; `STYLE_INFO` picks a voice (cost-cutter: "Cut 14 staff. Sorry."; growth: "Opened 3 stores. Need more money.") | bullet length over seeded companies; each style produces its own voice |
| `digestLine` (`history/digest.ts`, `digest-early/late.ts`) | 110 characters or fewer per year, one item per category, fragments allowed | every year |
| `eraFlavorPools` (`events/era-life.ts`, `events/flavor.ts`) | every line passes the BABY/TODDLER test: 90 characters or fewer, one object, no feeling-word ending | every pool, every era |
| `OUTINGS` (`business/flavor.ts`) | alternate joke shapes; some `bad:` lines only state the damage | at most a third of the `bad:` lines end in a punchline fragment (the report's definition), and no two end in the same word |

Generator changes must not add or remove RNG draws per call. The existing seeded-run tests are the
check, and any pinned expectation that has to move is changed in the same commit with the reason stated.

## 6. A3 and A4 specifics

**A3.** The 17 files are listed by the report (22 raw hits). `events/custom.ts` loses the `You decided
to ${action}` frame (the log line becomes `I ${phrase}.`) and its fallbacks become concrete
consequences with a small stat change. The `selfHarm` rule keeps its behaviour. Its story becomes `You
talked to someone you trust. It helped a little.` and the real-world line moves out of the story: the
popup carries `support: true`, and `ModalHost` renders a fixed line under the text, written in UI code:
"If you're struggling in real life, talk to someone you trust or call a local crisis line." Tests: the
rule still fires for each phrase in its regex, the popup has `support`, `ModalHost` renders the line
for it and not for other notices, and the ban-list guard is green.

**A4.** Settings gets a new **About** section (`<section className="al-card set-section">`, like the
others) holding the one disclaimer: "Everything here is made up. People, companies and events are
fictional, and the money and crime systems are simulations. Outcomes aren't guaranteed." The in-game
`fictional / simulated / abstract / not guaranteed` notes go (target 3 or fewer left). Tooltips become
one sentence of what it does and one of what it costs, 120 characters or fewer, no colon join. The
README's fictional-names note is untouched. Tests: the About section renders, and the report's
disclaimer-word count stays at 3 or fewer (the About text accounts for one).

## 7. Safety rails

| Risk | Answer |
|---|---|
| A rewrite breaks code | `apply` changes only literal text and proves every other token is identical; typecheck and scoped tests per batch; full CI per push |
| A mechanic changes | effects and conditions are code, not text; the tool cannot touch them |
| A rule's numbers get lost | digits and `%` must survive in tooltips and outcomes |
| Seeded lives drift | no RNG draw added or removed; seeded-run tests stay as they are |
| Old saves | log text already in a save is only data; the one new field is optional |
| Consent gating | `18+`, `consent`, `adults only` must survive any rewrite |
| A string is used as a key elsewhere | ids, keys, comparisons and test-pinned strings are excluded; CI runs the full suite |
| Replacement text has its own tells, or every line gets the same rhythm | the guide bans them, the tool counts repeated openers, and the sample review and the user's pilot checkpoint catch the rest |
| Tooling is more work than the rewrites | the lexer and metrics already exist and are validated; `apply` is splicing by recorded offsets |

## 8. Testing

- `test/voice-report.test.ts`: lexer edge cases (nested templates, regex versus division, comments,
  escapes, JSX text) and each metric's definition, through the script's own entry on a fixture tree.
- `test/voice-batch.test.ts`: extract, fake result, apply on fixture files, one case per rejection rule,
  the structure-preserving check, stale `sha`, quote handling.
- `test/voice-guards.test.ts`: the ban list is 0 and em-dashes stay at 24 or fewer, over the real `src/`.
- The A5 tests above, the A3 tests above, and the About test.
- Existing tests are changed only when they assert exact old prose, with the reason in the commit.

## 9. Not in scope

- Parts B, C and D of the PDF.
- The save-safety work (Part C #1 to #3). Tasks 1 to 5 of its plan are on this branch, reviewed and
  green, and change nothing for players (the app still saves to localStorage as before); Tasks 6 to 9
  (boot hydrate, UI wiring, notices, docs) are not done. Task 6's unfinished code is not in the repo.
- New content, new mechanics, translations.
- Voice work on the README, docs, or any file outside `src/`.

## 10. Done when

- Every A7 target is met, or the release notes list each missed one with the reason and the number.
- `VOICE.md`, `voice-report` and the rewrite tool are in, with their tests.
- Typecheck, test and build are green; CI shows the report step.
- `docs/RELEASE-v2.5.0.md` has a line per change with the counts moving, and PR #16 says what is and
  is not in it.

## 11. Size

About 7,000 era-pack strings and about 3,000 more across the codebase, of which roughly 7,500 need
rewriting, in about 25 batches. Rough range: 8 to 12 hours of agent time and 6 to 9M tokens. The pilot
tightens it.

## Decisions for you at this review

1. The About wording and the crisis-line wording in the A3/A4 sections above.
2. Whether the two hard guards (ban list 0, em-dashes 24 or fewer) should be test failures, as written,
   or warnings like the rest.
3. Whether the five finished save-safety tasks stay in PR #16 (assumed: yes).
4. One branch and one PR for all of it (assumed: yes; I can only push to this branch).
