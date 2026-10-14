# Part A: Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the AI voice out of the game's text and prove it with the PDF's A7 numbers: a voice guide, a counting script, a rewrite tool that can only change string text, new rules for five generators, and the A1 to A4 rewrites.

**Architecture:** Dependency-free Node ESM scripts under `scripts/` (a lexer and rules library, a report CLI, an extract/apply CLI). Rewriting agents see only JSON batches and return JSON; the tool validates and splices. Code changes (generators, Do Anything, Settings About) are ordinary test-first tasks. A pilot with a user checkpoint comes before any fan-out.

**Tech Stack:** Node 22 ESM scripts, TypeScript 7, Vitest 5, React 19.

**Spec:** `docs/superpowers/specs/2026-10-14-part-a-voice-design.md`. The voice guide is `docs/VOICE.md`, committed with this plan.

## Global Constraints

- `npm run typecheck`, `npm test` and `npm run build` stay green. No `any`, no `@ts-ignore`, no new dependencies, no `Math.random` in `src/game`.
- Scripts are plain `.mjs` with a hand-written `.d.mts` where a test imports them. They only read the repo, and write only the files a command names.
- In `src/`, only string text changes, except in the named code tasks (5 to 8, 10, and the two digest/pool rules in 12). No effect object, condition, id, key or RNG call is touched by a rewrite.
- Voice: `docs/VOICE.md`. Hard caps: log 90, outcome 120, scene 140, tooltip 120, digest 110 characters (holes count 0); label 5 words. Aim lower: log 60, outcome 100, scene 110, tooltip 100.
- Do not touch: the seeded RNG, the no-server rule, the README's fictional-names note, the 18+ consent gating, existing ribbon ids, saved-game key names.
- A new field on saved state is optional (missing means false). Only Task 8 adds one (`NoticeModal.support`).
- Test files are `.ts` in `test/` (no JSX; use `createElement`). Run `npx vitest run <files>` and `npm run typecheck`. The full suite runs in CI on each push (about 20 minutes); do not run it locally except in Task 14.
- One commit per code task, one per batch. Every commit message ends with two lines: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_019Jn6WVL2xH6BetgH1qFb78`. Branch `claude/new-session-1vdxk8`; push after Tasks 1, 3, 4, then after each later task or family of batches.
- Each task that changes counts or behaviour adds its line to the "Part A" section of `docs/RELEASE-v2.5.0.md`.
- A test changes only when it asserts exact old prose or old behaviour that the task replaces; the commit says which and why.

## Review Focus

- A rewrite containing a quote, backslash, backtick or `${` must stay valid code that decodes to the same text (Task 3 quoting test).
- A template literal whose holes are dropped, duplicated or invented is rejected (Task 3 `HOLES`).
- Leading era tags such as `@1998,own:mobilePhone ` survive untouched, and the tag-gated lines still parse (Task 3 `TAG`; the era tests in Task 4 and 12).
- Curly quotes and non-ASCII (`’ “ ”`, accents) round-trip through the lexer and `apply` (Task 3 fixture).
- A `log` line still ends in `.`, `!`, `?` or a closing quote; a digest line still contains `${year}:` (existing tests).
- The consent tokens `18+`, `consent`, `adults only` survive any rewrite (Task 3 `KEEP`).
- Only the self-harm Do Anything popup shows the support line (Task 8).

## Execution notes (for the controller)

Two kinds of task. **Code tasks** (1 to 3, 5 to 8, 10) go to an implementer and a reviewer as usual. Suggested models: Sonnet for 1, 2, 5, 6, 7, 10; Opus for 3 and 8; reviewers one tier up for 3 and 8, Sonnet elsewhere; the final review on the most capable model. **Batch tasks** (4, 9, 11, 12, 13) are run by the controller with the runbook below; rewriting agents are workers, not implementers.

**Runbook (one batch).** Workspace is `.superpowers/sdd/2026-10-14-part-a-voice/`, with `batches/`, `results/`, `reports/`.
1. `node scripts/voice-batch.mjs extract --files <comma list> --flags <comma list> --max 300 --out <ws>/batches/NNN.json`. It prints counts by role and flag. Without `--flags`, every unit with at least one flag is exported (`over-aim` is a flag).
2. Dispatch rewriting agents, Sonnet, up to four at once on different batches. Prompt: "Read /home/user/snag/docs/VOICE.md, then the batch file <path>. Each unit is one string from a game. Write a JSON object mapping unit id to new text to <result path> and change nothing else. Leave a unit out when it is already fine. Keep every `{{n}}` hole and every `{token}` exactly, keep every number in tooltips and outcomes, never exceed `limit` (or `maxWords`), leave `tag` out of the text, add no jokes and no facts the original lacked. Use `siblings` and `code` to keep the meaning. Reply with one line: units rewritten and units left out."
3. `node scripts/voice-batch.mjs apply --batch <b> --result <r> --report <ws>/reports/NNN.md --samples <ws>/reports/NNN-samples.json`. Rejected ids go back to a rewriting agent once, with the rejection codes, as a new batch built by `extract --ids`.
4. Sample review: a Sonnet agent reads `docs/VOICE.md` and the samples file (30 pairs) and writes `{"redo":[{"id":"...","why":"..."}]}`; redo ids go through steps 2 and 3 once. Ids still flagged after two passes are listed in the release notes, not forced.
5. Gates: `npm run typecheck`, then the test files `apply` printed. Compare `node scripts/voice-report.mjs --json` against the previous run for the touched files.
6. Commit `style(voice): <family> batch N` with the metrics delta in the body; push after each family.

---

### Task 1: The counter (`voice-report`), its CI step and the em-dash guard

**Files:**
- Create: `scripts/voice-report.mjs`, `scripts/voice/lexer.mjs`, `scripts/voice/contexts.mjs`, `scripts/voice/corpus.mjs`, `scripts/voice/rules.mjs`, `scripts/voice/rules.d.mts`, `scripts/voice/metrics.mjs`
- Create: `test/voice-report.test.ts`, `test/voice-guards.test.ts`, fixtures under `test/fixtures/voice/`
- Modify: `.github/workflows/ci.yml`, `package.json` (script `"voice": "node scripts/voice-report.mjs"`), `docs/RELEASE-v2.5.0.md` (new "Part A: voice" section with the baseline table)
- Read first: the validated prototype `.superpowers/sdd/2026-10-14-part-a-voice/prototype/measure.mjs` and its `results.txt` (definitions, calibration notes). `docs/VOICE.md` is already in the repo.

**Interfaces:**
- Produces `lexer.mjs`: `lex(src: string, tsx: boolean): { toks: Token[]; errors: string[] }` and `cook(raw: string): string`. A token keeps the prototype's fields (`k`, `p`, `raw`, `v`, `ctx`, `nExpr`, `parts`, `partAt`, `attr`) and gains `e`, the offset just after the closing delimiter (Task 3 splices with `p` and `e`).
- Produces `contexts.mjs`: `classify(toks: Token[]): void`. `corpus.mjs`: `listSourceFiles(root)`, `buildCorpus(root)`; each record gains `start`, `end` (offsets of the delimited literal) and `col` (1-based).
- Produces `rules.mjs` (types in `rules.d.mts`), all pure:
  - `BANNED_ANYWHERE: readonly string[]` = `here's what`, `Good call`, `Look at you`, `You matter`, `honestly?`, `Note that`, `Consider `, `You might want to`, `Feel free`, `Let's `, `Welcome to `, `remarkable years`, `taken far too soon`, `well-earned retirement`, `ripe old age`, `dearly missed`, `lived it his own way`, `lived it her own way`, `lived it their own way`.
  - `STOCK_VERDICTS: readonly string[]` = `Ouch`, `Classic`, `Mostly`, `Worth it`, `Barely`, `Fair`, `Still`, `Yet`, `For now`, `Nice`, `Honestly`, `Apparently`, `Allegedly`, `Yes really`, `needs a nap`, `at 3 AM`, `Nobody noticed`, `What could possibly go wrong`.
  - `TELLS: readonly string[]` = `quietly`, `somehow`, `suddenly`, `a sense of`. `FEELING_WORDS: readonly string[]` (the words a line must not end on: proud, happy, sad, relieved, magical, wonderful, special, lonely, safe, free, alive, loved, grateful, sorry, scared, nervous, excited, hopeful, homesick, perfect, complete, whole).
  - `LIMITS` and `AIMS` with the numbers in Global Constraints, for the roles `log`, `scene`, `outcome`, `tooltip` and `digest`. The roles `title`, `label` and `text` have no fixed number: Task 2 caps them at the original's length.
  - `staticLength(text)`, `gateOf(text): { tag: string; rest: string }` (tag matches `/^@[\w!+,-]+\s+/`), `hasUncontractedNegative`, `hasColonJoin`, `isPunchlineFragment`, `hasListOfThree`, `endsWithFeeling`, `isStockVerdict`, `startsWithChatbotPhrase`, and `unitFlags(text: string, role: string): string[]`.
  - Flag names are fixed: `over-cap`, `over-aim`, `long` (over 180), `no-contraction`, `colon-join`, `punchline`, `qualifier`, `nobody`, `everyone`, `disclaimer`, `chatbot`, `stock`, `tell`, `list-of-three`, `feeling-end`, `em-dash`.
- Produces `metrics.mjs`: `AUDIT` (the PDF's "Now" values), `TARGETS` (the PDF's targets), `makeEnv(corpus, opts)`, `computeMetrics(env)`.
- CLI: `node scripts/voice-report.mjs [--json] [--per-file] [--summary] [--ci] [--strict] [--root DIR]`. Default prints a table: metric, audit, now, target, status. `--ci` appends the markdown table to `$GITHUB_STEP_SUMMARY` when that is set and prints one `::warning title=Voice report::N of 10 targets missed` line. Exit 0, except 1 under `--strict` when a target is missed.

- [ ] **Step 1: Copy the prototype into the workspace** (controller does this before dispatch) and write the failing tests in `test/voice-report.test.ts`, each driving the CLI with `execFileSync(process.execPath, [...])` on the fixture tree `--root test/fixtures/voice`:
  - `'lexes nested templates, regex literals, comments and JSX text without inventing strings'` (a fixture file with those cases and a hand-listed set of expected records).
  - `'counts each metric on the fixture tree'` (one fixture file per metric with hand-counted values: a 200-character string, `. Mostly.` tails, `did not`, a colon join, `Nobody`, `fictional`, a chatbot opener, an em-dash).
  - `'prints the audit rows with target status'` and `'exits 0 by default and 1 with --strict when a target is missed'`.
  - `'--ci writes the markdown table to GITHUB_STEP_SUMMARY and prints one warning line'` (temp file path in the env).
  - `'VOICE.md lists every banned phrase, stock verdict and tell'` (imports the lists through `rules.d.mts`).
  - In `test/voice-guards.test.ts`: `'em-dashes in strings stay at 24 or fewer'`, from the CLI's `--json` on the real `src/`.
- [ ] **Step 2: Run them** (`npx vitest run test/voice-report.test.ts test/voice-guards.test.ts`). Expected: FAIL, script missing.
- [ ] **Step 3: Port the prototype** into the modules above: drop the sensitivity analysis, keep definitions and calibration notes as comments, move rule predicates into `rules.mjs`, add the `e`, `start`, `end`, `col` fields, add the CI step to `ci.yml` after typecheck: `- name: Voice report (warning only)`, `continue-on-error: true`, `run: node scripts/voice-report.mjs --ci`. Add the `voice` script.
- [ ] **Step 4: Run the tests and `npm run typecheck`.** Expected: PASS. Then run the prototype and the port on the same tree: `node <ws>/prototype/measure.mjs . --json` and `node scripts/voice-report.mjs --json`. Every shared metric value must be identical. Put the baseline table (audit versus measured, with the commit hash) in the release notes.
- [ ] **Step 5: Commit** `feat: voice report script, CI warning step and em-dash guard`, then push.

### Task 2: The rewrite tool, `extract`

**Files:**
- Create: `scripts/voice/units.mjs`, `scripts/voice-batch.mjs` (subcommand `extract`), fixtures under `test/fixtures/voice-batch/`
- Test: `test/voice-batch.test.ts` (extract half)

**Interfaces:**
- Consumes Task 1's lexer, corpus and `rules.mjs`.
- Produces `extractUnits(opts: { root: string; files?: string[]; flags?: string[]; ids?: string[]; max?: number; after?: string; includePinned?: boolean }): Batch`. CLI: `voice-batch.mjs extract --root R --files a,b --flags x,y --ids i,j --max 300 --after ID --out FILE`.
- Batch JSON (fixed): `{ "version": 1, "root": "<abs>", "units": Unit[], "counts": { "total": n, "byRole": {}, "byFlag": {}, "pinnedExcluded": n } }`. Unit: `{ id, sha, role, text, holes: string[], tag: string, limit: number, maxWords?: number, flags: string[], siblings: { role: string; text: string }[], code: string }`.
  - `id` = `file:line:col`; `sha` = first 8 hex of the SHA-256 of the literal's raw source.
  - `text` = decoded static text with each `${...}` shown as `{{0}}`, `{{1}}` in order; `holes` = the expression sources, for context only. `tag` is split off before everything else.
  - `limit` = `LIMITS[role]`; for `title`, `label` (chars) and `text` it is `min(original static length, 180)`; `maxWords` is 5 for `label`.
  - `siblings` = the other text literals directly inside the same bracket pair (at most 6); `code` = the source line, trimmed, at most 200 characters.
- Role inference (fixed): a string in the array argument of `pool(` is `log`; arguments of `say(g, x, title, text, log, ...)` are `title`, `outcome`, `log`; an argument of `notice(g, title, text, ...)` is `title`, `outcome`; properties `title:` is `title`, `text:` is `scene` when a `choices` sibling exists in the same object and `outcome` otherwise, `label:` is `label`, `hint`, `desc`, `description`, `header`, `tip`, `sub`, `note` are `tooltip`; strings in `history/digest-early.ts` and `digest-late.ts` are `digest`; anything else is `text`.
- Excluded: contexts import, type, case, compare, index, JSX class attributes; properties `id`, `key`, `type`, `kind`, `flag`, `slot`, `icon`, `emoji`; and any unit whose decoded text (12 characters or more, no holes) appears verbatim in any `test/**/*.ts` (counted in `pinnedExcluded`).
- Units are sorted by file then offset. Without `--flags`, only units with at least one flag are exported; with `--flags`, units with any listed flag.

- [ ] **Step 1: Write the failing tests** in `test/voice-batch.test.ts`, on a fixture tree with a file per case and the CLI as the entry:
  - `'infers roles from pool, say, notice and property names'` (expects the role of each fixture string).
  - `'shows holes as {{n}} and splits off an era tag'`.
  - `'sets limits by role and the label word cap'`.
  - `'excludes ids, keys, comparisons and strings a test pins'` (with `pinnedExcluded` counted).
  - `'selects by flag, by id and after an id, in stable order'`, and `'two runs give identical bytes'`.
  - `'lists siblings and the code line'`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `extractUnits` and the `extract` subcommand.**
- [ ] **Step 4: Run the tests and typecheck.** Then run `extract --out /tmp/all.json` on the real `src/` and report in the task report the counts by role, by flag, and the share of units with role `text` (the unclassified share) for the era-pack files.
- [ ] **Step 5: Commit** `feat: voice-batch extract`.

### Task 3: The rewrite tool, `apply`

**Files:**
- Create: `scripts/voice/apply.mjs`
- Modify: `scripts/voice-batch.mjs` (subcommand `apply`)
- Test: `test/voice-batch.test.ts` (apply half)

**Interfaces:**
- Consumes Task 2's `Batch`, Task 1's lexer and rules.
- Produces `applyResult(opts: { root: string; batch: Batch; result: Record<string, string>; dryRun?: boolean }): ApplyReport` with `ApplyReport = { applied: string[]; rejected: { id: string; code: RejectCode; detail: string }[]; warnings: { id: string; code: string }[]; touched: string[]; metricsDelta: { metric: string; before: number; after: number }[]; tests: string[] }`.
- `RejectCode`, checked in this order: `STALE` (sha differs from the file), `EMPTY`, `HOLES` (the multiset of `{{n}}` and `{token}` differs), `TAG` (the new text starts with an `@` gate), `LIMIT` (static length over `limit`), `WORDS` (a label over `maxWords`), `BANNED` (contains a `BANNED_ANYWHERE` phrase), `STOCK` (`isStockVerdict`), `EMDASH`, `NEGATIVE` (`hasUncontractedNegative`), `COLON` (`hasColonJoin`), `NEWLINE`, `LOG_END` (a `log` not ending in `.`, `!`, `?`, `”` or `’`), `CLOSER` (an original ending `What will you do?` must still end with it), `NUMBERS` (every digit run and `%` in the original must appear, for roles `tooltip` and `outcome`), `KEEP` (`18+`, `consent`, `adults only`, case-insensitive, present in the original must be present). After splicing there is one more, `STRUCTURE` (below).
- Soft warnings (never reject): `list-of-three`, `feeling-end`, `tell`, `longer-than-original`, `punchline`, `repeated-opener` (the same first three words in more than 5% of the batch's accepted rewrites).
- Quoting: keep the original delimiter; escape the backslash, the delimiter, and for template literals the backtick and `${`; keep non-ASCII as is; re-insert each hole's original expression where its `{{n}}` stands.
- After splicing a file, re-lex it: every token outside the rewritten literals must be identical (kind and raw) and the literal count unchanged. Otherwise restore the file and report the batch's units for that file as rejected with code `STRUCTURE`.
- `tests`: the `test/**/*.ts` files that import a touched module (match on the module's path without extension). `metricsDelta`: report metrics before and after for the touched files. CLI: `voice-batch.mjs apply --batch B --result R [--dry-run] [--report MD] [--samples JSON]`; `--samples` writes 30 `{id, before, after}` pairs (20 chosen by a fixed-seed shuffle, 10 largest relative edits).

- [ ] **Step 1: Write the failing tests**, one per rejection code and:
  - `'applies an accepted rewrite and leaves every other byte of the file alone'`.
  - `'keeps the delimiter and escapes quotes, backslashes, backticks and ${ correctly'` and `'round-trips curly quotes and accents'`.
  - `'re-inserts holes in a template literal, in the order of the new text'`.
  - `'refuses a stale batch'`, `'applies the good units of a batch and rejects the bad ones'`, `'dry run writes nothing'`.
  - `'catches a corrupted splice with the structure check'` (inject a failing splice through a test hook and expect the file restored byte for byte).
  - `'writes 30 sample pairs, 10 of them the largest edits'`, `'reports the tests that import a touched file'`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `applyResult` and the `apply` subcommand.**
- [ ] **Step 4: Run the tests and typecheck.**
- [ ] **Step 5: Commit** `feat: voice-batch apply with validation and structure check`, then push.

### Task 4: Pilot and checkpoint (controller, runbook)

**Files:** `src/game/events/era-pack-1900-kids.ts`, `src/game/business/executive.ts` (strings only).

- [ ] **Step 1: Run the runbook** on `era-pack-1900-kids.ts` (all flagged units, including `over-aim`) and on `executive.ts` (flags `long,colon-join,disclaimer,over-aim`).
- [ ] **Step 2: Gate.** `npm run typecheck`, then `npx vitest run test/era-early.test.ts test/era-early-lives.test.ts test/era-early-rules.test.ts` and the tests `apply` printed for `executive.ts`.
- [ ] **Step 3: Commit** `style(voice): pilot, era-pack-1900-kids and executive`, push.
- [ ] **Step 4: User checkpoint.** Show the user 15 before/after pairs (10 from the kids file, 5 from executive) and the metric change for both files. Do not start Task 9 onward until the user approves the voice. If they ask for changes, edit `docs/VOICE.md`, revert the pilot commit, and redo the pilot.

### Task 5: A5, the obituary

**Files:**
- Modify: `src/game/events/obituary.ts`, `test/main-character.test.ts` (the obituary assertion near line 102), `test/will-feud.test.ts` (the obituary assertions near line 643)
- Test: `test/obituary-voice.test.ts`

**Interfaces:**
- Produces `obituaryLines(g: GameState): string[]` (new export, at most 4 entries) and `writeObituary(g) = obituaryLines(g).join(' ')`.

The rule, locked here because the PDF's "4 sentences" cannot count fragments: **at most 4 lines, each at most 3 fragments** (a fragment ends in `.`).
1. Line 1, always: `${name}, ${age}. ${Cause}, ${place}.` with `Cause` capitalised. Variants keep the same shape: surrendered `... Surrendered, ${place}.`; a prisoner `... ${Cause}, ${prison name}.`; under one year `... ${Cause}, ${place}.` with age shown as `0`.
2. Line 2, by priority, up to 3 fragments: counters (`Four marriages.`, `Two prison escapes.`, `One lottery win.`, `A person of interest in 2 cases.`, years behind bars), then the main talent (`Gifted at ${label}.`), then the job or degree (`Retired bus driver.`). Omit the line when there is nothing.
3. Line 3, up to 3 fragments: survivors (`Survived by Maria and two children.`), a rift over the will (`Had not spoken to her son, Max, in years.`), a charity share of 20% or more (`Left 30% of the estate to charity.`), then the estate (`Left $3,200.` / `Died $5,000 in debt.`).
4. Line 4, one closer, only from the dry pool: `No family members could be reached for comment.` (no survivors and age 30 or over), `In lieu of flowers, the family asks that you ${pick of the existing five}.`, `A memorial service will be held in ${city}.`, `Rest in peace.`
Deleted outright: `remarkable years`, `taken far too soon`, `well-earned retirement`, `ripe old age`, `dearly missed`, `lived it ... own way`, `a happy life`, and the pet joke. Draw RNG only through `pick` and `randInt`, as now.

- [ ] **Step 1: Write the failing tests** in `test/obituary-voice.test.ts`, over lives built the way `test/main-character.test.ts` builds them:
  - `'every obituary is at most four lines of at most three fragments'` (200 seeded lives, varied age and cause).
  - `'line 1 is name, age, cause and place'` (regex `^.+, \d+\. .+, .+\.$`).
  - `'contains none of the eulogy stock'` (the `BANNED_ANYWHERE` eulogy entries).
  - `'counters become fragments'` (marriages 4, escapes 2, lottery 1 give `Four marriages. Two prison escapes. One lottery win.` as line 2).
  - `'a will rift, a charity share and the talent label still appear when present'`.
  - `'a life with no family and age 30 or over can close with No family members could be reached for comment.'`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Rewrite `writeObituary` as `obituaryLines`** and update the two existing assertions to the new prose (`main-character`: the text contains `main character syndrome` and not `maincharacter`; `will-feud`: the text contains the rift fragment, `30%` and `charity`).
- [ ] **Step 4: Run** `npx vitest run test/obituary-voice.test.ts test/main-character.test.ts test/will-feud.test.ts` and typecheck. Expected: PASS. In the task report, print six sample obituaries (different ages, a prisoner, a rich old life, a child).
- [ ] **Step 5: Commit** `feat: dry four-line obituary`.

### Task 6: A5, CEO letters

**Files:**
- Modify: `src/game/business/career.ts` (`ceoLetter`, `STYLE_INFO`), `src/game/business/board-ceo.ts` (the bullets in `staffTurn`, `policyTurn`, `siteTurn`, `debtTurn`, `payoutTurn` and the analyst line near line 670), `src/game/business/yearly.ts` (near lines 135 and 611), `src/game/business/gamestudio.ts` (near 530 to 547), `src/game/business/deeptech-manager.ts` (near 126)
- Test: `test/ceo-letter-voice.test.ts`; adjust `test/ceo-letters.test.ts` and `test/ceo.test.ts` only where they assert old prose.

**Interfaces:**
- `StyleInfo` gains `coda: readonly string[]` (two or three short tails per style: cost-cutter `Sorry.`, `Had to.`; grower `Need more money.`, `More next year.`; steady `Same as last year.`; visionary `Bet placed.`). `ceoLetter` appends at most one coda to the first bullet that cut, opened or built something, chosen deterministically from `g.year` and the company id, not the RNG.

The rule: every bullet is one action in 12 words or fewer; drop the "Verb-ed X for $Y: justification" shape (the reason after the colon goes); keep the numbers (`Hired Ana Lee, plant manager. $60,000 a year.`; `Opened 3 stores in Lyon for $2.1M.`; `Raised pay to 110% of the going rate.`); no colon joins; the 300-character analyst line becomes two bullets of 12 words or fewer. The letter keeps its `Dear ${firstName},` salutation and its signature line.

- [ ] **Step 1: Write the failing tests** in `test/ceo-letter-voice.test.ts`, over seeded companies run through a year with each style (`grower`, `costCutter`, `steady`, `visionary`):
  - `'every bullet is 12 words or fewer'`, `'no bullet has a colon join'`, `'no letter has more than one coda'`.
  - `'the four styles produce different codas'`.
  - `'bullets keep their numbers'` (a hire bullet contains the salary).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Rewrite the bullets and add `coda`.** Do not add or remove RNG draws.
- [ ] **Step 4: Run the new test, `test/ceo-letters.test.ts`, `test/ceo.test.ts` and the tests that import the touched files, then typecheck.**
- [ ] **Step 5: Commit** `feat: short CEO letters in the manager's style`.

### Task 7: A5, business outings

**Files:**
- Modify: `src/game/business/flavor.ts` (`OUTINGS`)
- Test: `test/outings-voice.test.ts`

- [ ] **Step 1: Write the failing tests:** `'at most a third of the bad lines end in a punchline fragment'`, `'no two bad lines end in the same word'`, `'no outing line breaks the voice rules'` (every `good` and `bad` passes `unitFlags` without `punchline`, `stock`, `no-contraction`, `colon-join`, `over-cap` for role `outcome`).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Rewrite the `good` and `bad` lines.** Most `bad` lines state the damage ("The grill caught fire. Nobody was hurt."); a few may keep a dry ending. Keep each outing's `name`, `drinks` and key.
- [ ] **Step 4: Run the test, the tests that import `business/flavor.ts`, and typecheck.**
- [ ] **Step 5: Commit** `style(voice): business outings`.

### Task 8: A3, Do Anything and the support line

**Files:**
- Modify: `src/game/events/custom.ts`, `src/game/types.ts` (`NoticeModal.support?: boolean`), the notice helper that `custom.ts` uses (add an option), `src/ui/components/ModalHost.tsx`, `src/ui/styles/global.css`
- Test: `test/custom-voice.test.ts`; adjust existing Do Anything tests only where they assert old prose.

**Interfaces:**
- `NoticeModal` gains `support?: boolean`. `ModalHost`'s notice card renders, under the text and only when `support` is true, a `<p className="popup-support">If you're struggling in real life, talk to someone you trust or call a local crisis line.</p>`. Export `NoticeCard` if the test needs it.

The rules: remove the `You decided to ${action}` frame (the outcome text starts with the consequence; the log line is `I ${a.phrase}.`); the generic fallbacks near the end of `custom.ts` (the lines about `honestly? Good call`, `You feel pretty good about it`, `thinking about it at 3 AM for years`) become one concrete consequence each with a small stat change (`You ${action}. It cost $40.` with money -40; `You ${action}. Three people saw.` with happiness -1); the `selfHarm` rule keeps its regex, `prison: true` and `{ happiness: 4 }`, with title `You talked to someone`, text `You talked to someone you trust. It helped a little.`, the same log line, and `support: true`.

- [ ] **Step 1: Write the failing tests** in `test/custom-voice.test.ts`:
  - `'every selfHarm phrase gets the supportive popup with support true'` (each phrase in the rule's regex: kill myself, suicide, end my life, end it all, self-harm, hurt myself, cut myself, unalive myself), with title `You talked to someone` and no `crisis`, `988` or `deserve` in the story text.
  - `'the notice card shows the support line only when support is true'` (`renderToStaticMarkup`; React escapes the apostrophe, assert on `You&#x27;re struggling`).
  - `'unmatched actions never start with You decided to and always change a stat'` (200 seeded runs).
  - `'the log line is I plus the phrase'`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The `support` field is optional on saved state (missing means false).
- [ ] **Step 4: Run the new test, the existing `custom` tests, `test/screens.test.ts` and typecheck.**
- [ ] **Step 5: Commit** `feat: plain Do Anything outcomes and a support line outside the story`.

### Task 9: A3, the other chatbot sites (batch, controller)

**Files:** the files `node scripts/voice-report.mjs --per-file --json` lists with `chatbot` hits (17 files), plus the four the PDF names: `health.ts` ("Look at you, being a good person."), `activities/nightlife.ts` ("Good call. Your organs send their thanks."), `business/yearly.ts` (`Dear ${}, here's what your CEOs did this year` becomes `Letters from your CEOs, ${year}.`), `life.ts` (the 100th-birthday line becomes `You turned 100. The local paper wants your secret. You don't have one.`).
Test: add `'the chatbot phrase count is 0'` to `test/voice-guards.test.ts`.

- [ ] **Step 1: Extract** with `--flags chatbot` and the four named lines (edit those by hand if `extract` does not flag them). **Step 2: Run steps 2 to 4 of the runbook and read all of the pairs yourself**, not a sample. **Step 3: Add the guard test, run it, the touched files' tests, and typecheck. Step 4: Commit** `style(voice): remove chatbot phrasing`, push.

### Task 10: A4, Settings About

**Files:**
- Modify: `src/ui/screens/SettingsScreen.tsx` (a new section after the existing ones, before the danger section, as `<section className="al-card set-section">` with an `<h2>About</h2>`)
- Test: `test/about.test.ts`

The text, verbatim: `Everything here is made up. People, companies and events are fictional, and the money and crime systems are simulations. Outcomes aren't guaranteed.` The README's note is untouched.

- [ ] **Step 1: Write the failing test:** `'Settings shows an About section with the one disclaimer'` (`renderToStaticMarkup(createElement(SettingsScreen))`; assert the heading and, with the apostrophe escaped, the text). **Step 2: Run it.** Expected: FAIL. **Step 3: Implement. Step 4: Run it, `test/screens.test.ts`, typecheck. Step 5: Commit** `feat: Settings About with the one disclaimer`.

### Task 11: A4, tooltips, colon joins and disclaimers (batches, controller)

**Files:** pass 1: `src/game/business/*-menu.ts`, `conglomerate-menu.ts`, `src/game/economy/menu.ts`, `business/executive.ts`, `leadership.ts`, `nepo-menu.ts`, `src/game/underworld.ts`, `royalty.ts`, `household.ts`, `development.ts`, `business/supply-policy.ts`, `deeptech-events.ts`, `manage.ts`, `gamestudio.ts`. Pass 2: every remaining unit outside the era packs with flags `long`, `colon-join` or `disclaimer`.
Test: add `'disclaimer words stay at 3 or fewer'` to `test/voice-guards.test.ts` once the metric is met.

- [ ] **Step 1: Pass 1 with the runbook,** flags `long,colon-join,disclaimer,over-aim`, one commit per file group. **Step 2: Pass 2** until the report shows strings over 180 below 60 (none narrative), colon joins below 250 and disclaimer words at 3 or fewer, or the remainder is listed in the release notes with reasons. **Step 3: Add the guard, run it and the gates. Step 4: Commit** `style(voice): rules text and disclaimers`, push after each family.

### Task 12: A1 with the A5 digest and era-pool rules (batches, controller)

**Files:** all `src/game/events/era-pack-{1900,1946,1980,2000}-*.ts` except those done in Task 4, `src/game/history/digest-early.ts`, `digest-late.ts`, `src/game/history/digest.ts` (`pricesLine` default `count` from 3 to 2), plus the four cuts the PDF names: `era-pack-1900-adults.ts` the poppy line (near 428, "felt the weight of it") and the aircraft-hum line (near 458, "the silence after"), and `era-pack-1946-adults.ts` the lines near 79 and near 490 (the second loses faith in several institutions at once). Find each by its words; if the line near 79 turns out to follow the voice rules, leave it and say so in the commit.
Test: `test/era-voice.test.ts`.

- [ ] **Step 1: Write the failing test first** (it will fail until the data conforms; commit it with the last batch): `'every year's culture text is 110 characters or fewer'`, `'a year's digest line still contains the year and a colon'`, `'every era log line is 90 characters or fewer, ends in terminal punctuation and does not end on a feeling word'` (strip `@` gates and `{tokens}`; iterate `ERA_PACKS`), `'the prices line lists two items'`.
- [ ] **Step 2: Run the runbook** per file, grouped to batches of 300 units, in this order: `*-kids.ts`, `*-child.ts`, `*-teen.ts`, `*-adults.ts`, `*-adult.ts`, then the `*events*.ts` and `*worldevents.ts` files, then the two digests. Scoped tests: `npx vitest run test/era-*.test.ts test/events.test.ts`. **Step 3: Make the cuts and the `count` change. Step 4: Add the test with the last batch, run all gates. Step 5: Commit per batch,** `style(voice): era packs <name>`, push after each year-span.

### Task 13: A2, punchlines and crowds (batches, controller)

**Files:** every file the report lists with flags `punchline`, `qualifier`, `nobody`, `everyone`, `stock` or `tell`, outside the files finished above; the PDF's worst files first (`assets.ts`, `shops/memberships-tickets.ts`, `events/adult.ts`, `shops/everyday.ts`, `workshop/catalog.ts`, `shops/luxury-*.ts`, `business/fund-events.ts`, `deeptech-events.ts`, `investments.ts`, `computer/money-*.ts`, `mastery.ts`).

- [ ] **Step 1: Run the runbook** with `--flags punchline,qualifier,nobody,everyone,stock,tell`. One joke shape per file at most; a named person or a number replaces `Nobody` / `Everyone`. **Step 2: Repeat** until punchlines are below 300, the qualifier shape below 15 and `Nobody` plus `Everyone` below 400, or the remainder is listed with reasons. **Step 3: Gates after each family. Step 4: Commit** `style(voice): punchlines and crowds <family>`, push.

### Task 14: Close-out

**Files:** `docs/RELEASE-v2.5.0.md`, `docs/ARCHITECTURE.md` (a short "Writing text" section: the guide, the report, the tool, the rule that new text follows `VOICE.md`).

- [ ] **Step 1: Final report.** `node scripts/voice-report.mjs`; put the final A7 table in the release notes with the audit values, and list every target not met with its number and reason.
- [ ] **Step 2: Full gate.** `npm run typecheck`, `npm run build`, `npm test` in the background (about 15 minutes); read the summary.
- [ ] **Step 3: Final review** on the most capable model, scoped to the code (tools, generators, Do Anything, ModalHost, About) plus a stratified read of 60 random changed strings against `VOICE.md`. One fix wave and one scoped re-review at most.
- [ ] **Step 4: PR.** Update PR #16's title to `v2.5: voice (Part A) and save-safety groundwork` and its body (what is in: Part A as measured; what is not: Part C Tasks 6 to 9, Parts B and D). Keep it a draft. Push; CI green.
- [ ] **Step 5: Commit** `docs: Part A release notes and architecture`.
