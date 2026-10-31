# R5 cross-check of the four track plans (Bundle, Cycles, Paper, Composer)

Read: the four plans in this folder in full (`bundle.md`, `cycles.md`, `paper.md`, `composer.md`); the roadmap's R5 block, Global Constraints, Review Focus, A.2 to A.4, part E (R5 row), part G (D18, D19, D20) and F.1 and F.2; the R4 cross-check (`docs/superpowers/plans/2026-10-26-r4-v5.3.0/00-crosscheck.md`: sections 1, 2, 3, 5, 6, 9 and its closing process rules) and its `moved-tests.md`; `docs/RELEASE-v5.3.0.md`; and the code the claims below rest on (section 9). Base: `release/v5.4.0` = `main` at v5.3.0, commit `1c73b31`. Nothing under `src/`, `test/`, `scripts/` or `.github/` was edited and nothing was added to git; only the four plans (edits in section 10) and this file changed.

Where this file and a plan disagree, this file wins. Where a task body and the "Cross-check amendments" at the foot of its plan disagree, the amendment wins. Decisions are W1 to W27 (section 5); conflicts are C1 to C21 (section 3.2). R5 ships as v5.4.0 behind four build keys (P3) and one flip task (N11).

**Verdict in short**

1. 50 tasks: 42 planner tasks in the track lanes (Bundle 10, Cycles 8, Paper 10, Composer 14) plus 8 lead tasks (P1 to P6, N11, B11). The graph is acyclic and every dependency exists (Appendix A, run for real). 13 waves; the longest chain is P1, B1, B2, B3, N1, N5, N6, N8, N9, N10, N11, B11, P6. Source 15,797 lines (roadmap 16,900), test 22,630 lines (roadmap 18,252, so +24%), docs about 2,350 lines (roadmap 1,800).
2. 21 conflicts were found and settled (section 3.2). The five that would have failed CI or broken a rule: eager source from other tracks would break the bundle allowance before the diet (it has 5,999 bytes of room, C6); the composer's disclosure feed O13 would write `world.facts` rows into every life and move the golden `world` slice before the flip (C10); the Cycles oracle `cycle-closure` would fail on any new script another track adds (C9); the Paper's new template files would fail the static era gate on words like "crypto" (C11); two tasks both wanted to flip flags and re-record the same fixtures (C3).
3. Only one task re-records fixtures: **N11**, the flip, with the four build keys, the version 5.4.0 and one reason per fixture. No other task moves a recorded fixture; a digest that moves anywhere else means that task is wrong.
4. The roadmap's bundle line cannot be met as written. Measured: the diet takes the initial bundle from 3,023,099 to about 2,538,000 gzip bytes (-16%) with the data packs, to about 2,203,000 (-27%) with the careers lazy (B7); on the integrated tree, with the Paper and composer code on top, the head is about 2,581,500 and about 2,254,800. "5.5 MB raw, 35% smaller" is not reached by the plan (it also needs luxury shops and the computer domain). Owner question OQ1.
5. The bundle allowance (+60,000 over the v5.2.0 baseline) has 5,999 bytes of room until B3 merges. Rule G1: no task of another track that adds eager source merges before B3. That holds N1, O1, O3, O13 and everything behind them for three waves; the Cycles track, B8, B9, B10 and the lead tasks fill the second agent slot meanwhile.
6. Four Opus-fallback marks exist (B7, N2, O8, Y4). Never two Opus sessions at once; the queue order is O8, N2, B7, Y4 (W22).
7. No new saved field is unbounded; the schema stays 3. World nodes: R4 measured 45,600 at all its caps; R5 adds about 1,980 (the Paper 1,924, `rep` about 55, `ft` 1), so about 47,580 of the 55,000 budget and 6,000 allotment: no raise (P2).
8. The exit gate is a lead-driven walk on a scratch rehearsal branch with the four keys forced on, done before N11; then B11 (re-capture on the release head), then P6, then STOP at a green PR until the owner gives an explicit OK to merge and tag.

## 1. The task graph

### 1.1 Lanes

Five lanes, one per track plus `lead`. Inside a lane the order below is the order in the table of 1.2; a task never shares a worktree with a task it does not depend on. At most 2 test-running agents at a time (4 CPUs, one `npx vitest run --maxWorkers=1` each, R4 rule 3).

| Lane | Tasks | Source lines | Test lines |
|---|---|---|---|
| bundle | B1, B2, B3, B4, B5, B6, B7, B8, B9, B10 | 4,140 | 6,040 |
| cycles | Y1, Y2, Y3, Y4, Y5, Y6, Y7, Y8 | 965 | 1,260 |
| paper | N1, N2, N3, N4, N5, N6, N7, N8, N9, N10 | 5,180 | 8,050 |
| composer | O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12, O13, O14 | 5,270 | 7,050 |
| lead | P1, P2, P3, P4, P5, P6, N11, B11 | 242 | 230 |
| total | 50 tasks | 15,797 | 22,630 |

Lane changes against the plans: B11 and N11 move to `lead` (the plans filed them under their tracks); the sizes of the lead tasks are mine.

### 1.2 Tasks, dependencies, sizes

Ids are written without the `R5-` prefix. "Src" and "Test" are planned lines. Model: S = Sonnet, S/O = Sonnet with an Opus fallback after one failure, L = the lead. Dependencies in bold are added or changed by this cross-check; the track plans' own dependencies are unchanged otherwise.

| Id | Title | Deps | Src | Test | Lane | Model |
|---|---|---|---|---|---|---|
| P1 | Bundle baseline re-measured, ceilings table, gate G1 | - | 0 | 0 | lead | L |
| P2 | World budget measured with paper and rep at their caps | N1, O1 | 0 | 40 | lead | L |
| P3 | FLAG_DEFS keys paper, composer, standing, tips; flags.test.ts | **P4** | 12 | 20 | lead | L |
| P4 | moved-tests.md, re-record protocol, RELEASE-v5.4.0.md skeleton | - | 0 | 0 | lead | L |
| P5 | CI timing policy, checkpoints CP1 to CP3, nightly rows, ceiling-row cost rule | - | 0 | 0 | lead | L |
| P6 | Release docs, v5.4.0 save fixture, roadmap block, full CI, STOP | B11 | 60 | 10 | lead | L |
| B1 | Pack gate, needs table, loaders table, vitest shim alias | **P1** | 480 | 820 | bundle | S |
| B2 | Store seam, PackGate card, boot prefetch, node entries preload | B1 | 560 | 780 | bundle | S |
| B3 | The four era packs | B1, B2, **P4** | 300 | 560 | bundle | S |
| B4 | Locales and brands packs | B1, B2 | 340 | 520 | bundle | S |
| B5 | History headline and market packs | B1, B2 (**Paper edge removed**) | 220 | 380 | bundle | S |
| B6 | Chunk names, budget script v2, end of the 8000 limit | B3, **B4, B5** | 280 | 520 | bundle | S |
| B7 | Careers as lazy domains | B1, B2, B6 | 820 | 900 | bundle | S/O |
| B8 | Voice cap gate (K.9a) | - | 360 | 560 | bundle | S |
| B9 | Static era gate (K.9b) | **P4** | 520 | 640 | bundle | S |
| B10 | One corpus walk, voice-gate CLI, CI step (K.9c) | B8, B9 | 260 | 360 | bundle | S |
| B11 | Re-capture baseline, allowance 30,000, hash check, release walk | B6, B7, **N11** | 120 | 160 | lead | L |
| Y1 | Oracle tests: closure, parity, leaves, seams | (**no longer "all tracks"**) | 0 | 240 | cycles | S |
| Y2 | Business leaves heavy-state, product-hash | Y1 | 315 | 110 | cycles | S |
| Y3 | Four small cuts in business | Y1, **P4** | 45 | 60 | cycles | S |
| Y4 | Five ports for the research and finance year | Y2, Y3 | 60 | 330 | cycles | S/O |
| Y5 | special/model-*: model-base leaf, injury-odds port | Y1 | 170 | 120 | cycles | S |
| Y6 | special/actor-* and astronaut-*: leaves, flyOn port | Y1 | 310 | 140 | cycles | S |
| Y7 | The three pairs: house-value leaf, two ports | Y1 | 65 | 150 | cycles | S |
| Y8 | The zero rule, ceilings to zero, notes | Y4, Y5, Y6, Y7 | 0 | 110 | cycles | S |
| N1 | Story model, 53 kinds, paper shard, scoring, snapshot types | **P3, B3** | 640 | 900 | paper | S |
| N2 | news.desk, composeEdition, seal, archive, schedule strip | N1 | 600 | 850 | paper | S/O |
| N3 | Economy detectors, ranking, collapse rule | N2 | 560 | 1,000 | paper | S |
| N4 | Market, tech, rival, rumour detectors | N2 | 620 | 850 | paper | S |
| N5 | Outlets, bias, regime control | N1, **B8, B9** | 500 | 650 | paper | S |
| N6 | Headline templates (189 cells), render; freezes F3 | N1, N5 | 650 | 750 | paper | S |
| N7 | Player stories by fame tier, fame effect, stampPaper | N2 | 450 | 600 | paper | S |
| N8 | Paper view model, lazy sheet, header button, seen marker | N2, N6 | 670 | 750 | paper | S |
| N9 | Chips, links, archive, folding, log chip | N8 | 450 | 600 | paper | S |
| N10 | Acceptance: isolation, replay, hostile, old saves, six ceiling rows | N1 to N9 | 40 | 1,100 | paper | S |
| N11 | The release flip: yearly entry, four keys, version, re-record, walk | **N10, O14, Y8, B7, B10, P2** | 50 | 0 | lead | L |
| O1 | The ft stamp, caps, the rep shape | **P3, B3** | 260 | 300 | composer | S |
| O2 | Topic catalogue (58 ids), Edge.d and Edge.n store | O1 | 340 | 430 | composer | S |
| O3 | The composer engine | **B3** | 360 | 480 | composer | S |
| O4 | Voice lines (215) | O3, **B8, B9** | 330 | 380 | composer | S |
| O5 | Talk glue and the conversation seam | O2, O4, O6 | 460 | 640 | composer | S |
| O6 | perceivedAxes, persona state lines, narrator voice | O1, **B8, B9** | 330 | 420 | composer | S |
| O7 | Persona nudges, guilt, owners test | O1, **O5** | 380 | 520 | composer | S |
| O8 | Standing: rep[group], memoryOdds extension, profile section | O1, O6 | 600 | 760 | composer | S/O |
| O9 | Scandal: press, delay, the story that runs | O8, O10 | 400 | 520 | composer | S |
| O10 | Tips and Offers: store, menu, the one popup | O1 | 520 | 560 | composer | S |
| O11 | Offers: endorsement, interview, tip | O10, O8, **O9** | 560 | 640 | composer | S |
| O12 | Exposes: deny, settle, sue, silence | O9, O10, O8 | 520 | 620 | composer | S |
| O13 | Disclosure feed (tech.landed, tech.rival, tech.disclosed) | **O1** (was none) | 150 | 260 | composer | S |
| O14 | Rehearsal, acceptance, gates, docs (re-records nothing) | O1 to O13 | 60 | 520 | composer | S |

All planned sizes are at or under 820 source lines; the largest tasks are B7 (820), N8 (670), N6 (650), N1 (640), N4 (620), N2 (600), O8 (600). The R4 rule (no task above about 700 source lines without a stated Opus fallback) holds: B7 has the mark; N8 and N6 are text and view work with no hidden state.

### 1.3 Waves (longest dependency chain to each task)

A task is in wave k when its longest chain of dependencies has k tasks including itself (Appendix A computes it).

| Wave | Tasks |
|---|---|
| 1 | P1, P4, P5, B8, Y1 |
| 2 | B1, P3, B9, Y2, Y3, Y5, Y6, Y7 |
| 3 | B2, B10, Y4 |
| 4 | B3, B4, B5, Y8 |
| 5 | N1, O1, O3, B6 |
| 6 | N2, N5, P2, O2, O6, O10, O13, O4, B7 |
| 7 | N3, N4, N7, N6, O8, O5 |
| 8 | N8, O9, O7 |
| 9 | N9, O11, O12 |
| 10 | N10, O14 |
| 11 | N11 |
| 12 | B11 |
| 13 | P6 |

Longest chain (13): P1, B1, B2, B3, N1, N5, N6, N8, N9, N10, N11, B11, P6. A second chain of 13 runs through the composer: P1, B1, B2, B3, O1, O6, O8, O9, O11 or O12, O14, N11, B11, P6. Tasks with no slack: P1, B1, B2, B3, N1, O1, N5, O6, N6, O8, N8, O9, N9, O11, O12, N10, O14, N11, B11, P6. Slack of one wave: N2, O2, O3, O4, O5, O7, O10. The Cycles lane has 6 to 7 waves of slack and the Bundle voice tasks 3 to 7, so they are the work for the second slot while the critical chain runs.

With two slots the wall time is set by the total work, not by the 13 waves. The roadmap budgets 69 agent-hours and 20.7 wall hours for R5; the plans total 15,797 source lines (roadmap 16,900) and 22,630 test lines (roadmap 18,252), so the test side runs about 24% over and the Paper plan alone estimates 26 agent-hours. The lead should expect the build to take longer than 20.7 wall hours and not plan around that figure.

### 1.4 Cross-track edges (why each exists)

| Edge | Reason |
|---|---|
| P1 -> B1 | The baseline figures, the integrated ceiling table and gate G1 are written down before the first source task (P1 changes no file in `scripts/`). |
| P4 -> P3, B3, B9, Y3 | `moved-tests.md` exists before the first task that edits an existing test on purpose: P3 (`flags.test.ts`), B3 (`layers-baseline.json`), B9 (`anachronism.test.ts`), Y3 (four `boardAllows` spies). |
| P3 -> N1, O1 | The four build keys and the one edit of `test/flags.test.ts` are the lead's (R4-P3 precedent). N1 and O1 stop editing both files (C1). |
| B3 -> N1, O1, O3 (and O13 through O1) | Gate G1. The allowance has 5,999 bytes of room; B1 and B2 spend about 3,000 to 4,000 of them; N1 alone is about 600 eager lines (about 2,500 bytes at 4.1 a line). B3 frees 213,000. Every later task follows these transitively. |
| B8, B9 -> N5, O4, O6 | New text is born under the voice and era gates: the baselines are captured before the Paper's outlet names and the composer's lines and state rows exist, so they cannot be grandfathered (C16). N6 follows N5; O5, O9, O11, O12 follow O4 or O6. |
| N1, O1 -> P2 | The shapes of `paper` and `rep` exist, so the worst-case world can be built and measured. |
| B6, B7, N11 -> B11 | The baseline is re-captured on the release head, after the flip, so it includes every track. B11 needs B6 (and B7 when built). |
| N10, O14, Y8, B7, B10, P2 -> N11 | The flip runs when every code task has merged and both rehearsals are done. Y8 before the flip, so the re-record and the walk are on the final code; B7 before it because it changes the menu sheet and the store. B4 and B5 come in through B7. |
| B11 -> P6 | The release notes quote the final bundle figures. |
| O5 -> O7 | Both edit `relationships.ts` around `conversation()` and `rel.convo.argue` (O5 edits `:2361-2412`, O7 adds a line in the argue branches); lane order avoids a textual conflict (lane edge, same track). |
| O9 -> O11 | Both append to `text/pools.ts` and to `society/module.ts` (`facts` list and steps) (lane edge, same track). |
| B4, B5 -> B6 | The absolute ceiling `initialMaxGzBytes` is only true once stage 1 is complete (C6). |

Edges removed: B5 -> "Paper's first merge of history/events.ts" (the Paper edits nothing in `history/`, C5); Y1 -> "every other R5 track" (C8).

### 1.5 Merge order into `release/v5.4.0`, and the gates

The integrator (the lead) merges one task at a time when its dependencies have merged, in this priority, which only orders tasks that are ready at the same time (largest remaining chain first, then wave): P1, B1, B2, B3, N1, O1, N5, O6, N6, O8, N8, O9, N9, O11, O12, N10, O14, N11, B11, P6 (the critical chains), then O3, N2, O10, O2, O4, O5, O7, P4, P3, N3, N4, N7, B9, O13, B8, B4, B5, B6, B7, P2, Y1, Y2, Y3, Y4, Y8, Y5, Y6, Y7, B10, P5. Lead tasks are done by the lead, not dispatched. The order by wave:

1. Wave 1 to 2: P1, P4, P5, B8, Y1, then B1, P3, B9, Y2, Y3, Y5, Y6, Y7 (Y tasks merge in any order; each regenerates `test/architecture-baseline.json`).
2. Wave 3 to 4: B2, B10, Y4, then **B3 (CP1)**, B4, B5, Y8.
3. Wave 5 to 6: N1, O1, O3, B6, then N2, N5, P2, O2, O6, O10, O13, O4, B7.
4. Wave 7 to 9: N3, N4, N7, N6, O8, O5, then N8, O9, O7, then N9, O11, O12. **CP2** when wave 9 has merged (feature freeze: every code task but the two acceptance tasks).
5. Wave 10: N10, O14. **CP3**, then the rehearsal and the walk, then **N11** (wave 11), B11 (12), P6 (13).

Gates, each enforced by the integrator:

- **G1** (bundle headroom). No eager source of the Paper or composer merges before B3. The tasks that may merge before it are B1 and B2 (about 3,000 to 4,000 bytes between them), the voice tasks B8 to B10 (scripts and tests, nothing in the bundle), the lead tasks, and the Y tasks (net bytes within +1,500 in all, measured -712 on the Cycles copy); the integrator prints the bundle report at each of these merges and holds a Y task if the delta passes +57,500. If B3 slips past the point where only gated tasks are left, the lead asks the owner for a temporary raise (OQ5); R4's "+120,000 if needed" was an R4 approval and is not assumed to carry over.
- **G2** (text born clean). B8 and B9 merge before N5, O4, O6; the voice and era baselines are never merged by hand and shrink only (W15).
- **G3** (fixtures). Only N11 re-records. A red golden or parity check on any other task stops that task.
- **G4** (Opus). One Opus session at a time across all tracks, Sonnet first (W22).
- **G5** (B7 decision). The lead decides at CP1 whether B7 is built in R5 (W8). If dropped, B7 leaves the table, B11 and N11 depend on B6 instead, and the plan for R6 gets B7 as its task zero unchanged.

### 1.6 Proof that there is no dependency cycle

Appendix A is a Kahn's-algorithm run over the table in 1.2 (the same table as `/tmp/claude-0/-home-user-snag/6c431472-dc02-517c-872c-436596f3a0de/scratchpad/r5-tasks.json`): all 50 ids are reached, no dependency is missing, 13 waves, and it counts 24 cross-lane edges (the ones grouped in 1.4). The one place a cycle could have appeared is the flip: N11 depends on O14 and Y8 and B7, and B11 and P6 depend on N11, while no track task depends on N11, B11 or P6, so the lead tasks are sinks. P2 depends on N1 and O1 and only N11 depends on P2.

## 2. The hot-file matrix

Files edited by more than one task, with the merge order and the rule. "By hand" means the sorted list or the JSON is merged by hand or regenerated by the named command and never merged blind. Anchors are the plans' line numbers at `1c73b31`; each task re-greps before it edits (R4 rule 8).

### 2.1 Within R5

| File | Tasks in merge order | Rule |
|---|---|---|
| `vite.config.ts` | B1 (test block, alias, `:22`), B6 (build block, `:12`) | B1 first; the alias lives in `test`, never in `resolve` |
| `scripts/bundle-budget.mjs`, `.d.mts`, `scripts/bundle-baseline.json`, `test/bundle-budget.test.ts` | B6, B11 | baseline written by `--update` only; two pins move on purpose (C12) |
| `src/ui/store.ts` | B2 (`:82,99,208,222,231,274,381,494`), N8 (`markPaperSeen`, `:661`) | B2 first; N8 adds one function through `act` |
| `src/ui/screens/GameScreen.tsx` | N8 (`:32,224`), N9 (`:202`) | Paper lane order |
| `src/game/life.ts` (`:1025`) | O1 (`stampFeatures` beside `stampSocial`), N7 (`stampPaper` on its own line after it) | O1 first; the two stamps are independent (C2) |
| `src/game/flags.ts`, `test/flags.test.ts` | P3 (four keys, eleven to fifteen), N11 (defaults) | the lead only (C1) |
| `package.json` | B8 and B10 (script `voice:gate`), N11 (version 5.4.0) | N11 last |
| `src/game/modules/index.ts` | N2 (`newsModule`), O13 (`waves-facts`) | ids ascend: `menus.*`, `news.desk`, `society.acts`, `world.disclosure` |
| `src/game/society/module.ts` | O1 (comment), O10, O6, O8, O9, O11 | the step order of composer 2.8 (`repYear`, `scandalStep`, `offersYear`, `tipsYear`, `personaYear`) is written by O1 as a comment; each task adds one line at its place |
| `src/game/society/contract.ts` | O5, O10 | either first; textual only |
| `src/game/text/pools.ts` | O9, O11, O12 | one named pool each, appended at the end |
| `src/game/relationships.ts` | O5 (`:227-285`, `:2353`, `:2361-2412`), O7 (act sites, `:2526` and after) | O5 first (lane edge) |
| `src/game/world/budget.ts` | N1 (`case 'paper'`), O1 (`case 'social'`, second row `rep rows`) | different cases (C14) |
| `test/world-budget.test.ts` | N1 (paper at its caps, 1,924), P2 (rep at its caps, the new pin) | N1 first |
| `test/hub-entry.test.ts` | N2, O13 (`HUBS`), Y4 to Y7 (`HUBS`, `EXPECTED_PORTS`), B7 if it adds a port | by hand, sorted; the later task inserts |
| `test/kernel-acceptance.test.ts` | Y4 to Y7 (`PORTS`, `toEqual`), Y8 (`:117-121` to `[]`), B7 if it adds a port | by hand, sorted |
| `test/ceiling-list.json`, `test/ceiling-kit.ts` | O2, O6, O7, O8 (two rows), O10, O11, O12, then N10 (six rows) | each appends at the end; 53 rows become 67; row cost rule P5 |
| `test/lazy-zones.test.ts` | N8 (PAPER zone), B7 if it adds a zone | one row each, no expectation changed |
| `test/layers-baseline.json` | B3, B4, every Y task (expected byte-identical) | `UPDATE_LAYER_BASELINE=1` after the merge, shrink only; never `=rebase` in R5 except by the lead with a reason |
| `test/architecture-baseline.json` | Y2 to Y8 | `UPDATE_ARCH_BASELINE=1` after each merge; ends as `{v:1, components:[]}` |
| `test/voice-gate-baseline.json`, `test/era-gate-baseline.json` | B8, B9 create; O5 and any task that edits text shrink them | `UPDATE_VOICE_BASELINE=1` (shrink); growth is `=rebase`, lead only (W15) |
| `test/fixtures/*.json` (golden, kernel-parity, r2-parity, social-parity-*, life-pins, people-ui-exact) | N11 only | G3 |
| `docs/KERNEL.md` | B1 (section 9 line), Y4 (section 4 table), Y8 (sections 5, 8), N11 (phase table `:30`, the `news` row) | read by `kernel-acceptance`; no U+2014 or U+2013 |
| `docs/CI.md` | B2, B6, B10, N10, O14, P5 | one paragraph or row each |
| `docs/VOICE.md` | B8 (The gate), B9, N6 (Paper section), O4 and O14 (six voices, fitting rule) | - |
| `docs/ARCHITECTURE.md` | Y2, Y4, Y8, N2, N10, O14 | - |
| `docs/WORLD.md` | N1 (shard table), P2 (budget figures) | - |
| `docs/PACKS.md` | B1 creates; B2 to B6 and B11 add rows | one row per task |
| `docs/RELEASE-v5.4.0.md` | P4 (skeleton with one heading per track), B11, Y8, N11, P6 | each fills its heading; P6 finishes |
| `scripts/save-fixtures.ts` | B2 (`preloadAllPacks`), P6 (new mode) | B2 first |
| `.github/workflows/ci.yml` | B10 (one step) | - |
| `.github/workflows/nightly.yml`, `scripts/nightly-lib.mjs`, `test/nightly-workflow.test.ts` | O14 (one `deep` matrix row, `nightlySizes`, the YAML pin) | the three together (C13) |
| `src/game/business/gamestudio.ts` | Y3 (`earmarkedCash` leaves, re-exported), B7 (import lines) | whichever second rebases |
| `business/economy.ts`, `rd.ts`, `heavy-rd.ts`, `lab-year.ts`, `product-market.ts` | Y2, Y3, Y4 | Cycles lane order; no other track edits them (grep, section 9 row 24) |
| `business/tech-waves.ts` | Y2 (one import line) | O13 does not edit it |

Files with one owner (no matrix row needed): `business/frontier-waves.ts` (O13), `investments.ts` (N4, two lines at the end), `history/events.ts` and `history/markets.ts` (B5), `events/era-life.ts` and `events.ts` (B3), `data/brands.ts` and `locales.ts` (B4), `world/paper.ts` and `news/*` (Paper), `text/topics.ts`, `compose.ts`, `dialogue-lines.ts` (composer), `cash.ts`, `npc-state.ts`, `society/seam.ts`, `acts.ts` (O11), `hubs/people-facts.ts` and `PersonProfile.tsx` (O8), `LifeLog.tsx` (N9), `Header.tsx` (N8), `test/anachronism.test.ts` (B9), `test/kit-pace.test.ts` (O10), `test/social-money-scan.test.ts` (O11), `test/world-social.test.ts` (O1).

### 2.2 Files R6 will also edit (so R6 can plan against them)

| File or directory | R5 tasks | What R6 must know |
|---|---|---|
| `src/game/special.ts` (rows `:80-130`), `src/game/menus.ts`, `src/game/types.ts` (`MenuGroup.needs`) | B7 | After B7 each career's yearly hook is `careerActive(g, name) && readPack('career.<name>')...` and its menu row is a stub group with `needs`. R6's new careers are lazy domains by that contract, or the owner raises the allowance (OQ2). If B7 is dropped (G5) R6 does B7 as its task zero unchanged. |
| `special/kit/*`, `special/athlete.ts`, `author*`, `gamedev*` | none (B7 edits only the importers listed in its plan: `cv.ts`, `computer/dev-cv.ts`, `business/gamestudio*.ts`, `shops/luxury-pamper.ts`, `business/hedge-model.ts`) | Kit v2 keeps working; the influencer career (`special/social`) stays eager. |
| `special/model*.ts`, `actor*.ts`, `astronaut*.ts` | Y5, Y6 (new leaves `model-base`, `actor-profile`, `astronaut-base`; ports `special.modelInjuryOdds`, `special.astronautFlyOn`) | Every old export path stays valid by re-export; new code imports from the leaf, never from the facade, or the cycle returns (the zero rule fails the PR). |
| `src/game/careers.ts`, `business/staff.ts`, `dynasty-ownership.ts` | none | R6 D.6 may edit them. `staff.ts` and `dynasty-ownership.ts` left the business cycle with no edit (Cycles plan). The composer's owners test (`test/persona-owners.test.ts`, O7) scans for writers of `integrity:` (`business/career.ts:89`, `board.ts:276`, `nepo-succession.ts:48,91`) and `trait:` (`board-ceo.ts:425,470`, `deeptech-found.ts:70`, `staff.ts:73`); R6 D.6, which moves both onto axes, updates that test in the same commit. |
| `src/game/text/*` | O2 (`topics.ts`), O3 (`compose.ts`), O4 (`dialogue-lines.ts`), O6 (`state-table.ts`, 8 rows), O9, O11, O12 (`pools.ts`, 3 named pools) | `CALLBACK_PHRASE` needs a row for every `MEMORY_KINDS` entry (the test fails the day a kind is appended without one); topic ids 100 to 409 are append-only; `defineLines` only under `text/`; 17 pace families were left after R4 and the composer uses 3, so R6 has 14; the text memory keeps 160 families and 300 pools. |
| `src/game/society/*`, `world/social.ts`, `world/rep.ts` | O1 to O12 | `SocialShard.ft` bits 1, 2, 4 are taken; bit 8 is free (the Paper does not use it). `rep` has five groups; `ind.<id>` rows are reserved for R6 and R9; `repOdds(g, group)` is the call for CV screening. `society.acts` steps are appended in the written order. |
| `src/game/modules/index.ts`, `kernel/registry.ts` phases | N2 (`news.desk`, phase `news`, order 10), O13 | the `news` phase is no longer empty; it holds the desk. |
| Pack contract (`kernel/packs.ts`, `data/pack-needs.ts`, `pack-loaders.ts`, shims) | B1 to B7 | Adding a pack is four edits (B1 plan, "Adding a pack"); a new file reads no pack at module load (B1's sweep fails it). |
| `ui/store.ts` | B2 | Any new action that changes the year or loads a life goes through `whenPacksReady`. |
| Fixtures and baselines | N11 re-records once; B11 sets the bundle baseline | R6 re-records again at its own flip; the allowance is 30,000 from B11 (OQ2). |
| `test/ceiling-list.json` | 14 new rows | each row cost under 2 s at 1000 times (P5) |
| `flags.ts` | P3 (four keys) | R6 adds keys through its own lead task. |

## 3. Interfaces to freeze

### 3.1 The exact names, who creates each, and when it freezes

"Freezes" is the wave of the creating task; an interface that moves after its freeze makes the tasks that read it rework (the R4 lesson). The wave is the earliest merge; a name is frozen when its task merges.

| Names | Created by | Freezes (wave) | Read by |
|---|---|---|---|
| `PackId` union (append-only), `PACK_IDS`, `PackNotLoaded`, `PackState`, `definePack`, `installPack`, `packReady`, `readPack`, `loadPack`, `ensurePacks`, `packStatus`, `onPackInstalled` (8 listeners), `resetPacksForTest` (`kernel/packs.ts`) | B1 | 2 | B2 to B5, B7; the Paper catches `PackNotLoaded`; R6 packs |
| `PACK_LOOKAHEAD_YEARS` (1), `PACK_PREFETCH_YEARS` (5), `BASE_PACKS`, `erasForYears`, `packsFor`, `packsForNewLife`, `PACK_LOADERS`, `registerPackLoaders`, `preloadAllPacks`; shim `<name>-source.ts` (production body `export {}`, vitest alias to `test/pack-eager/<name>.ts`) | B1 | 2 | B2 to B7; every node entry that plays lives |
| `AppState.packWait`, `PackWait`, `whenPacksReady`, `retryPackWait`, `warmPacks`; `resumeSavedGame`, `startNewLife`, `continueAs`, `ageUpAction`, `travelBack` keep their signatures | B2 | 3 | UI; N8 |
| `scripts/bundle-baseline.json` optional `initialMaxGzBytes`, `packMaxGzBytes` (any lazy chunk by name prefix, C7) | B6 | 5 | B11, P1 |
| `GATE_FLAGS`, `gateCounts`, `compareGate`, `shrinkGate`, `rebaseGate`, `test/voice-gate-baseline.json {v:1, files}`; `eraFindings`, `test/era-gate-baseline.json`; `buildCorpusOnce`; `UPDATE_VOICE_BASELINE=1\|rebase`; `npm run voice:gate` | B8, B9, B10 | 1, 2, 3 | every text task |
| `FLAG_DEFS` keys `paper`, `composer`, `standing`, `tips` (all `{default:false, ships:'5.4.0'}`) | P3 | 2 | N1, N7, N8, O1 |
| New modules `business/heavy-state`, `product-hash`; `special/model-base`, `actor-profile`, `astronaut-base`; `house-value`; `earmarkedCash` in `gamestudio-state`; `movableCash`, `treasuryOf` in `group-treasury`; nine ports `business.advanceResearch`, `heavyArrivals`, `advanceHeavy`, `advanceLab`, `simulateFinance`, `special.modelInjuryOdds`, `special.astronautFlyOn`, `computer.stockBetsMenu`, `underworld.arrestPlayer`; every old export path kept by re-export | Y2 to Y7 (names frozen in the Cycles plan 2.1, 2.2) | 2 to 3 | all tracks (unchanged paths) |
| `FEATURE_BITS {talk:1, standing:2, tips:4}`, `stampFeatures`, `featureOn`, `SocialShard.ft`, `.rep`, `RepRecord`, `REP_GROUPS`, `normalizeRep`, `repProblems`, `TALK_CAPS`, `REP_CAPS`, `TIPS_CAPS` | O1 | 5 | O2 to O13 |
| Topic ids kid 100-111, gen 200-229, spicy 300-305, adult 400-409; `Topic`, `topicTexts`, `topicById`, `topicIdOf`; `Edge.d` and `Edge.n` written only by `noteTalk`; callback token `${kind}.${year}` | O2 | 6 | O5 |
| `composeTalk`, `speakerVoice`, `Mood`, `PartId`, `TalkIn` | O3 | 5 | O4, O5 |
| `perceivedAxes`, `READ_FX` | O6 | 6 | O5, O8 |
| `NUDGE_SITES`, `feelAct`, `GUILT`, `axesOfStaff`, `axesOfManager` | O7 | 8 | R6 D.6 |
| `readRep`, `repOf`, `repWord`, `repOdds`, `groupOfPerson`, `noteRep`; `memoryOdds` keeps its signature and its 0.15 clamp | O8 | 7 | O9, O11, O12; R6, R7, R9 |
| `TipRow`, `TipKind`, `openTip`, `closeTip`, `onAnswer`, `popupOne`, `tipsYear`, `tipsMenu`, flag `tips`, `TIP_FAMILIES` (`pop.ask.endorse`, `.media`, `.scandal`) | O10 | 6 | O9, O11, O12 (they start only after it) |
| `moveIncome` (`cash.ts`), `storeNpcCompany` (`npc-state.ts`), `offersYear`, `ENDORSE`, `EXPOSE_TERMS`, luck ids `offer.make`, `offer.fee`, `scandal.press`, `scandal.delay`, `expose.deny`, `expose.sue` on stream `social` | O11, O12 | 9 | O14 |
| Fact kinds `tech.landed`, `tech.rival`, `tech.disclosed` (O13), `social.scandal` (O9), `offer.paid` (O11) | O13, O9, O11 | 6 to 9 | Paper `NOT_NEWS` (N1) |
| F1: `SECTIONS`, `NEWS_KINDS` (53), `NOT_NEWS`, `StoryRow`, `Edition`, `ArchiveRow`, `storyKey`, `normalizeStoryRow`, `weightOf`, `scoreOf`, `SCORE_MAX`, `DETECT_MAX`, `Candidate`, `EconSnap`, `collapse`, `PAPER_CAPS`, `PaperShard`, shard name `paper`, `readPaper`, `ensurePaper`, `patchPaper`, `paperProblems` | N1 | 5 | N2 to N10; later releases append rows |
| F2: `EditionCtx`, `composeEdition`, `liveEdition`, `newsModule` (id `news.desk`, layer 4, slice `world.paper`, phase `news` order 10 added by N11), `yearlyNews` (step list append-only), `scheduledAhead`, `registerSchedule`, `fameTier`, `STORY_TIERS`, `stampPaper` (N7) | N2, N7 | 6 | N3 to N10; R9 fairs |
| F3: `OutletClass`, `Outlet`, `rosterFor`, `BIAS_MAX`, `shownFigure`, `RenderCtx`, `renderStory`, the template cell shape, `paperView`, `PaperView`, `PaperLazy`, `PAPER_ZONE` | N6 (view in N8) | 7 | N8, N9, N10 |
| The desk's 38 fact kinds (`econ.*`, `world.*`, `market.*`, `tech.wave`, `tech.breakthrough`, `rival.*`, `you.*`, `rumor.*`); `hist.*` are table rows and never emitted | N2 to N7 | 6 to 7 | N10 |
| Fourteen ceiling ids: `talk-memory`, `persona-read`, `guilt-year`, `rep-bounds`, `standing-odds`, `scandal-cost`, `tips-caps`, `endorse-fee`, `news-detect`, `news-score`, `news-edition`, `news-bias`, `news-fame`, `news-bytes` | O2, O6, O7, O8, O10, O11, O12, N10 | 6 to 10 | `ceiling-list.test.ts` |
| No new stream tag, no new money reason (64 of 80 used), no new `defineLines` outside `text/` | all | - | `stream-tap.ts`, the reasons table |

### 3.2 Conflicts found and how each is settled

| # | Conflict | Resolution |
|---|---|---|
| C1 | Paper N1 adds the key `paper` and edits `test/flags.test.ts` (eleven to twelve keys); composer O1 adds three keys and edits the same line (eleven to fourteen). Two edits of one closed list. | The lead task P3 adds all four (fifteen keys) in one commit before either track; N1 and O1 need P3 and drop both edits. |
| C2 | The composer reserves bit 8 of `social.ft` "for the Paper (its own bit and key)"; the Paper stamps `fx` in its own `paper` shard and never reads `ft`. | The Paper keeps `paper.fx`; bit 8 stays unused and is free for R6. Both plans edited. |
| C3 | Paper N11 flips and re-records; composer O14 also sets three defaults, bumps nothing and re-records five fixtures. Two flips in one release re-record `golden-digests.json` twice. | One flip: N11 (lead) for all four keys, the version and the re-record, with the composer's list and reasons handed over by O14. O14 re-records nothing. |
| C4 | The Paper's `news-kinds.test.ts` fails on a kind declared by a module without a row; the composer declares five new kinds. | N1 starts `NOT_NEWS` with `offer.paid`, `social.scandal`, `tech.disclosed`, `tech.landed`, `tech.rival`; the test checks one way, so N1 merges before O9, O11, O13. The Paper has its own `tech.wave` and `tech.breakthrough`, so `tech.*` from the leaf would double the story. |
| C5 | Bundle B5 waits for "the Paper's first merge of `history/events.ts`"; the Paper edits no file of `history/`. | The edge is removed (bundle.md edited). B5 may go any time after B2. |
| C6 | Headroom: 5,999 bytes under the allowance; B1 and B2 take about 3,000 to 4,000; N1 alone adds about 2,500; the Paper and composer add up to 42,000 and the diet takes 485,000 out only from B3. And the "certain" ceiling 2,560,000 is the Bundle track alone, below the integrated head (about 2,581,500). | G1: no other track's eager source merges before B3. B6 writes `initialMaxGzBytes` 2,600,000, B11 re-sets it to the measured head plus 30,000. |
| C7 | B6's per-pack ceilings apply to chunks whose name contains `-pack`; the Paper asked for a row for its `PaperSheet` chunk. | The ceilings apply to any lazy chunk by name prefix; B11 writes the `PaperSheet` row (26,000). |
| C8 | Cycles says it runs last, after every other track. The grep of the other three plans shows no shared file (section 9 row 24) except import lines in `business/gamestudio*.ts` (B7). | Y1 needs nothing; Y3 needs P4; Y8 merges before N11. The track fills the second slot early. |
| C9 | Y1's `cycle-closure` pins the exact count (544 scripts) and digest of registered scripts; O10 adds the script `tips.answer` and others may follow. | Superset check: every recorded id must still be registered; new ids are printed, not failed. |
| C10 | O13 emits `tech.*` facts from `pushFromWave` and `pushResearch` for every life; the facts recorder writes `g.world.facts`, so the `world` slice of the golden digests moves before the flip for any life that pushes research or a wave. The plan says "Fixtures: none". | O13 emits only when `featureOn(g, 'tips')`; it needs O1; its test proves a life without the bit has the same `world` JSON as on the base commit. |
| C11 | B9 judges an untagged literal in a new file at 1900; the Paper's outlet names and template cells hold words in `ERA_RULES` (crypto, online, radio, TV, nuclear, airline). The Paper cannot import `events/era.ts` (`eraStrip`) without a new L3 domain pair `news -> events`. | Era-ruled cells and names carry the `@` tag and the renderer strips it with its own one-line regex; a `paper-text` case fails an untagged ruled word. |
| C12 | `test/bundle-budget.test.ts:365-366` pins the baseline keys as the exact list of three and `:372` pins `allowGrowthBytes` to 60,000. B6 adds two keys; B11 lowers the allowance. Neither plan listed the pins. | Both are deliberate edits with a `moved-tests.md` row: B6 (five keys) and B11 (30,000, reason in a comment, plain hyphens). |
| C13 | O14 says the 120-year acceptance is "`ci: deep` in the nightly"; no such marker exists. The nightly sizes come from `nightlySizes` in `scripts/nightly-lib.mjs`, a matrix in `nightly.yml` and `test/nightly-workflow.test.ts`. | The years come from an environment variable (default 20, read as `old-saves.test.ts:38` reads its own); O14 adds the `deep` matrix row, the size and the YAML pin together. |
| C14 | The world budget's `capsOf` has a `case 'social'` with one row (`pairs`); the composer adds `rep` to that shard and lists no edit of `budget.ts`. | O1 adds a second row `rep rows` against `REP_CAPS.rows`; P2 measures the maximal world with it. |
| C15 | O13 adds a module that registers at load; the repo convention (hub-entry) is one `HUBS` row per such module. | O13 adds `modules/waves-facts` to `HUBS`. |
| C16 | B8 and B9 were planned to merge sixth and seventh. New text from the Paper and composer written before that would sit in the baseline as grandfathered debt. | B8, B9, B10 merge in the first three waves; N5, O4, O6 need B8 and B9. |
| C17 | N3's test asserts a golden count "mean 5.9, max 12" over six probe lives; seeds must come from `findSeed`, and different seeds give other counts. | Assert mean at most 8 and maximum at most `DETECT_MAX`; print the measured figures. |
| C18 | `docs/RELEASE-v5.4.0.md` is written by B11, Y8, N11 and P6 and does not exist. | P4 creates the skeleton; each fills its heading. |
| C19 | The Paper reads the facts store (400 rows, 12 a kind-year); the composer's leaf can add up to 36 `tech.*` rows a year, the desk 16, R4 life 8. | No cap is raised: the Paper reads only the current year and seals the next, and the composer's tip reads this year or last. Worst case about 60 rows a year keeps 6 years, enough for both. |
| C20 | 14 new ceiling rows join a file that takes 61 s in CI (123 s measured here under load), with a 60 s per-row timeout in a pull request and 300 s in the nightly. | Row cost rule (P5): each new row at most 2 s at 1000 times; each task prints its measured seconds. |
| C21 | Y4, Y5, Y6, Y7 grow `EXPECTED_PORTS` (`toContain`) and `PORTS` (`toEqual`) to 15; B7 may add ports of its own. | The final list is 15 plus B7's names, sorted; the second task to merge inserts its names; Y8 asserts the whole list. |

### 3.3 Frozen tables the lead reads before merge

The lead reads the printed tables in the hand-off of: O4 (the 215 voice lines), O8 (`MEMORY_REP`, `READ_FX` of O6), O12 (`EXPOSE_TERMS`), O11 (`ENDORSE` constants), N6 (the 189 headline cells: the 1969, 2008 and 2020 editions read in full), N3 (the threshold table of the Paper plan with its measured counts), N7 (`STORY_TIERS`, fame caps) and B6 (the ceilings table). Each is a data table; a wrong value is cheap to fix before merge and expensive after the flip (the R4 X57 rule).

## 4. Platform tasks (the lead owns these)

None has a planner. Each blocks the tasks named. Commits use explicit pathspecs and the attribution lines the session gives. Sizes are source and test lines.

**P1. Bundle baseline re-measured, the ceilings table, gate G1.** 0 and 0. Deps: none. Blocks B1.
Build the clean tree (`npx vite build --outDir <scratch> --emptyOutDir`, then `node scripts/bundle-budget.mjs --dist <scratch>`) and record in the commit message and in the RELEASE skeleton what the cross-check read from the Bundle planner's build with the same script: initial JS 3,005,319 (8 files), CSS 17,780, total **3,023,099**, baseline 2,969,098, delta +54,001 of +60,000, so **5,999 bytes of room**. The cost of a source line is 4.06 gzip bytes (RELEASE-v5.3.0.md:112-115), the figure used below (a model, UNVERIFIED for R5 code). `scripts/bundle-baseline.json` is not touched until B6 and B11. P1 also writes gate G1 into the process rules and the table of what each stage must measure, in gzip bytes (the unit; raw MB is reported but never gated):

| Stage | Initial total, expected | What the repo checks | Written by |
|---|---|---|---|
| v5.3.0 head | 3,023,099 | baseline 2,969,098 + 60,000 = 3,029,098 | - |
| after B1 and B2 | about 3,026,000 (about 370 + 400 eager lines; UNVERIFIED) | same; 2,000 to 3,000 bytes (500 to 700 lines) left | - |
| after B3 (CP1) | about 2,815,000 (-213,000 plus the gate) | same | - |
| stage 1, B3 to B5, Bundle track alone | about 2,538,000 | same | - |
| B6 merged | at most 2,600,000 | `initialMaxGzBytes` 2,600,000, plus `packMaxGzBytes` rows for the packs then present | B6 |
| Paper, composer, cycles added | +13,000, +29,000 and +1,500 at most; each task prints its delta in the merge commit | the ceiling above | N, O, Y tasks |
| integrated head, no B7 | about 2,581,500 (-14.6%) | at most 2,600,000 | - |
| integrated head, with B7 | about 2,254,800 (-25.4%) | - | - |
| B11 (release head) | measured | baseline = measured, `allowGrowthBytes` 30,000, `initialMaxGzBytes` = measured + 30,000 rounded up to 5,000, `packMaxGzBytes` = 1.25 x measured for each pack and 26,000 for `PaperSheet` | B11 |

Stop rule: if at CP2 the head is above 2,600,000 without B7, the lead stops dispatching and chooses a lever (the composer's O4 tables as a pack is the stated one) before the next merge. R6 note: 30,000 bytes is about 7,400 lines at 4.06; R6 plans 23,200 lines (about 94,000 bytes), so its careers must be lazy domains by B7's contract or the owner raises the allowance (OQ2).

**P2. World budget for R5, measured.** 0 and 40. Deps: N1, O1.
R4 measured the maximal world (every list at its cap, `met` and `edges` included) at **45,600 nodes and 443,000 bytes** (`world/budget.ts:21-26`). R5 adds: the Paper shard 1,924 nodes and at most 30,000 bytes (N1 arithmetic: 3 editions x 277 + 30 archive rows x 36 + 13), `rep` about 55 nodes (12 rows), `ft` 1; `Edge.d` and `Edge.n` sit inside R4's `edges` caps. Sum **about 47,580 nodes and 475,000 bytes** against `WORLD_BUDGET` 55,000 and 800,000, `WORLD_NODE_CAP` 80,000 and the R5 allotment of 6,000 (33% used). The budget rule is "the larger of the starting numbers and the measurement plus 15%", so the starting numbers stand while the measurement stays under 47,826 nodes and 695,652 bytes. P2 extends the maximal-world builder in `test/world-budget.test.ts` with `rep` at its caps (N1 added `paper`), pins the new total, and runs `test/world-budget.test.ts test/world-state.test.ts test/save-world-adapter.test.ts test/world-repair.test.ts`. Above the trigger it raises the budget to measurement plus 15% in `world/budget.ts` with the arithmetic in the comment and moves the pin with a row in `moved-tests.md`; the cap and the allotment do not change in R5. `paper` stays in the middle drop class (`WORLD_DROP_FIRST` and `WORLD_KEEP_LAST` unchanged, `test/world-state.test.ts:233`).

**P3. Flag keys.** 12 and 20. Deps: P4. Blocks N1, O1.
`FLAG_DEFS` (`flags.ts:27-60`, eleven keys now, closed list that only the lead edits) gains `paper`, `composer`, `standing`, `tips`, each `{ default: false, ships: '5.4.0' }`, and `test/flags.test.ts:88-98` goes from eleven keys to fifteen, once for all R5 (the `releaseRuleProblems` check holds at package 5.3.0). Comments follow the header rule of `flags.ts`: `composer`, `standing` and `tips` change simulation output, so they are stamped into the save at life creation (`social.ft`, O1) and never read at run time; `paper` is stamped as `paper.fx` for its fame effect (N7) and read at the place of use for the door (N8). Bundle and Cycles get no key: they are structural and proved by parity (W3). The flip is N11: the four defaults go true in the same commit as `package.json` 5.4.0. A rehearsal or a walk before then uses `?flags=paper,composer,standing,tips` (`startingOverrides`) and **starts a new life after the page loads**, because the stamp is written at creation.

**P4. `moved-tests.md`, the re-record protocol, the release skeleton.** 0 and 0. Deps: none. Blocks P3, B3, B9, Y3.
Creates `docs/superpowers/plans/2026-10-31-r5-v5.4.0/moved-tests.md` with a heading per track (bundle, cycles, paper, composer, platform), the row format of R4's file (file and test, task, before, after, why the new rule makes the old value wrong), and the protocol: (1) no task re-records a fixture; N11 does, once, each with a reason of 20 to 200 characters, one line, at least four words, no long dash, floats cut to 9 significant digits, Node 22; (2) a deliberate edit of an existing test, pin or ratchet number is a row in the same commit; (3) JSON baselines (`layers`, `architecture`, `voice-gate`, `era-gate`, `bundle-baseline`) are regenerated by their commands after each merge and never merged by hand; (4) a pin is never changed to make a change pass; (5) the expected rows of section 7.1 are copied in. Also creates `docs/RELEASE-v5.4.0.md` as a skeleton with one heading per track and per lead task (C18), and lists both files in the programme index (`docs/LIVING-WORLD.md`).

**P5. CI timing policy, checkpoints, nightly rows.** 0 and 0. Deps: none.
Today (`node scripts/ci-shard.mjs --plan 8` at `1c73b31`): 8 shards of 777 to 779 s of worker time, 82 or 83 files each, fast tier 124 files; limits in `ci.yml`: `checks` 20 min, fast tier 15, each shard 30, merge 15; nightly `deep` 45 min a row. The plans add about 75 test files and 22,630 test lines. Estimate (a model, UNVERIFIED until CP1): Bundle +150 s (the esbuild splitting parity runs, the sweep, ten careers over 60 years in B7), Cycles +55 s, Paper +200 s (six files play lives, none above 45 s), Composer +120 s, minus about 100 s when B9 cuts the lived anachronism test from 48 to 16 lives (`scripts/test-timings.json`: 157.2 s), net about +425 s, about +53 s a shard (+7%), so about 830 s of worker time, about 7 minutes at two workers. **The shard count stays at 8** (W24); if a shard passes 12 minutes of wall time at CP2 the lead raises it to 10 in one commit using R4-P4's edit list. Fast tier: about 40 new `// ci: fast` files at about 1.5 s add about 60 s. `checks` gains the 8 s voice-gate step (B10). Rules: (1) unknown files weigh 5 s (`DEFAULT_SECONDS`), so at CP2 the lead refreshes `scripts/test-timings.json` from the first green full run (B11 repeats it at the end); (2) `--verify 8` stays green; (3) **ceiling-row cost rule**: each of the 14 new rows costs at most 2 s at 1000 times and prints its measured seconds in its task; the light file takes 61.4 s in CI today (53 rows, 81 tests; 123 s measured on a loaded box here), has a 60 s per-row timeout in a pull request and 300 s in the nightly, so 14 rows add about 15 s; (4) the composer's 120-year acceptance is a nightly row (C13); (5) every new test that plays lives uses `findSeed`.

Checkpoints (full 8-shard CI on a push to `release/v5.4.0`, a GitHub run, so no agent slot): **CP1** after B3 (defaults; `vite build` and `bundle-budget` printed; the 30 store-driving test files pass unedited, which proves the synchronous fast path of B2; the B7 decision G5). **CP2** after wave 9 (feature freeze; the bundle against the table of P1; timings refresh). **CP3** after N10 and O14 (the rehearsal starts from this head). A red checkpoint stops dispatch until the lead has fixed or reverted the merge that broke it.

**The rehearsal and the walk (inside N11, lead).** A scratch branch `scratch/r5-rehearsal` cut from the CP3 head, pushed, never merged, deleted after N11. It carries the shape of the flip commit minus the re-record: `package.json` 5.4.0 and the four keys true in `FLAG_DEFS` (forced, not `setFlags`, because Node starts from the defaults). Steps: (1) `node scripts/golden.mjs check --plan all`, `test/r2-codemod-parity.test.ts`, `kernel-parity`, `social-parity-*`, heir parity and the `life-pins` rows: the list of what moves (the expected list is in section 7.2); (2) the three repetition gates one at a time, `quiet-acceptance` (worst life 7.32% of 8%), `text-kit` (4.7% of 5%), `text-repeat` (42 of 42): a miss is fixed at the source (a pool of eight lines, a state row, a longer gap), never a threshold; (3) the budget tests with desk and composer on: `save-perf` (age-up at most 160 ms, 200 ms with the encode, times the machine factor), `save-budget`, `world2-performance`, `world-budget`; (4) `scripts/fuzz-engine.ts` bundled as `nightly.yml` does, 8 seeds, 160 years, `--heirs 1 --fork`, then `--heirs 2`; (5) `scripts/nightly-probes.ts` balance and ceiling, one shard each; (6) a `workflow_dispatch` of `nightly.yml` on the scratch branch at `scale=full` (ceilings at four scales, old saves 20 years, text, deep golden, anachronism 400 lives, the composer row); (7) the 200-seed before and after percentile probe (net worth at 25, 40, 60, 80 and final; fame percentiles, since endorsements add taxable income and stories add fame): printed for the owner. The walk is on the preview (`preview.yml`) at 360 px and 320 px with the four keys on and a NEW life: the Paper door and dot, the 1969, 2008 and 2020 editions, the outlet switch, a state outlet, the log chip, an heir; talks that remember; Tips and Offers with an offer accepted and a reporter at the door; the profile standing words; Home, Continue after a reload; `scripts/e2e-play.mjs --drop-pack era.1980` (the failure card, Try again, Reload); offline after the first load; the Time Machine into a dropped era. The walk decides whether the header keeps a fourth icon (W17) and whether `social.scandal` is promoted (W5).

**P6. Release.** 60 and 10. Deps: B11.
`docs/RELEASE-v5.4.0.md` finished: what the player sees; that only NEW lives get the composer, standing, tips and the Paper's fame effect, while every life gets editions and the door (W21); the four keys; caps and nodes with the P2 figures; the bundle before and after in gzip and raw, which stage shipped and what 35% would still need; known limits (currency and unemployment thresholds never fire after 2026; editions of 8 to 12 stories in procedural years; offers are rare; talk memory is scarce in large casts; the owner decisions OQ1 to OQ5). The v5.4.0 save fixture `test/fixtures/save-v5.4.0-featured.json.gz` from a new mode `featured` of `scripts/save-fixtures.ts` (a life created with all four keys on, after one hand-over, with a sealed edition, a tip, a `rep` record and a dialogue edge; bundled in the release tree, since it imports modules that exist only from v5.4.0; recorded twice, byte-identical, under Node 22), the paragraph in `docs/SAVE.md` ("One fixture per release") and one line in `test/save-v3-schema.test.ts`. The roadmap R5 block gets the built figures (sizes, nodes, bundle) and the R6 inputs. One full CI run on the release head, then **STOP at a green PR**: merge and tag only after the owner's explicit OK.

## 5. Decisions

These answer every open question of the four plans (Bundle Q1 to Q10, Cycles Q1 to Q6, Paper Q1 to Q14, Composer Q1 to Q13) and every conflict of 3.2. They override the plans. Each lists the options, the default taken, and who may change it. Everything proceeds on its default unless it appears in the Owner questions below.

**W1. Bundle headroom.** Options: (a) gate G1, other tracks' eager source waits for B3; (b) raise the allowance now. Default (a): the Bundle chain B1 to B3 is three waves, and the second slot has work (B8, B9, B10, the Cycles lane, the lead tasks). Lead; (b) needs the owner (OQ5).
**W2. One flip.** N11 for the whole release; O14 and N10 re-record nothing. Lead.
**W3. Keys.** Four keys (P3). No key for Bundle (the packs are the point of the diet and a flag cannot keep the old graph) or Cycles (behaviour-neutral, proved by parity). Lead.
**W4. Stamps.** `social.ft` bits for the composer, `paper.fx` for the Paper, bit 8 unused. Lead.
**W5. `NOT_NEWS`.** The Paper does not headline the five composer kinds in 5.4.0. Option: promote `social.scandal` (one row, three cells) if the walk shows the scandal loop reads thin without the Paper. Default: not promoted. Lead at the walk.
**W6. Cycles to zero.** Default: all of Y1 to Y8; Y5, Y6, Y7 are independent and can be dropped one at a time if the lead needs time (the ratchet then keeps their cycles, and Y8 asserts only what is left). Lead; owner if the roadmap line "cycle baseline shrinks to the modules still pending" should read zero.
**W7. Cycles timing.** Starts at wave 1, merges before N11 (C8). Lead.
**W8. B7, careers lazy in R5.** Default: build it, last in the Bundle lane, before N11, so R6 builds on the lazy contract (-340,700 gzip bytes planned, 14,000 added). Decided at CP1 (G5); dropping it moves it to R6 as task zero. Lead; the owner if the R6 order changes.
**W9. Markets half of B5.** 21,200 bytes (0.7%). Default: keep; drop first if B5 runs long. Lead.
**W10. Bundle target.** Restate the roadmap's "5.5 MB raw, 35% smaller" as gzip ceilings (OQ1). Owner.
**W11. Allowance after the diet.** B11 sets 30,000 (R4 preflight); R6 uses lazy domains or asks (OQ2). Owner.
**W12. Absolute ceiling numbers.** 2,600,000 at B6 (integrated, no B7), measured + 30,000 at B11. Lead.
**W13. Voice gate flags.** Ratchets: `over-cap`, `long`, `em-dash`, `chatbot`, `disclaimer`, `label-words`, `no-contraction`; `over-aim` and the style flags stay report-only. Lead; the owner owns `docs/VOICE.md`.
**W14. Lived anachronism test.** 48 lives to 16 in a pull request, 400 nightly; the detector, vocabulary and political blocks stay. The composer's composed text is covered by tagged lines in `dialogue-lines.ts` (static) and by the lived lives. Lead; owner if the nightly misses a case.
**W15. Text gates merge first.** B8, B9, B10 before N5, O4, O6; baselines shrink only; `UPDATE_VOICE_BASELINE=rebase` is the lead's tool for a train that merged text while a gate branch was open. Lead.
**W16. D18, D19, D20 as they apply.** **D19** (roadmap default, owner yes): fictional outlets only; scheduled events appear and outcomes never: the Games table, one year ahead, calendar only, no result field, fairs through `registerSchedule` in R9 (Paper Q10); the Paper test asserts the item has no result field. **D18**: weight 0 to 1 outcomes log-only, bad-tone, health, legal and large-money notices stay modal: the composer's two notice titles ('Story Ran', 'Reporter Calling') get `NOTICE_WEIGHTS` rows, the tips popup is a non-deferrable choice (the year close keeps it first), the Paper queues no notice or popup (N10 proves it). **D20** (digest placement: the last popup for 10 years, then an inline card) is not touched: the Paper's door is a header button and a log chip, not a digest.
**W17. The Paper's door.** Header button with an unread dot plus a "Read" chip on the log's newspaper line, flag `paper`; fallback if 360 px crowds the header: a row in the inbox sheet. The walk decides. Lead.
**W18. Edition size.** 33 is a cap, not a promise; no filler stories (OQ3). Owner.
**W19. Paper effect on fame.** On, behind `paper.fx`, at most +2 fame and +2 notoriety a year, new lives only (OQ4). Owner.
**W20. Offers pay only from a real NPC firm** (acceptance line), so they are rare; frequency printed, not asserted (OQ4). Owner.
**W21. Old lives.** A v5.2.0 or v5.3.0 save, an unstamped life and the heirs of one: no composed talk, no standing, no Tips and Offers, no Paper fame effect, no disclosure facts. They do get editions (the desk runs for every life from N11) and the door; the first age-up after the upgrade fills `world.paper` and `world.facts` (at most 1,924 nodes, far from the 500,000-node save cap). Lead; the owner reads it in the release notes.
**W22. Opus.** Four marks: B7, N2, O8, Y4. One Opus session at a time across all tracks, only after Sonnet failed the task once. Queue order if two fail together: O8, N2, B7, Y4 (critical chain first). Lead.
**W23. Seeds.** Every seeded test uses `findSeed(pred)`; `test/seed-pins.test.ts` must see no new `seed: N` line. The Paper's probe counts are printed, not asserted (C17). Lead.
**W24. CI.** 8 shards (P5). Lead.
**W25. Moved-test rows.** In `moved-tests.md` under each track's heading (Cycles Q6 settled). Lead.
**W26. The save fixture.** One new file, `save-v5.4.0-featured.json.gz`, built in the release tree (P6). Lead.
**W27. Test volume.** The plans total 22,630 test lines against the roadmap's 18,252 (+24%), mostly the Paper (8,050) and the composer (7,050). Accepted: CI cost is +7% a shard (P5). Lead.

### Owner questions

These are the few that need the owner. Each has a default and the build proceeds on it; the owner may change any of them at the STOP at a green PR, and OQ1 and OQ2 should be answered before the release notes are written.

- **OQ1. Bundle acceptance line.** The roadmap says "initial bundle at most 5.5 MB (from 8.3)" and "a first download 35% smaller". Measured: the data packs give -16% gzip (-18% raw, 7.26 MB), the careers lazy -27% (6.30 MB), deep tech -30% (6.04 MB); 5.5 MB needs luxury shops and the computer domain too (5.58 MB raw, 25 outside importers), which no plan covers. On the integrated tree, with the Paper and composer on top, the head is -14.6% without B7 and -25.4% with it. Default: replace the line by gzip ceilings (2,600,000 at B6; about 2,285,000 after B11 with B7) and record the shortfall in the release notes. Should R6 carry the rest (luxury shops, the computer domain) as lazy domains?
- **OQ2. The allowance after the diet.** 30,000 bytes (R4 preflight) against R6's about 94,000 at 4.06 bytes a line. Default: set 30,000 at B11; R6's careers are lazy domains (B7's contract) or R6 asks with its measured rate.
- **OQ3. What the Paper shows in procedural years.** An edition holds 20 to 25 stories in history and 8 to 12 after 2026, not 33; "currency minus 10%" and "unemployment plus 2 points" never fire after 2026 (0 of 49 years measured); housing minus 8% fires about 4 countries a year. Default: keep the roadmap thresholds, 33 stays the cap, no filler, no invented future currency story; the release notes say so.
- **OQ4. Game effects.** (a) Stories add up to +2 fame and +2 notoriety a year on new lives (Paper Q4); (b) offers come only from a real NPC firm, so a life with fame but no NPC firm sees none (composer Q5); (c) only lives created after v5.4.0 get the composer, standing and tips (W21). Default: all three as planned; the rehearsal prints the 200-seed percentiles for (a) and (b).
- **OQ5. Contingency only.** If B3 has not merged when only gated tasks remain to dispatch, may the lead raise `allowGrowthBytes` temporarily? Default: ask then; R4's approval of up to +120,000 was for R4 and is not assumed.

## 6. Acceptance map

The roadmap's R5 block (Acceptance, Probes, Exit gate, The player sees) with the Global Constraints that bind it. "Test" is the file or command that proves the line; the task owns it.

| Roadmap line | Task | Test or proof |
|---|---|---|
| Stories keyed `${year}:${kind}:${subject}` are idempotent | N2, N10 | `news-edition.test.ts` (compose twice, seal twice, same JSON and root identity), `news-desk.test.ts`, `paper-acceptance.test.ts` (replay, reload `roundTrip`, Time Machine fork give the same `world.paper`) |
| Outlets are fictional; tabloids round up at most 20% | N5 | `paper-outlets.test.ts` (denylist of real mastheads, no radio before 1920, TV before 1946, online before 1991), `paper-bias.test.ts` (ratio in [0.8, 1.2] over 1e-6 to 1e24 and every outlet and kind) |
| Rumours read current state only | N4, N10 | `paper-foresight.test.ts` (spies on `exchangeYear`, `cryptoYear`, `economyOf`, `exchangeRate`: no year above `g.year`; rumour cells hold no future tense), `foresight-scan.test.ts` |
| Offers pay only from a real NPC firm, an endorsement at most 2% of its marketing, through the ledger | O11, O14 | `offer-pay.test.ts`, `offer-gen.test.ts`, ceiling row `endorse-fee`, `checkLedger` clean after 40 lives of 60 years, `social-money-scan.test.ts` |
| 4 seeded lives to 90: repeated lines at most 5% (8% rich), shared 3-word openers at most 12% (20% rich), a popup family at most 6 a life with gaps of 4 or more, a person's last 8 topics distinct | O5, O14, N11 | `talk-compose.test.ts` (30 talks never repeat a topic in any window of 8), O5 prints the repeated share before and after and fails if it rises, `r5-composer-acceptance.test.ts` runs `text-kit`, `text-repeat`, `quiet-acceptance` with the keys on, rehearsal step 2 |
| Initial bundle at most 5.5 MB (from 8.3) | B3 to B7, B11 | `node scripts/bundle-budget.mjs`: gzip ceilings of P1; the raw MB are reported; OQ1 |
| A bundle-budget test replaces `chunkSizeWarningLimit: 8000` | B6 | `test/build-config.test.ts` (no `8000`, alias only under `test`), `test/bundle-budget.test.ts` (`initialMaxGzBytes`, `packMaxGzBytes`) |
| The cycle baseline shrinks to the modules still pending | Y2 to Y8 | `test/architecture-baseline.json` ends `{v:1, components:[]}`; `architecture.test.ts`, `layers.test.ts`, `kernel-acceptance.test.ts` assert zero |
| Probe: hook money capped | O11, O12, N10 | ceiling rows `endorse-fee` (at most 2% of marketing, a firm's yearly total at most 2%) and `scandal-cost` (at most 5 typical incomes an answer and a quarter of cash); `paper-isolation` shows the desk books no ledger flow |
| Probe: buzz capped | N7, O11 | ceiling row `news-fame` (fame and notoriety gains at most 2 and 2 a year from 1,000 stories); O11 fame at most +4 a year (`addHidden` limits). The showcase "buzz" of E.N7 (fairs) is R9, not R5; the Paper plan says so |
| Probe: no foresight in rumours | N4, O10, O11 | `paper-foresight.test.ts`; `tips` rows dated after `g.year` are dropped by their reader; a tip reads facts dated at most `g.year` |
| Probe: folding never hides a weight-3 item | N9 | `paper-view.test.ts` (random editions of 1 to 34 rows: no folded row has weight 3, a front-page, a `you.*` or a kin `life.*` row) |
| Probe: folding never hides a notice before a choice | N10, O10 | `paper-isolation.test.ts` (the desk queues no popup or notice: `g.queue` equal on and off); `tips-store.test.ts` saturated-year case (a tips popup only when fewer than 3 choices are queued; non-deferrable, so the year close keeps it first) |
| Exit gate: acceptance green | all | the CI gate at CP3 and on the release head |
| Exit gate: async data packs pass the Time Machine and test-preload checks | B2, B3, B11 | `packs-store.test.ts` (`travelBack` into an unloaded era loads first and on failure leaves the game, stops and save as they were), `pack-era-parity.test.ts` (a life through the real chunk boundary ends on the same digest as a preloaded life), `scripts-preload.test.ts`, the walk with `--drop-pack` |
| Player sees: a Paper with a front page and 33 stories an edition | N8, N9 | `paper-view.test.ts`, `paper-sheet.test.tsx`; the cap is 33 (OQ3) |
| ... outlets that lean | N5, N6 | `paper-bias.test.ts`, `paper-text.test.ts` |
| ... stories about you by fame (15, 35, 60, 85) | N7 | `news-player.test.ts` (tier table at 14, 15, 34, 35, 59, 60, 84, 85) |
| ... offers and exposes in "Tips and Offers" | O10 to O12 | `tips-menu.test.ts`, `expose.test.ts`, `expose-money.test.ts` |
| ... talks that remember | O2, O5 | `talk-memory.test.ts`, `talk-compose.test.ts`, `talk-parity.test.ts` (bit on against bit off: equal `g.rng`, `g.nextId`, relationships, queue kinds, cash) |
| ... gossip and reputation by group | O8, O9 | `standing-*.test.ts`, `scandal.test.ts` (gossip with hop cap 2 is R4's) |
| ... a first download 35% smaller | B3 to B7 | see OQ1 |

Global Constraints, one line each: **Saves** (optional bounded fields, schema 3, old saves play): N10 `paper-oldsaves.test.ts`, O14 (v5.2.0 and v5.3.0 fixtures play 5 years with every bit unset), B2 step 5 (`loadGame` with no pack), `save-v3-schema.test.ts` plus the P6 fixture. **Determinism** (no `g.rng` in a pure read; named streams; idempotent by a year stamp): `paper-isolation`, `talk-parity`, `cycle-parity`, `noDraw` cases, `rng` slice of the golden digests. **Money** (every dollar through the ledger with a named counterparty; no new `earnIncome`, `spend`, `addMoney` in a new file): `money-ratchet.test.ts`, `social-money-scan.test.ts`, `moveIncome`. **Foresight** (only `invest/instinct.ts` reads year+1): `foresight-scan.test.ts`. **Ceilings**: fourteen new rows at 1, 10, 100, 1000 times. **State**: section 4 P2. **Voice**: B8, B9, `voice-guards.test.ts`. **Models**: W22. **Commits**: process rule 8. **Seeds**: W23.

## 7. Seeded tests and fixtures that will move, and those that will not

### 7.1 Deliberate edits before the flip (each a row in `moved-tests.md`; none is a re-record)

| Test, pin or ratchet file | Task | Why |
|---|---|---|
| `test/flags.test.ts:88-98` (eleven keys) | P3 | fifteen keys; the only edit of this file |
| `test/save-world-adapter.test.ts:26` (sorted shard list) | N1 | the shard `paper` joins |
| `test/world-budget.test.ts` maximal-world builder (`:257-296`) and a total pin | N1 (paper at its caps, 1,924 nodes), P2 (`rep` at its caps) | the worst case grows by about 1,980 nodes |
| `test/hub-entry.test.ts` (`HUBS` from `:22`, `EXPECTED_PORTS` `:72`) | N2, O13, Y4 to Y7, B7 if it adds ports | one row per module that registers at load; six ports become 15 or more |
| `test/kernel-acceptance.test.ts` (`PORTS` `:17`, ceilings `:117-121`) | Y4 to Y7, Y8 | 15 port names; the cycle ceilings become empty lists |
| `test/architecture.test.ts` (baseline-file case), `test/layers.test.ts:557-560,598-616` | Y8 | they pin cycle counts that are now zero |
| `test/lab-hints.test.ts:7,506`, `lab-ops.test.ts:5,555`, `lab-patents.test.ts:6,769`, `lab-team.test.ts:5,310` | Y3 | the `boardAllows` spy follows the import to `business/board-vote`; assertions and call counts unchanged |
| `test/bundle-budget.test.ts:365-366` (three baseline keys), `:372` (`60_000`) | B6, B11 | five keys; 30,000 after the diet (C12) |
| `test/anachronism.test.ts:245` (`LIVES` 48) | B9 | 16 in a pull request, 400 nightly |
| `test/layers-baseline.json` (eager names `ERA_PACKS` and the brand and locale rows) | B3, B4 | shrink only, `UPDATE_LAYER_BASELINE=1` |
| `test/architecture-baseline.json` | Y2 to Y8 | shrinks to `{v:1, components:[]}` by `UPDATE_ARCH_BASELINE=1` |
| `test/ceiling-list.json`, `test/ceiling-kit.ts` | O2, O6, O7, O8, O10, O11, O12, N10 | fourteen rows |
| `test/lazy-zones.test.ts` | N8 | one PAPER zone |
| `test/kit-pace.test.ts:67` | O10 | the pace-family sum adds the three tip families |
| `test/social-money-scan.test.ts` (`NAMED` list) | O11 | the new society files |
| `test/world-social.test.ts` | O1 | `ft` and `rep` cases |
| `test/nightly-workflow.test.ts` | O14 | the YAML pin for the composer's deep row |
| `test/save-v3-schema.test.ts` | P6 | one line for the new fixture |
| `scripts/test-timings.json` | CP2, B11 | refreshed from a green run |
| New baselines `test/voice-gate-baseline.json`, `test/era-gate-baseline.json` | B8, B9 | created; then shrink only |

Unedited on purpose (they stay green with no edit, and a failure there means the task is wrong): the 30 test and kit files that drive the store (B2's synchronous fast path), the 10 files that read `EVENT_LIBRARY` and the 5 that read `ERA_PACKS` (B3's stable arrays), the 17 that read brands, 8 locales and 20 history events (B4, B5), `test/history.test.ts` news-line pins (the log line is unchanged), `test/world-state.test.ts:233` (paper stays in the middle drop class), `test/kernel-parity.test.ts` before N11, `relationship-parity.test.ts` and the scene-based `social-parity-love/wealth/will/nepo/heir/relationships` fixtures (no feature bit reaches them), `text-baseline*.json`, `flavor-golden.json`, `event-top60.json`, `latent-golden.json`, `effort-parity.json`, `notice-weight-table.test.ts`, every `save-v*.json.gz`, and `edge-odds.test.ts` unless its fixture builds a game with `ft` (O8 says so).

### 7.2 The flip task: the one place a recorded fixture moves

The flip task is **N11** (lead). It runs after N10, O14, Y8, B7, B10 and P2, on the CP3 head, after the rehearsal and the walk (section 4). It sets the four keys true with `package.json` 5.4.0 in one commit (`test/flags.test.ts` fails on either half) and adds the yearly entry of `news.desk` (phase `news`, order 10). Then `node scripts/golden.mjs check`, read which slices moved, `update --reason`, once per fixture, in three passes of the rehearsal so each move is attributed:

| Fixture | Paper-only pass (`paper` true) | Composer-only pass (three keys true) | Then |
|---|---|---|---|
| `golden-digests.json` | `world` on every life (facts and the shard); `character` only on a life that reaches fame 35 under `fx`. Any other slice moving (rng, people, assets, economy, flagsWorld, flagsPersonal, text) means the desk leaks into the simulation: **stop** | `text`, `world`, `character`, `rng`, `people`, `flagsPersonal`; `assets`, `economy` or `flagsWorld` moving is unexpected: **stop** and find why | re-record with the union, reason "the Paper and the composer are on for new lives: facts, shard, composed talk, standing" |
| `kernel-parity.json` | `aging` 44 to 45 (`news.desk`) | `menus` gains the Tips row under Activities > Fame and Media (group `n` +1 and its hash); `lives`, `views` should not move | re-record; B7 must leave every menu hash as it is |
| `r2-parity.json` | only where the check fails, only in `world` | text and menu trees of lives through `createNewLife` | re-record the failing rows with the reason |
| `social-parity-lives.json`, `social-parity-lives-deep.json` | `world` | stamped lives are now featured: text, world, rng, people | re-record |
| `life-pins.json`, `people-ui-exact.json` | no | only blocks that run through `createNewLife` or show the profile `rep` section | re-record where the check fails |

Scene-based oracles never move: `relationship-parity`, `social-parity-love/wealth/will/nepo/heir/relationships`, `text-baseline*.json`. A row moved by a task other than N11 stops that task (G3). Every old save fixture still loads and plays five years with all four keys on because none of the four reads a flag at run time (the stamps are read from the save).

### 7.3 How the thin text margins are protected

The margins are text-repeat 42 of 42, quiet-acceptance worst life 7.32% of 8%, text-kit 4.7% of 5%. No threshold moves in R5.

- **Bundle, Cycles and Paper add no log line, popup or `defineLines` pool.** The bundle's two loading strings are UI chrome (at most 120 characters, labels at most 5 words); the cycles move code only; the Paper writes no log line, no `notice`, no popup and no pool (its headline cells are plain arrays, never visible to `registeredLines()` or `text-hash.test.ts:185`), proved by `paper-isolation.test.ts` (3 lives x 25 years with and without the desk: the log, the popups and every slice but `world` are byte-equal).
- **Only the composer adds text.** It replaces the conversation log line and adds none: persona lines are state lines (a band change, or once in five years, three variants, `every: 5`, `gap: 5`), an offer logs only on accept (a nine-line pool), a decline nothing, a story logs at severity 3 and up from an eight-line pool, the two notice titles get `NOTICE_WEIGHTS` rows. Tips popups are at most one a year and only when fewer than three choices are queued.
- **Measure before and after.** O5 prints the repeated-line share on the four text-kit lives before and after and fails if it rises; the 12 composer pools are unnamed `pickLine` pools or `hpick`, so they take no slot of the 160-family text memory (3 named pools in all, from O9, O11, O12).
- **The three gates run with the keys on, one at a time, before the flip** (rehearsal step 2), and a miss is fixed at the source (more phrasings, a state row, a longer gap), never by a threshold.
- **Voice gates from the first wave** (W15): over-cap, long, em-dash, chatbot, disclaimer, label-words and no-contraction can only shrink; a new file with any count fails. This protects the margins from the Paper's and the composer's thousands of lines.

## 8. Top risks

1. **Hot files in the first three waves.** `ui/store.ts`, `vite.config.ts`, the pack tables and the baselines are touched by B1 to B3 while the Cycles and voice tasks merge beside them. Mitigation: B1 to B3 are one chain; the Cycles and voice tasks touch none of those files (matrix 2.1); JSON baselines are regenerated, never merged.
2. **Synchronous assumptions behind async packs.** A save that resumes on a year whose pack is unloaded, a Time Machine jump, an ageUp across an era edge, the Home screen's `loadGame()` at first render (`save.ts:94-95` reaches locales, brands and markets by static import and whether it reads them is unverified). Mitigation: the store seam is synchronous when ready (30 files unchanged), B1's sweep and B2 step 5 are the oracles, and the walk drops a pack on purpose. CP1 is the first whole-suite run.
3. **Load-order changes from the cycle cuts.** An edge that closed a cycle also forced early loading (the v4.0.0 failure was one edge). Mitigation: `cycle-closure` (superset of 544 script ids and 3 slices), 13 new `HUBS` rows, `cycle-parity`; a port is silent when unbound, so the two ports whose result is used throw. Y4 carries an Opus mark.
4. **Bundle headroom and the shortfall.** 5,999 bytes of room, G1, the integrated ceiling and OQ1. If B3 slips the second slot runs dry of mergeable work (OQ5).
5. **The composer's reach.** `memoryOdds` has four callers (will, wealth, ask weight, feud) and the extension moves odds for featured lives only; O8 carries an Opus mark. The text seam (`pickTopic`'s three `chance()` draws and every `randInt` of `conversation()`) is protected by a legacy twin test and a bit-on parity test, written first in O5.
6. **Text quality.** 189 Paper cells and 215 voice lines are hand-written; the static gates catch caps and tech words, not taste. The lead reads the 1969, 2008 and 2020 editions and the O4 tables (3.3).
7. **Layer and cycle ratchets on new code.** `news/` is a new L3 domain and may import only L0 to L2 (it may not import `events/era.ts`, `business/`, `invest/`, `nation/`); glue lives in `modules/` and `hubs/`. A violation fails `layers-domains.test.ts`. The composer's `world/firm-pay.ts` may not import `business/`.
8. **Test volume.** +24% over the roadmap; CI cost +7% a shard (P5), fast tier +60 s, 14 ceiling rows.
9. **The fame loop.** Endorsements (up to +4 a year) and stories (up to +2) feed fame, which feeds tiers and fees. Fame decays 1 to 3 a year (2 to 5 above 60, `special/fame.ts:1018`) and the fee is capped at 2% of a firm's marketing, so it cannot run away; the rehearsal prints the percentiles.
10. **Old saves and heirs.** The desk runs for every life after the flip, so a v5.3.0 save grows `world.paper` and `world.facts` on its first age-up; `paper-oldsaves.test.ts` and the composer's old-save case play the v4.0.2, v5.2.0 and v5.3.0 fixtures five years. Heirs keep editions and `fx`; their parent's stories read in the parent's name.
11. **Four Opus marks, one session at a time** (W22): a queue, not a risk to quality, but it can idle a slot.
12. **The flip is one commit for four keys.** If the walk finds a defect in one feature, the lead ships it dark (the other three keys true, that key false) with the same version; each key is independent by construction (W3, W4).

## 9. Plan against code: the claims checked now

Run in `/home/user/snag` at `1c73b31` on `release/v5.4.0` by the cross-check. "Scratch" is `/tmp/claude-0/-home-user-snag/6c431472-dc02-517c-872c-436596f3a0de/scratchpad`.

| # | Claim | Evidence | Command |
|---|---|---|---|
| 1 | Branch and head | `release/v5.4.0`, `1c73b31` | `git branch --show-current; git rev-parse --short HEAD` |
| 2 | Initial bundle 3,023,099 gzip, +54,001 of 60,000, 14 lazy files 46,408 bytes | JS 3,005,319 in 8 files, CSS 17,780; baseline 2,969,098 | `node scripts/bundle-budget.mjs --dist $SCRATCH/dist-bundle` (the Bundle planner's build of this commit) |
| 3 | Baseline file has three keys and 60,000 | `scripts/bundle-baseline.json`; `test/bundle-budget.test.ts:365-372` pins the key list and `toBe(60_000)` | `cat scripts/bundle-baseline.json; sed -n 364,373p test/bundle-budget.test.ts` |
| 4 | R4 left 5,999 bytes and an R4-only raise approval; 4.06 bytes a line | `docs/RELEASE-v5.3.0.md:112-115` | `sed -n 110,116p docs/RELEASE-v5.3.0.md` |
| 5 | `chunkSizeWarningLimit: 8000` at `vite.config.ts:12` | read | `sed -n 12p vite.config.ts` |
| 6 | CI is 8 shards; 778.1 s mean worker time; fast tier 124 files; 619 files timed | `ci-shard.mjs --plan 8` | `node scripts/ci-shard.mjs --plan 8 \| tail -3` |
| 7 | Job limits: checks 20, fast tier 15, shard 30, merge 15 minutes; `--verify 8` in `checks` | `.github/workflows/ci.yml:25,44,57,98,33` | `grep -n "timeout-minutes\|verify" .github/workflows/ci.yml` |
| 8 | Nightly `deep` has four rows (ceilings, old-saves, text, golden), 45 minutes | `nightly.yml:114-146` | `sed -n 112,150p .github/workflows/nightly.yml` |
| 9 | Ceiling list has 53 rows; the probe file has a 60 s PR and 300 s deep per-row timeout; 81 tests; 61.4 s in CI | `test/ceiling-probe.test.ts:23`; `scripts/test-timings.json`; local run 123 s on a loaded box | `python3 -c "import json;print(len(json.load(open('test/ceiling-list.json'))))"`; `npx vitest run --maxWorkers=1 test/ceiling-probe.test.ts` |
| 10 | Cycles today: 59, 8, 7, 6, 4, 2, 2, 2 = 90 modules | `test/architecture-baseline.json` | `python3` over the JSON |
| 11 | `kernel-parity.json` keys `aging` (44), `special`, `lives`, `menus`, `views`; menus are `{n, h}` hashes per group | the fixture | `python3` over the JSON |
| 12 | `EXPECTED_PORTS` has six names (`hub-entry.test.ts:72`); `PORTS` is checked with `toEqual` (`kernel-acceptance.test.ts:17,70`); cycle ceilings at `:117-121` | read | `sed -n 72p test/hub-entry.test.ts; sed -n 115,122p test/kernel-acceptance.test.ts` |
| 13 | Six `definePort` calls outside the kernel | grep | `grep -rn "definePort(" src/game --include=*.ts \| grep -v kernel/ports \| wc -l` |
| 14 | `FLAG_DEFS` has eleven keys; `test/flags.test.ts:88` says "eleven agreed keys"; the file is closed | `flags.ts:27-60` | `sed -n 27,60p src/game/flags.ts \| grep -c "{ default:"; sed -n 88p test/flags.test.ts` |
| 15 | `life.ts:1025` is `if (flagOn('social')) stampSocial(g)` | read | `sed -n 1020,1026p src/game/life.ts` |
| 16 | `MODULES` order and where a module goes | `modules/index.ts:24-37` | `sed -n 24,37p src/game/modules/index.ts` |
| 17 | The `news` phase exists, last after `settle`; `docs/KERNEL.md:30` lists it empty | `kernel/registry.ts:30-47` | `sed -n 30,47p src/game/kernel/registry.ts; sed -n 30p docs/KERNEL.md` |
| 18 | World budget: 80,000 cap, allotment r5 6,000, budget 55,000 nodes and 800,000 bytes, R4 measured 45,600 nodes and 443,000 bytes | `world/caps.ts:20-37`, `world/budget.ts:21-26` | `sed -n 20,60p src/game/world/caps.ts` |
| 19 | `capsOf` has a `case 'social'` with one row (`pairs`) | `world/budget.ts:124-125` | `sed -n 118,128p src/game/world/budget.ts` |
| 20 | Facts store: 400 rows, 12 a kind-year | `world/facts.ts:36,38` | `grep -n "FACT_CAP\|FACTS_PER_KIND_YEAR" src/game/world/facts.ts` |
| 21 | `pickTopic` at `relationships.ts:2353`, `conversation` at `:2361`; `Edge.n` and `Edge.d` at `world/edges.ts:54-55`; `memoryOdds` at `world/edge-odds.ts:144` | read | `grep -n "^function pickTopic\|^function conversation" src/game/relationships.ts; grep -n "memoryOdds" src/game/world/edge-odds.ts` |
| 22 | `pushFromWave` `:36` and `pushResearch` `:56` are in the leaf `business/frontier-waves.ts` and call `applyDisclosure` with no stamp check | read | `sed -n 36,66p src/game/business/frontier-waves.ts` |
| 23 | Load-time builds: `era-life.ts:15-18,46,49`; `history/events.ts:85`; `data/brands.ts:67-73`; `data/locales.ts:86` | read | `sed -n` on each |
| 24 | None of the other three plans names a file the Cycles track moves, except `gamestudio` import lines (B7) | grep of the plans for `economy.ts`, `rd.ts`, `heavy-rd`, `product-market`, `lab-year`, `finance-firm`, `group-treasury`, `conglomerate`, `board-vote`, `model.ts`, `actor.ts`, `astronaut.ts`, `assets.ts`, `landlord`, `crime.ts`, `underworld`, `money-options`, `money-stocks`, `yearly.ts` | `for f in ...; do grep -l -- "$f" bundle.md paper.md composer.md; done` |
| 25 | `ERA_RULES` (66 rules) at `events/era.ts:361` (the Bundle plan said `:359`); the `crypto` rule `:382`; `TAG` regex `:87`; `eraStrip` `:101`; the file is in `src/game/events/`, an unlisted directory, so layer 3 (a domain) | read; `test/layer-kit.ts:60-93` | `sed -n 86,102p src/game/events/era.ts; sed -n 60,70p test/layer-kit.ts` |
| 26 | `LIMITS` has `headline` 70 and `deck` 110 (`rules.mjs:48`), but the unit roles are log, scene, outcome, title, label, tooltip, digest, text, so a template cell is role `text` (no over-cap flag) | `scripts/voice/rules.mjs:48,51`; `units.mjs:22` | `grep -n "LIMITS\|AIMS" scripts/voice/rules.mjs; sed -n 22p scripts/voice/units.mjs` |
| 27 | The 58 topic strings of `relationships.ts:227-285` carry no voice flag (64 strings checked for the roles text, log and scene, 0 hits) | script | `node $SCRATCH/xc/topicflags.mjs` |
| 28 | There is no `ci: deep` marker; deep sizes come from env vars and `nightlySizes`; `test/nightly-workflow.test.ts` pins the YAML | `grep` finds `ci: deep` only in `composer.md`; `old-saves.test.ts:38`; `scripts/nightly-lib.mjs:14` | `grep -rln "ci: deep" test scripts docs .github` |
| 29 | `docs/SAVE.md` "One fixture per release" (`:209`) and the modes of `scripts/save-fixtures.ts` | read | `sed -n 205,222p docs/SAVE.md` |
| 30 | Fame decays 1 to 3 a year (2 to 5 above 60) | `special/fame.ts:1018` | `sed -n 1016,1020p src/game/special/fame.ts` |
| 31 | `src/game/news` and `src/ui/paper` do not exist yet | `ls` fails | `ls src/game/news src/ui/paper` |
| 32 | The baselines are regenerated by commands and are JSON; `layers-baseline.json` has `society->life` 2 at `:92` | read | `grep -n "society->life" test/layers-baseline.json` |
| 33 | The graph: 50 tasks, acyclic, 13 waves, 24 cross-lane edges, 15,797 source and 22,630 test lines | Appendix A | `node $SCRATCH/xc/check.mjs $SCRATCH/r5-tasks.json` |
| 34 | The task table file parses and every dependency exists | the same script | `node -e "JSON.parse(require('fs').readFileSync('$SCRATCH/r5-tasks.json','utf8'))"` |

## 10. What the cross-check changed in the plan files

Every edit is also marked inline with "cross-check" and C-numbers; each plan has a "Cross-check amendments" block at its foot.

**`bundle.md`.** (1) The merge-order line of section 3 rewritten: B8, B9, B10 early; B1 to B3 before any other track's eager source; B11 last after the flip (C16, C6). (2) B5: the Paper edge removed from the task table row, the `Needs` line, risk 6 and Q8 (C5). (3) B6: needs B3, B4, B5 (table row and `Needs`; C6). (4) Task table: B1 needs P1, B9 needs P4, B11 needs N11. (5) Amendments 1 to 9: integrated ceilings (`initialMaxGzBytes` 2,600,000 at B6, re-set at B11), per-chunk ceilings by prefix with the `PaperSheet` row from B11 (C7), the two pins of `bundle-budget.test.ts` (C12), era tags in other tracks' new files and the Paper's own regex (C11), the `MenuGroup.needs` hash rule for `kernel-parity.json`, node entries added by other tracks, regenerated voice baselines, and the corrected anchor of `ERA_RULES` (`:361`).
**`cycles.md`.** (1) The status paragraph: no longer "runs last after every other track"; merges before N11 (C8). (2) Y1 `Needs`: nothing; the `cycle-closure` bullet is a superset check (C9). (3) Y3 `Needs` adds P4; Q6 settled (moved-test rows go in the file P4 creates). (4) Amendments 1 to 6: ordering, ports counted at the merge (B7 may add some, C21), shared JSON baselines, Opus, the desk joins no cycle.
**`paper.md`.** (1) N1: the `flags.ts` and `flags.test.ts` edits moved to P3; `Needs` P3 and B3; `NOT_NEWS` starts with the composer's five kinds and the test is one-way (C1, C4). (2) N3: bounds instead of exact probe counts (C17). (3) Section 2, "Consumed from the other R5 tracks": the composer kinds, `paper.fx` against bit 8 (C2). (4) N11: the flip covers all four keys and the composer's list, with three rehearsal passes and the stop rule limited to the Paper-only pass (C3, 7.2). (5) Amendments 1 to 6, including the era-tag rule for outlet and template files (C11) and the layer reminder.
**`composer.md`.** (1) 2.1: bit 8 stays unused (C2). (2) O1: `Needs` P3 and B3; the `flags.ts` and `flags.test.ts` edits removed; `world/budget.ts` `case 'social'` gains the `rep rows` row (C14). (3) O3 `Needs` B3; O4 `Needs` B8 and B9; O6 `Needs` B8 and B9. (4) O13: `Needs` O1, the emit gated by `featureOn(g, 'tips')` and a test that a life without the bit keeps its `world` JSON; a `HUBS` row (C10, C15). (5) O14: no flip and no re-record; the composer-only pass and its expected slices; the nightly row through an env var, `nightlySizes` and `test/nightly-workflow.test.ts` (C3, C13). (6) Q12 settled. (7) Amendments 1 to 7: keys, Q4, the gate, one flip, shared-file order inside the track, voice baselines and the checked topic strings, fame.

Not changed: any planned size, any task title, the 53 kinds, the nine ports, the eleven (ten) Bundle tasks' designs, the freeze names. The sizes in 1.2 are the plans' own.

## 11. Process rules for the build

1. **Per-task prompt.** The task body, the "Cross-check amendments" of its plan, the decisions (W) and conflicts (C) it cites, and the 3.1 contracts it uses. The lead writes it; the agent gets nothing else, so a superseded form in a body is overridden by the brief.
2. **One fresh worktree per task,** cut from the release head after its prerequisites have merged; the lane edges then matter only as hot-file order (2.1).
3. **At most 2 agents at a time,** each running one `npx vitest run --maxWorkers=1 <named files>` at a time, `npm run typecheck`, never the full suite and never `npm test`. A build for a measurement goes to a scratch directory (`npx vite build --outDir <scratch> --emptyOutDir`), never to `dist/`. The lead's CI runs are in GitHub.
4. **Red first.** The task's red tests exist and fail before the code, and the hand-off says so. Every new seeded test uses `findSeed(pred)`; no new `seed: N` line (W23).
5. **The lead merges** in the order of 1.5, regenerates the JSON baselines (`layers`, `architecture`, `voice-gate`, `era-gate`) after each merge, merges the sorted lists of 2.1 by hand, and runs CP1 to CP3, the rehearsal and the walk. No agent merges, pushes to the release branch or re-records a fixture (G3).
6. **Review loop.** Each task is reviewed adversarially by a second Sonnet against the plan, the amendments and the house rules before it merges, with at most two fix rounds. Tasks with an Opus mark, O5, O11, O12 (money and text seams) and N8 (the store and header) get two reviewers.
7. **Size and Opus.** No task over about 700 source lines goes to one agent without its stated Opus fallback (B7 is the only one over). Opus runs only after Sonnet failed the task once, never two sessions at once, in the queue order of W22.
8. **Commits** use explicit pathspecs, never `git add -A`, and end with the attribution lines the session gives. Every anchor is re-read before it is edited; the plans' line numbers were read at `1c73b31` and drift.
9. **A task that cannot finish,** or whose test fails for a reason outside its files, stops and reports. It does not widen its scope, edit another track's files, or move a pin or a fixture to make a test pass.
10. **Every task reports** the delta of the initial bundle in gzip bytes (`npx vite build` to a scratch directory, then `node scripts/bundle-budget.mjs --dist <scratch>`) when it adds eager source, the fixtures it moved (none, except N11), and the ceiling rows it added with their measured seconds.
11. **Text.** A task that adds player text runs `node scripts/voice-gate.mjs` (after B10; before it, the pieces of B8 and B9), keeps every new file clean, tags era-ruled words, and uses contractions. No U+2014 and no U+2013 in any file, code, test or doc.
12. **Checkpoints.** A red checkpoint stops dispatch until the lead has fixed or reverted the merge that broke it and the checkpoint is green again.
13. **The rule for new files.** No module reads pack data while it loads (B1's sweep fails it); a new node entry that plays lives calls `await preloadAllPacks()` (B2's test fails it); `news/` and `text/` import only lower layers.
14. **P6 stops at a green PR.** The lead opens or updates the PR with the attribution lines, waits for the owner's explicit OK, and merges and tags only after it.

## Appendix A. The graph check (run for section 1.6)

The machine-readable table is `/tmp/claude-0/-home-user-snag/6c431472-dc02-517c-872c-436596f3a0de/scratchpad/r5-tasks.json`, a JSON array of `{id, title, deps, src, test, lane, plan}` with the ids written as in the plans (no `R5-` prefix) and `plan` the file that holds the task (`00-crosscheck.md` for P1 to P6, N11 is in `paper.md`, B11 in `bundle.md`). Checker (`node check.mjs r5-tasks.json`):

```js
const T = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const by = new Map(T.map((t) => [t.id, t]))
for (const t of T) for (const d of t.deps) if (!by.has(d)) throw new Error(`${t.id} needs missing ${d}`)
const left = new Map(T.map((t) => [t.id, t.deps.length])), next = new Map(T.map((t) => [t.id, []]))
for (const t of T) for (const d of t.deps) next.get(d).push(t.id)
const queue = T.filter((t) => t.deps.length === 0).map((t) => t.id), wave = new Map()
let seen = 0
while (queue.length) {                              // Kahn: a node is released when its last dependency is done
  const id = queue.shift(); seen++
  wave.set(id, 1 + Math.max(0, ...by.get(id).deps.map((d) => wave.get(d))))
  for (const n of next.get(id)) if (left.set(n, left.get(n) - 1).get(n) === 0) queue.push(n)
}
if (seen !== T.length) throw new Error(`cycle: reached ${seen} of ${T.length}`)
```

Output on the table of 1.2:

```
tasks 50, acyclic, waves 13
1 P1 P4 P5 B8 Y1
2 P3 B1 B9 Y2 Y3 Y5 Y6 Y7
3 B2 B10 Y4
4 B3 B4 B5 Y8
5 B6 N1 O1 O3
6 P2 B7 N2 N5 O2 O4 O6 O10 O13
7 N3 N4 N6 N7 O5 O8
8 N8 O7 O9
9 N9 O11 O12
10 N10 O14
11 N11
12 B11
13 P6
src 15797, test 22630, cross-lane edges 24
```

The longest chain by task count is P1, B1, B2, B3, N1, N5, N6, N8, N9, N10, N11, B11, P6 (13). Lane order inside each track holds: every dependency of a task in the same lane precedes it in the table.
