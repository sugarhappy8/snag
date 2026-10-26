# R4 cross-check of the four track plans (Registry and persona, Edges and acts, Life and heirs, People UI and fog)

Read: the four plans in this folder in full; the roadmap's R4 block (`docs/superpowers/plans/2026-10-20-living-world-roadmap.md` lines 244 to 269), Global Constraints (13 to 27), Review Focus (29 to 40), part E (980 to 1000), F.1 (1004 to 1021) and the decision table (1090 to 1131); design section 7 (574 to 640), 14.3 and 15; the R2 and R3 cross-checks (format precedent); the R5 and R6 preflight findings; and the code at `release/v5.3.0` = a45d3a1 (v5.2.0; `package.json` still says 5.2.0). Nothing under `src/` or `test/` was edited and nothing was added to git. The four plans got a new banner, ten inline corrections (section 11) and a closing section "Cross-check amendments"; this file is new. The adversarial review of 2026-10-26 was applied afterwards, in place, to this file and the four plans; the closing section "Review amendments (2026-10-26)" lists every finding applied, skipped or refuted. All text uses plain hyphens (no U+2014, no U+2013).

Where this file and a plan disagree, this file wins. The decisions are X1 to X52 in section 6; the amendments in the plans cite them. R4 ships as v5.3.0 (R5 v5.4.0, R6 v5.5.0).

**Verdict in short**

1. 50 planner tasks (Registry 11, Edges 16, Life 12, UI 11) plus 6 lead tasks (R4-P1 to R4-P6). The graph is acyclic and every dependency id exists (script in appendix A, run now). Longest chain: 17 tasks. 26 dependency edges were added (20 by the cross-check: platform prerequisites, the oracle gate, contract edges, lane order; 6 by the review: S10 after S4, E13 after E10 and U6, and P5 before P2, P3 and E4), two lane-order edges were cut and one task changed lane (section 1.2).
2. No task is over about 1,100 source lines. The largest after the amendments and the review: R4-E10 about 850, R4-E6 830, R4-E11 670, R4-E12 530. Nothing was split. Planned totals are 14,055 source lines (roadmap budget 16,900) and 26,130 test lines (roadmap 20,024), plus 50 and 150 for the lead tasks (14,105 and 26,280 in all; script in appendix A, run after the review).
3. No task writes `Person.money` outside the ledger, draws `g.rng` in a new path, or adds an unbounded saved field. The only money literal is `materializePerson`'s opening balance, which `docs/LEDGER.md:172-173` and `:251` exempt. The only `g.rng` draws near new code are the seven unchanged re-rolls of `continueAsChild` (life.ts:1410 to 1460) and `familyLifeCycle`, kept in order.
4. 39 conflicts between the plans, or between a plan and the code, were found and resolved (section 3.2). Seven of them would have failed CI or broken a layer rule: a port that is unbound for three tasks (C3), two upward imports from layer 2 (C4, C36), cross-domain imports that skip the contract (C39), a flag flip the release rule forbids (C16), a test that pins the family-memory limit and was missing from the plan (C15), and a sid builder that throws on a hostile year (C38).
5. Three roadmap "player sees" lines cannot be delivered by R4 as worded: dialogue that remembers (D.11 is R5), the banker met in 2031 who is the minister in 2040 (needs R6 D.6 and R7), and cousins (and the popup in-laws of the player's own spouse), which stay per-popup names; real in-laws and nieces come only for NPC weddings, babies and estates. They are flagged in section 7 and X46, not hidden.
6. The lead owns six platform tasks that block the build: the bundle baseline (23 bytes of headroom today; re-captured, the limit stays +60,000 and a raise needs the owner), the world node cap (the largest shard is dropped silently; its raise moves three more test files, section 5), the two flag keys, CI shards, `moved-tests.md`, and the release commit (which also records one v5.3.0 save fixture).

## 1. The task graph

### 1.1 Lanes

Every track has a lane `main` and at most 4 lanes. Within a lane, tasks run in the order of this table and each follows the one before it (checked by the script, including transitive dependencies). A dependency on another lane or track means that task's head is merged into this lane's worktree before the task starts. The machine runs at most 3 test-running agents at a time and the roadmap allows 9 parallel tracks, so the lead follows the slot schedule of section 1.3.

| Track | Lane | Tasks in order | Source lines (planned, after amendments) |
|---|---|---|---|
| registry-persona | main | S1, S2, S3, S4, S6, S7, S8, S11 | 2,450 |
| registry-persona | persist | S5 | 70 |
| registry-persona | persona | S9, S10 | 500 |
| edges-acts | main | E1, E2, E5, E6, E7, E8, E14, E15, E16 | 2,730 |
| edges-acts | gold | E3 | 0 |
| edges-acts | side | E4, E13 | 400 |
| edges-acts | acts | E9, E10, E11, E12 | 2,350 |
| life-heirs | main | L1, L2, L3, L4, L5, L8, L12 | 1,620 |
| life-heirs | estate | L6, L7 | 660 |
| life-heirs | heirs | L9, L10, L11 | 990 |
| people-ui-fog | main | U1, U2, U3, U4, U9, U10, U11 | 1,245 |
| people-ui-fog | rows | U5 | 230 |
| people-ui-fog | staff | U6, U7 | 580 |
| people-ui-fog | cockpit | U8 | 230 |
| platform (lead) | lead | P1 to P6 | 50 |

Lane changes against the plans: Edges E4 moved from `gold` to `side` (E3 and E4 are both about 900 test lines recorded on the unmodified tree, so they run in parallel; `side` is idle until E13); Life L8 moved from `estate` to `main` after L5 (it needs only L1 and E7, and keeping it in `estate` put it on the critical path for no code reason). Registry S10 follows S9 in lane `persona` (lane order).

### 1.2 Tasks, lanes, dependencies, sizes

Ids are written without the `R4-` prefix in the Depends column. "Src" and "Test" are planned lines after the amendments. "Edits" lists the main `path:line` anchors checked now (section 11); a full list is in each plan.

**Platform (lead)**

| Id | Title | Depends on | Src | Test | Blocks |
|---|---|---|---|---|---|
| R4-P1 | Bundle baseline re-captured at v5.2.0; the limit stays +60,000 (X48) | - | 0 | 0 | every task that adds eager source; U4 |
| R4-P2 | World node cap, budget and a fixed over-cap drop order (X47), with the four tests and the doc that pin the old cap | P1, P5 | 40 | 130 | S4, E6 |
| R4-P3 | `FLAG_DEFS` keys `social` and `peopleProfile`, `flags.test.ts` key list (X6, X8) | P1, P5 | 10 | 20 | U2, U8, E7 |
| R4-P4 | CI to 8 shards and a timings refresh (X49) | - | 0 | 0 | nothing in code |
| R4-P5 | `moved-tests.md`, re-record protocol, docs index (X3) | - | 0 | 0 | every re-record |
| R4-P6 | Release: `docs/RELEASE-v5.3.0.md`, the v5.3.0 save fixture, roadmap R4 block, timings, one full CI, exit-gate walks, merge, tag | E16 | 0 | 0 | - |

**Registry and persona (registry-persona.md)**

| Id | Lane | Title | Depends on | Src | Test | Edits |
|---|---|---|---|---|---|---|
| R4-S1 | main | Pins, then one person-key rule (`kernel/person-ref.ts`, with its `docs/KERNEL.md` line) | P1 | 120 | 520 | cash.ts:75-77, world/people.ts:31, docs/KERNEL.md |
| R4-S2 | main | Five axes, trait bridge, staff axes, six voices | S1 | 330 | 420 | types.ts:417 (comment) |
| R4-S3 | main | sid grammar, `Slot`, pure `latent`, golden file, `docs/PEOPLE.md` stub with the inventory of the 8 named-person shapes | S2 | 500 | 540 | docs/STREAMS.md:11 |
| R4-S4 | main | `g.world.met` shard, total normalizer, one writer, caps | S3, P2 | 450 | 560 | world/caps.ts:21, types.ts:72, shards.ts:7, budget.ts:77, invariants.ts:145 |
| R4-S5 | persist | `world.met` as the first entity slice (spike) | S4 | 70 | 330 | save-slices.ts:25 |
| R4-S6 | main | Name registry (8 alternates, then a hyphenated surname) | S3, S4 | 190 | 280 | - |
| R4-S7 | main | touch, mark, evict, tombstone, sweep, protectors, salience | S4, S6 | 490 | 680 | world/lod.ts:322-337 |
| R4-S8 | main | `materializePerson`, the draw-free Person bridge | S7 | 240 | 400 | people.ts:231-234 |
| R4-S9 | persona | The player's persona (`persona.me`) | S2 | 300 | 430 | world-flags.ts:93 |
| R4-S10 | persona | Reader migration at parity, `axesOfPerson` | S1, S2, S4, S9 | 200 | 340 | npc-lives.ts:96,104,250,336; npc-state.ts:21; will-core.ts:407-441; nepo-model.ts:21-45; nepo-succession.ts:30-35; nepo-job.ts:18-21 |
| R4-S11 | main | 120-year probe, 100x ceilings, old saves, money and sid scans, freeze note | S5, S8, S9, S10 | 130 | 640 | ceiling-kit.ts:589, ceiling-probe.test.ts:60 |

**Edges and acts (edges-acts.md)**

| Id | Lane | Title | Depends on | Src | Test | Edits |
|---|---|---|---|---|---|---|
| R4-E1 | main | Parity kit, v5.2.0 social save fixture, write ratchet, mutation check | - | 0 | 800 | scripts/save-fixtures.ts:1-30 |
| R4-E2 | main | Golden: relationships and love | E1 | 0 | 850 | - |
| R4-E3 | gold | Golden: wealth tiers and asks, will anger ladder | E1 | 0 | 900 | - |
| R4-E4 | side | Golden: nepo and dynasty, heir hand-over, scripted lives | E1, P5 | 0 | 900 | - |
| R4-E5 | main | The shim: signature codemod, `setRelationship`, mirror hook | E2, E3, E4, L1, S1, U1 | 330 | 190 | core.ts:59, wealth-core.ts:573, 63 files |
| R4-E6 | main | Edge model, 40 memory kinds, edge-local bound predicate and counters, `world.edges` entity slice, `social` stamp shard | E5, P2, S5 | 830 | 790 | world/caps.ts:21, shards.ts:7, budget.ts:75, invariants.ts:142, save-slices.ts |
| R4-E7 | main | Mirror, yearly edge step, stamp in `createNewLife` | E6, P3 | 540 | 730 | life.ts:717, relationships.ts:1525,1541, wealth-core.ts:277-281, will-core.ts:371-376 |
| R4-E8 | main | Memory writers, memory odds terms, heir copy | E7 | 420 | 520 | wealth-resolve.ts:259, will-act.ts:111, love.ts:912,962,1627, nepo-actions.ts:197 |
| R4-E9 | acts | Family-act budget (3 a year), the saturated-year test, and the `kin` pace engine | E7 | 300 | 560 | wealth.ts:73, nepo-year.ts:32-38, will-feud.ts:234, luxury-family.ts:621,664, text/pace.ts:19-37, text/memory.ts:16, text-memory.test.ts:46,436-448 |
| R4-E10 | acts | SocialAct engine, favors, loans, debts, `serviceDebt`, `debtToken`, the authorization table | E8, E9, S10 | 850 | 840 | relationships.ts:3721, stream-tap.ts:149, year-plan.ts:63-110 and logModel.ts:19-60 (society.acts rows) |
| R4-E11 | acts | Secrets, gossip (hop cap 2, one leak each), betrayal, reconciliation, mentorship | E10 | 670 | 710 | love.ts:912-918, will-amends.ts:82,215 |
| R4-E12 | acts | Feud ladder (12 live, one popup a year), `social.feud` fact | E11 | 530 | 660 | notice-weights.ts:51 |
| R4-E13 | side | Staff loyalty for KeyStaff and Manager | E8, E4, E10, U6 | 400 | 470 | staff.ts:222-224,350,410-424,586-598,689, board.ts:218 |
| R4-E14 | main | `isBound` (layer 2, widens E6's edge-local predicate), eviction guards, Met protector and salience | E8, E10, S7 | 310 | 420 | relationships.ts:2129 |
| R4-E15 | main | D.12 acceptance: determinism, scans, 120-year probe, save size, matrix, 100x, marriage for wealth | E12, E13, E14 | 150 | 990 | ceiling-kit.ts, ceiling-probe.test.ts:60 |
| R4-E16 | main | Flip `social` and `peopleProfile` with the 5.3.0 bump, re-record, repetition fix-up | E15, S11, L12, U11 | 150 | 200 | flags.ts, package.json, fixtures |

**Life and heirs (life-heirs.md)**

| Id | Lane | Title | Depends on | Src | Test | Edits |
|---|---|---|---|---|---|---|
| R4-L1 | main | Pins before the shim (life cycle, estates, deficiency, hand-over) | E1 | 0 | 640 | - |
| R4-L2 | main | Mortality leaf and pure `ageTo` | L1, E5 | 240 | 430 | relationships.ts:896-917, stream-tap.ts:175 |
| R4-L3 | main | Kin links on `Person.data`, caps, pure views, `kinProblems` (one spouse, mutual) | L2, S1, S3, S4 | 300 | 460 | world/invariants.ts:145, types.ts:417 |
| R4-L4 | main | Kin records on stamped lives: adopt, sync, widow, facts | L3, S7, E6, E7 | 470 | 600 | relationships.ts:1338-1378, modules/index.ts:19-28, text/pools.ts:248 |
| R4-L5 | main | Deaths through the estate path (`life.estates` at life 55) | L4, S8 | 330 | 490 | dynasty-ownership.ts:28,41-56, life.ts:1186 |
| R4-L8 | main | Sibling keeps a mortgaged firm and a firm at 18 to 20 | L5, L1, E7 | 150 | 380 | life.ts:1214-1231, npc-lives.ts:158-168 |
| R4-L12 | main | Acceptance, 100x ceilings, 120-year slice, money scan, docs | L8, L7, L11 | 130 | 840 | ceiling-kit.ts:703, ceiling-list.json:34 |
| R4-L6 | estate | Personal debts from the estate, receivables by will share | L1, E5, E7, E10 | 360 | 520 | life.ts:1233-1240, 1496-1497 |
| R4-L7 | estate | Divorce deficiency becomes an obligation | L6, E6, E10 | 300 | 470 | love.ts:1651-1669, text/state-table.ts:113 |
| R4-L9 | heirs | Hand-over rebuild (blend, kept contacts, edge copy, same-face heir spouse) | L4, L5, L6, E8, E14, S8 | 550 | 780 | life.ts:1367-1470, 1496-1497 |
| R4-L10 | heirs | NPC-NPC strife edges at the reading of the will | L9, E6, E9 | 250 | 380 | will-estate.ts:354-374, 540-621 |
| R4-L11 | heirs | Heir safety belt, dangling-id invariant, carryover table | L10, L9 | 190 | 330 | life.ts:1496-1497 |

**People UI and fog (people-ui-fog.md)**

| Id | Lane | Title | Depends on | Src | Test | Edits |
|---|---|---|---|---|---|---|
| R4-U1 | main | The Exact oracle (before any screen changes) | - | 0 | 430 | - |
| R4-U2 | main | Eight rule rows, exposure, `ppl` owner, `KeyKind.gone`, two-file guard | U1, S1, P3 | 190 | 340 | knowledge/keys.ts:85, kinds.ts:22-31, module.ts:45-53 |
| R4-U3 | main | `personFacts` builder | U2 | 330 | 430 | - |
| R4-U4 | main | Profile layout, `FactRow`, lazy profile chunk, same-commit dialog test | U3, P1 | 290 | 360 | PersonSheet.tsx:70-152, global.css:1356 |
| R4-U5 | rows | Action rows through `readPerson`; Look closer | U2 | 230 | 380 | npc-lives.ts:475-492, relationships.ts:3721, wealth-menu.ts:139, will-amends.ts:40 |
| R4-U6 | staff | Hired key staff: tenure exposure, trait after a year | U2 | 250 | 360 | staff.ts:169-224,369-383, staff-fog.ts:75 |
| R4-U7 | staff | CEO and manager shortlist, check, rows, letter | U6 | 330 | 380 | manage.ts:1791-1830,1867-1930,1971,2190 |
| R4-U8 | cockpit | People cockpit tiles and `personBadge` | U1, P3 | 230 | 300 | cockpit.ts:216-220, hubs/people.ts:20-22,51-65 |
| R4-U9 | main | Connections card (with a kids row); `relationLabel` reads `data.kin` (X38) | U4 | 215 | 300 | PersonSheet.tsx, core.ts:845 |
| R4-U10 | main | Memory lines in Shared history | U9, E6, E8, S1 | 130 | 200 | PersonSheet.tsx |
| R4-U11 | main | Acceptance sweep, `people-reads` ceiling, scan, advisor case, docs | U4, U5, U7, U8, U9, U10 | 90 | 660 | ceiling-kit.ts:703, docs/FOG.md |

Dependencies changed against the plans (each with its reason in section 1.4): E5 gains L1, S1, U1; E6 gains P2 and S5; E7 gains P3; E10 gains S10; E13 gains E4 (lane order), and E10 and U6 (review); E14 gains S7; E16 gains S11, L12, U11; L8 loses L7 and gains L5 (it moves to lane `main`); L9 is no longer held back by the whole estate lane (the plan's merge order), only by L6; L12 gains L7; S4 gains P2; S10 gains S9 (lane order) and, by the review, S4 (`readMet`, `metRecord`); S1 gains P1; U2 gains P3; U4 gains P1; U8 gains P3; the Registry plan's text dependency "S10 second commit waits for the Edges merge" is cut (X19). Added by the review: S10 gains S4 (it reads `readMet` and `metRecord`; the lane order alone let it start with S4 in the same wave); E13 gains E10 (the `social` row of `stream-tap.ts` is E10's, and the stream guard fails a tag with no row) and U6 (both edit the HIRE lines of `staff.ts` at :222-224); P2, P3 and E4 gain P5 (every task that adds a `moved-tests.md` row is downstream of P2, P3 or E4, so the file exists before the first row).

### 1.3 Waves (longest dependency chain to each task)

| Wave | Tasks that can start when the previous waves are merged |
|---|---|
| 1 | E1, P1, P4, P5, U1 |
| 2 | E2, E3, E4, L1, P2, P3, S1 |
| 3 | E5, S2, U2, U8 |
| 4 | L2, S3, S9, U3, U5, U6 |
| 5 | S4, U4, U7 |
| 6 | L3, S5, S6, S10, U9 |
| 7 | E6, S7 |
| 8 | E7, S8 |
| 9 | E8, E9, L4, S11 |
| 10 | E10, L5, U10 |
| 11 | E11, E13, E14, L6, L8, U11 |
| 12 | E12, L7, L9 |
| 13 | E15, L10 |
| 14 | L11 |
| 15 | L12 |
| 16 | E16 |
| 17 | P6 |

The critical path is P1, S1, S2, S3, S4, S5, E6, E7, E8, E10, L6, L9, L10, L11, L12, E16, P6 (17 tasks, about 5,740 source lines). It runs through the Registry chain only because of the one "pattern edge" E6 after S5 (X10); without that edge the head of the path is E1, E2, E5 and the length is 15. The lead may cut the edge if S5 slips by more than a day. Fan-out: S1 gates 6 tasks, S4 5, E6 5, E7 5, E8 5, E10 5, P1 4, E1 4. Wave 1 is five tasks and wave 2 seven: the lead starts E1 and U1 first (both record on the unmodified tree), then S1 and L1, then the rest.

**Slot schedule (review).** There are 14 planner lanes (registry 3, edges 4, life 3, ui 4), and the largest set of tasks with no ordering between any two of them is 12 (the appendix script plus a bipartite matching, run after the review). That is above the roadmap's 9 parallel tracks and the machine's 3 test-running agents, and only waves 1 and 2 were said to be staggered. The rule: at most 9 lane worktrees are open and at most 3 agents run tests at once. Four batches, each opened when the barrier before it has merged (section 1.5):

| Batch | Waves | Lanes open | What waits |
|---|---|---|---|
| A oracle gate and platform | 1-2 | edges/main (E1, E2), edges/gold (E3), edges/side (E4), life/main (L1), ui/main (U1), registry/main (S1), and the lead's P1 to P5: 6 lanes | E1, U1 and S1 start first (they record or pin on the unmodified tree), then L1, E2, E3, E4 as test slots free; no other lane opens |
| B shim and kernel users | 3-8 | registry/main, persist, persona; edges/main (E5, E6, E7); life/main (L2, L3); ui/main, rows, staff, cockpit: 9 lanes at most | E5 runs alone first (barrier); edges/acts, edges/side (E13), life/estate and life/heirs wait for batch C |
| C acts and life | 9-12 | edges/main (E8, E14), acts (E9 to E12), side (E13); life/main (L4, L5, L8), estate (L6, L7), heirs (L9); ui/main (U10, U11); registry/main (S11): 8 lanes | the UI rows, staff and cockpit lanes are done by now |
| D acceptance and release | 13-17 | edges/main (E15, E16), life/heirs (L10, L11), life/main (L12): 3 lanes | P6 after E16 |

Inside a batch the critical path takes a test slot first (the Registry chain, then Edges E6 to E10, then Life L4 to L9), and the UI lanes take the slots left.

### 1.4 Cross-track edges (why each exists)

| Edge | Why |
|---|---|
| E5 after L1, S1, U1 (and E2 to E4) | The oracle gate (X4): every pin that says "this tree before the shim" is merged first. S1 and U1 do not need E5's code; they are in the gate so E5 can be proved behaviour-preserving against them. Cost: none on the critical path |
| E6 after P2 | Over the node cap `normalizeWorld` drops the largest shard (state.ts:153-160), which would be `edges` and every debt in it |
| E6 after S5 | Both tracks claim to be the first production user of an entity slice. S5 is 70 lines and a spike; if it fails, E6 (800 lines) is not where to find out (X10) |
| E7 after P3 | `flagOn('social')` needs the key to compile |
| U2, U8 after P3 | `peopleFog()` is `flagOn('peopleProfile') && !isExact()`; it needs the key to compile at U2, not at U4 as the plan says |
| E10 after S10 | `society/seam.ts` calls `axesOfPerson(g, p)` (C7); S10 is five waves earlier than E10 anyway |
| E14 after S7 | E14 registers a protector and a salience function (`registerProtector`, `registerSalience`), which S7 defines |
| L2 after E5 | The `relationships.ts:896-917` hunk lands on the codemod's tree |
| L3 after S1, S3, S4 | `isSid`, `personKey`, `readMet` |
| L4 after S7, E6, E7 | `touchMet` with the identity argument, `putEdge`, `socialOn`, `syncLegacy` |
| L5 after S8 | `materializePerson` |
| L6 after E5, E7, E10 | `addRelationship(g, ...)`, `syncLegacy`, `serviceDebt` and `debtsOf` |
| L7 after E6, E10 | `Edge.dv` kind 1 and `serviceDebt` |
| L9 after L4, L5, L6, E8, E14, S8 | kin links and records, estates, receivables, `heirEdges`, `isBound`, `personOfSid`. L6 is also a hot-file order: both edit `life.ts:1496-1497` |
| L10 after E6, E9 | strife edges and `useFamilyAct` |
| U10 after E6, E8 | `readEdge`, `memoriesOf`, `MEMORY_KINDS`, `socialOn` |
| E16 after S11, L12, U11 | flipping the stamp runs every track's tests stamped; all four acceptance tasks are merged first |
| S10 after S4 | the first commit reads the Met axes of a sid-born person (`readMet`, `metRecord`); lane order alone put S10 in the same wave as S4 (review) |
| E13 after E10 | the `social` row of `test/stream-tap.ts` and its driver are E10's, and the repo-wide stream guard fails a tag with no row (review) |
| E13 after U6 | both insert in the HIRE script of `staff.ts` just after `b.staff.push(s)` (:222-224; the staff id exists only after `id: uid(g, 'ks')` at :209), so the hunks are not 20 lines apart (review) |
| P2, P3, E4 after P5 | `moved-tests.md` must exist before the first task that adds a row: every such task is downstream of P2, P3 or E4 (review) |

Everything else that looks like a dependency in the plans is a merge-order or hot-file matter handled by section 2, not by edges: E10 against U5 in `personActions`, S10 against E7 and E8 in `will-core.ts`.

### 1.5 Merge order into `release/v5.3.0`

Task-level order is the topological order of the script (appendix A). The groups are barriers: a group starts merging when the previous group's tasks that it depends on have merged. Within a group, tracks merge in the priority Registry, Edges, Life, UI (the UI plan merges last; the Edges codemod comes first because E5 rewrites 63 files).

| Group | Tasks | Notes |
|---|---|---|
| B0 lead | P1, P4, P5 | P1 first: 23 bytes of bundle headroom means the first eager line of source fails the gate; P5 before P2, P3 and E4 |
| B1 oracle gate | E1, then E2, E3, E4, L1, U1, S1 (pins commit, then the person-ref commit with its `docs/KERNEL.md` line), P2, P3 | all test-only except S1, P2, P3; each merges alone as it finishes |
| B2 barrier | E5 | after it every open worktree runs `node scripts/codemod-addrel.mjs --apply` (idempotent); `tsc` finds any two-argument call left |
| B3 kernel contracts | S2, S3, S4, S5, S6, S7, S8, S9, S10; E6, E7, E8; L2, L3; U2, U3, U5, U6, U8 | the contracts freeze point F1 is the merge of S8, E8, L3 and S10: R5 and R6 may stack on the branch from here (section 9) |
| B4 acts and life | E9, E10, E11, E12, E13, E14; L4, L5, L6, L7, L8, L9, L10, L11; U4, U7, U9, U10 | L6 and L9 serialize on `life.ts:1496-1497` |
| B5 acceptance | S11, E15, L12, U11 | each also runs its own old-save matrix |
| B6 flip | E16 (one commit: package.json 5.3.0, both flags on, fixtures re-recorded, repetition fix-up) | X7 |
| B7 release | P6 | docs, timings, one full CI, the walks, tag |

### 1.6 Proof

`appendix A` holds the script. Run on the table of section 1.2 (56 nodes), again after the review: no duplicate id, every dependency id exists, topological order found for all 56 (acyclic), lane order holds for every lane of the four tracks, longest chain 17, the largest task 850 source lines, the largest unordered set 12. Nobody ran the full suite.

## 2. The hot-file matrix

"Distinct hunks" means different functions or regions of one file; the merge is textual, never semantic. "Order" is merge order; the later task rebases and keeps every hunk. A file with a sorted list (modules, hubs, ceiling rows, shard names) gets one line per task, kept sorted.

| File | Tasks (in merge order) | Resolution |
|---|---|---|
| `src/game/relationships.ts` | E5 (111 call lines, mass), L2 (896-917), E7 (1525, 1541 kinds), E8 (2834), E14 (2129), L4 (1338-1378), E10 (3721 spread), U5 (3721 Look closer) | E5 first, then in order. E10 and U5 insert adjacent lines at `:3721` after `willPersonNodes`: E10's `...socialNodes(g, p)` first, U5's `lookCloser` row second; keep both |
| `src/game/life.ts` | E5 (calls), E7 (717 stamp in `createNewLife`), L5 (1186), L8 (1214-1231), L6 (1233-1240, 1496-1497), L9 (1367-1470, 1496-1497), L11 (1496-1497) | separate statements. At `:1496-1497` three one-line calls are added after `n.character = heir` in the order `carryReceivables` (L6), `carryEdges` (L9), the sid fold (L11) |
| `src/game/core.ts` | E5 (59-62), U9 (845 `relationLabel`) | distinct hunks. `core.ts` is layer 0; neither hunk imports upward |
| `src/game/love.ts` | E5 (39 calls), E8 (912, 962, 1627), E11 (912-918), L7 (1651-1669) | E8 before E11 at `:912`; the rest distinct |
| `src/game/npc-lives.ts` | E5 (calls), S10 (96, 104, 250, 336), L8 (158-168), U5 (475-492) | distinct hunks. The three U+2014 at 478, 481, 482 go in U5 |
| `src/game/npc-state.ts` | S10 (21) | single owner. E10 and E11 read it |
| `src/game/types.ts` | S2 (417 comment), L3 (417 comment) | one comment; S2 writes it, L3 appends the kin keys to it |
| `src/game/events/wealth-core.ts`, `wealth-resolve.ts`, `wealth.ts` | E5 (573 bump, 228-483 calls), E7 (277-281), E8 (565, 259, 287, 139, 154, 329), E9 (73) | distinct hunks. E9 changes `popupBudget` only; E8 touches the odds terms |
| `src/game/events/will-core.ts` | E7 (371-376), E8 (584), S10 (407-441) | distinct hunks, 30 lines or more apart. S10 does not wait for the Edges track (X19) |
| `src/game/events/will-act.ts`, `will-feud.ts`, `will-amends.ts`, `will-estate.ts` | E5 (raw writes: will-act 312, 327, 343; will-feud 100, 105, 194, 285, 289), E8 (will-act 111, 303, 335; will-feud 85; will-amends 82), E9 (will-feud 234), E11 (will-amends 82, 215), U5 (will-amends 40), L10 (will-estate 354-374, 540-621) | distinct hunks; E8 before E11 at `will-amends.ts:82` |
| `src/game/business/nepo-year.ts`, `nepo-actions.ts` | E7 (142-143), E8 (344; 197, 286, 319, 419), E9 (32-38) | distinct hunks |
| `src/game/business/nepo-model.ts`, `nepo-succession.ts`, `nepo-job.ts` | S10 only | no Edges task touches them (grep now) |
| `src/game/business/staff.ts`, `board.ts` | U6 (169-224 with the carried-read `learn` after `b.staff.push(s)` at :222, 369-383), E13 (222-224, 350, 410-424, 586-598, 689; board 218) | the two HIRE hunks sit in the same few lines (:222-224), so E13 depends on U6 and rebases on it (review; the earlier "20 lines apart" claim held only for U6's `staffGroup` hunk at 369-383) |
| `src/game/business/manage.ts`, `conglomerate-menu.ts`, `board-ceo.ts`, `staff-fog.ts` | U7 (and U6 for staff-fog) | single owner |
| `src/game/business/dynasty-ownership.ts` | L5 (28, 41-56) | single owner |
| `src/game/world/caps.ts` | P2 (11), S4 (21), E6 (21) | S4 appends `MET_CAPS` after `FRONTIER_CAPS`, E6 appends `EDGE_CAPS` after it; P2 writes the allotment comment |
| `src/game/world/shards.ts`, `budget.ts`, `invariants.ts` | S4, E6, L3 | each adds its own import, `case` or problems loop; one line each, sorted |
| `src/game/world/state.ts` | P2 (153-160) | single owner |
| `src/game/world/types.ts` | S4 (72) | single owner (`WorldState` has an index signature, so E6 needs no typed field) |
| `src/game/world/lod.ts` | S7 (322-337) | single owner. E14 does not edit it (C5) |
| `src/game/save-slices.ts` | S5, E6 | one import each |
| `src/game/world-flags.ts` | S9 (93) | single owner |
| `src/game/flags.ts`, `test/flags.test.ts` | P3 (flags), E16 (defaults) | the lead only |
| `src/game/modules/index.ts` | E7 (`world.edges`), E10 (`society.acts`), L4 (`life.kin`), L5 (`life.estates`), L7 (`life.debts`) | one line each; the array is sorted by id, so `life.*` falls between `knowledge.core` and `menus.*`; keep all |
| `src/game/hubs/year-plan.ts:63-110`, `ui/components/logModel.ts:19-60`, `test/quiet-integration.test.ts:70-79` | E7, E10, L4, L5, L7 (X42) | keys are module ids; one row per module in each of the three files; the two copies must agree (R3-Q13 checks) |
| `src/game/text/pools.ts:248`, `text/state-table.ts:113`, `test/text-lines.test.ts:95,251` | E10, E11, E12, L4, L7, L10 | append-only blocks; each task adds its pool or row just before the closing line, in task-id order; the integrator keeps all |
| `src/game/text/pace.ts`, `text/memory.ts:16`, the pace tests (`pace.test.ts:22`, `ask-families`, `biz-pace`, `kit-pace`), `notice-acceptance.test.ts:83,300`, `text-memory.test.ts:46,436-448` | E9 only | one owner for the 80 and 160 raise (X41); six test files pin the old numbers |
| `src/game/knowledge/keys.ts`, `kinds.ts`, `module.ts`, `test/knowledge-*.test.ts` | U2 only | |
| `src/game/hubs/cockpit.ts`, `hubs/people.ts`, `test/nav-cockpit.test.ts:371-382` | U8 only | |
| `src/ui/components/PersonSheet.tsx`, `PersonProfile.tsx`, `ui/people/lazy.tsx`, `ui/styles/global.css`, `test/lazy-zones.test.ts` | U4, U9, U10 (one lane) | sequential in one worktree; U4 puts the profile in a lazy chunk, U9 and U10 edit `PersonProfile.tsx` |
| `test/save-world-adapter.test.ts:26` | S4 (`met`), E6 (`edges`, `social`) | sorted list; keep all |
| `test/hub-entry.test.ts` (HUBS) | S4 (`world/met`), E6 (`world/edges`, `world/social`), E7 (`world/edge-step`), E10 (`society/module`), L4 (`modules/kin-years`), L5, L7, U2 (`people-fog`) | append a row each. No port is added (X23) |
| `test/world-budget.test.ts`, `test/world-state.test.ts:197-221`, `test/world-repair.test.ts:66-70`, `docs/WORLD.md:102-104,143-147` | P2 (the 116 pin, the cap pin and shard sizes, the junk sizes, the doc figures), S4 and E6 (maximal-world builder gains `met` and `edges` at the cap) | all four move in P2's commit, together with the constants |
| `src/game/world/edges.ts`, `edge-write.ts`, `edge-step.ts` | E6 (creates `edgeLocalBound`, `liveFeuds`, `openDebts`, `EdgeMap`; `putEdge` eviction and `normalizeEdges` use `edgeLocalBound`), E7 (the orphan rule uses `edgeLocalBound`), E14 (swaps both to `isBound`) | E6 and E7 use the edge-local predicate and E14 widens it (review: they could not call a predicate created six tasks later) |
| `src/game/society/contract.ts` | E9 (creates; `useFamilyAct`, `familyLive`, `liveFeuds`, `openDebts`), E10, E11, E14 | one export line per task, sorted; E14 rebases onto the acts lane head and starts only after E9 and E10 have merged (review: five tasks across two lanes edit it) |
| `test/social-act-auth.test.ts` | E10 (creates), E11, E12, E13 (rows) | one table, one row group per task |
| `test/kernel-aging.test.ts` | nobody edits it | pins a module of its own at life 45, the first two aging entries and `effort.you` right after `household`: L5 uses life 55, L4 life 37, the society phase stays empty (X2) |
| `test/knowledge-unwired.test.ts` | U2 (two-file allow-list), U6 and U7 (run it) | the guard lists `people-fog.ts` and `business/leader-fog.ts` |
| `test/stream-tap.ts`, `test/stream-isolation.test.ts` | E10 (`social`, 149, 71), L2 (`life.path`, 175, 75) | one row and one driver each |
| `test/ceiling-list.json`, `ceiling-kit.ts`, `ceiling-probe.test.ts:60` | S11 (2 rows), E15 (7), L12 (10), U11 (1) | 20 rows in all, appended at the tail of the JSON array in merge order S11, E15, L12, U11 (the list test and the probe test fail until both halves exist) |
| `test/layers-baseline.json` | E10 (one `UPDATE_LAYER_BASELINE=rebase`) | the lead approves the printed additions (X26) |
| `test/fixtures/kernel-parity.json`, `golden-digests.json`, `r2-parity.json`, `social-parity-*.json`, `heir-parity` | the integrator | never merged by hand (section 8) |
| `docs/WORLD.md`, `SAVE.md`, `STREAMS.md`, `LEDGER.md`, `KERNEL.md`, `KIN.md`, `PEOPLE.md`, `SOCIAL.md`, `QUIET.md`, `KNOWLEDGE.md`, `FOG.md` | additive sections by task | `PEOPLE.md` is created by S3 (X51) and extended by S4, S7 and completed by S11; `KERNEL.md` needs one entry line for each new file of `src/game/kernel` or `kernel-acceptance.test.ts` fails: S1 adds the `person-ref.ts` entry, E5 adds the `relations.ts` entry |

Serialization rules for every track:

1. **E5 is a barrier.** Nothing that edits one of its 63 files merges in the same hour. A branch that started earlier rebases and runs the codemod.
2. **Same-line inserts are ordered by the table above**, not by the clock; the later task resolves the conflict by keeping both hunks and re-running its own test.
3. **A fixture is never merged by hand** (section 8).
4. **A task that edits a sorted list inserts at the sorted place**, never at the end of the list, so the next task's hunk does not touch it.
5. **Re-grep your anchors before editing.** Every anchor was read at a45d3a1; after E5 the call lines move.

## 3. Interfaces to freeze

"Freeze" means: from the merge of the owning task these names, signatures and rules do not change in R4; R5 and R6 may code against them (section 9). A change needs the lead and a note in `docs/PEOPLE.md`. Where two plans defined the same thing differently, the form below is the one (conflict numbers C1 to C39 are in section 3.2). Every read is pure (no `g.rng`, no write, no `g.nextId`); every write runs only in an action or in a yearly step that is idempotent by a year stamp.

### 3.1 The exact names

**Person key and sid scheme** (S1 owns the key, S3 the grammar)

```ts
// src/game/kernel/person-ref.ts  (S1, layer 0; S1 adds its one entry line to docs/KERNEL.md, which kernel-acceptance.test.ts requires)
export function validSid(x: unknown): string | null                       // text that parses as 'person:' + x (the rule cash.ts:75-77 and world/people.ts:31 run today); 's77', 's9', 's-42' stay valid
export function personKey(p: Pick<Person, 'id' | 'data'>): string         // validSid(p.data.sid) ?? p.id
export function personEntity(p: Pick<Person, 'id' | 'data'>): EntityRef   // 'person:' + personKey(p), or 'pool:other' for an id that is no name
export function heirUnsafe(p: Pick<Person, 'relation' | 'data'>): boolean  // a valid sid on child, stepchild or grandchild; defined here (layer 0) so world/met.ts and world/kin.ts can use it (C36); materialize.ts re-exports it
// world/people.ts keeps `personRef` with the same signature and result (it calls personEntity); both names are frozen, new code uses personEntity (C7)
// src/game/world/sid.ts  (S3, layer 2)
export const SID_KINDS: readonly ['actor','model','music','astronaut','author','gamedev','sport','cls','tch','cow','boss','dat','frn','kin','dir','stf','exe','pol']  // append-only; R6 and R7 append, nobody renames
export type SidKind = (typeof SID_KINDS)[number]
export interface Slot { kind: SidKind; place: string; cohort: number; ord: number }
export function makeSid(slot: Slot): string      // '<kind>.<place>.<cohort>.<ord>', place [A-Za-z0-9_-]{1,12}, cohort 1850..2400, ord 1..9999, 40 characters at most, no colon; throws RangeError (code only, never saved data)
export function parseSid(x: unknown): Slot | null   // total
export function isSid(x: unknown): x is string
```

Derived limits (checked against `kernel/ids.ts` and `knowledge/keys.ts` now): a ref key is `[A-Za-z0-9._-]` segments, 52 characters at most, so a 40-character sid is a valid `person:<sid>`; an edge key `person:<sid>>person:<sid>` is at most 95 characters (cap 140); a know key `ppl:<sid>:<field>` is at most 64 (the parts allow dots, 40 characters each). Rules: the strict grammar applies to sids R4 mints and to Met keys; the reader stays lenient. `data.sid` is written by exactly two places: `materializePerson` (S8) and the heir-spouse rebuild in `continueAsChild` (L9, a new Person with relation `spouse`); never on an existing Person, a child, stepchild, grandchild or pet (S11 adds a token scan for `sid:` writes outside `materialize.ts` and `modules/heirs.ts`) (X15).

**Latent person and the Met store** (S3, S4, S6, S7)

```ts
// src/game/world/latent.ts  (S3)
export const LATENT_V = 1                        // facets 0..15 of streamKey(familySeed,'soc.latent',0,sid) are append-only and pinned by latent-golden.json; facet 15 ('path') is reserved and unused in R4 (C34)
export interface LatentPerson { v: 1; sid: string; gender: Gender; born: number; country: string; first: string; last: string; axes: Axes; stats: Record<StatKey, number>; skin: number; wealth: number; path: number }
export function latent(familySeed: string, slot: Slot, home?: string): LatentPerson     // pure; familySeed = worldSeed(g)
export function fromSeeded(seed: { sid: string; first: string; last: string; gender: Gender; born: number; country: string }, familySeed: string): LatentPerson   // never regenerates the name
// src/game/world/met.ts  (S4)
export interface MetRecord { f: string; l: string; g: 0 | 1; b: number; c: string; k: number; a: AxisTuple; y: number; s: number; w: number; fl: number; gr: number; ob: number; d?: number; r?: string; j?: string }   // r (role tag) and j (job or firm ref) are reserved for R6, sanitized, written by nobody in R4 (X17)
export type Tomb = readonly [y: number, gr: number, ob: number, fl: number, first: string, last: string, gb: number]
export type MetShard = { [key: string]: MetRecord | Tomb }
export function normalizeMet(raw: unknown): MetShard; readMet(g): Readonly<MetShard>; metRecord(g, key); metTomb(g, key); isTomb(x); metProblems(raw, people?): string[]; writeMet(g, next): void
export function metKinds(g: Pick<GameState, 'world'>): Readonly<Record<string, number>>   // records per sid kind, pure; R6 counts career peers with it (X11)
export const MET_CAPS: { readonly records: 400; readonly tombs: 200; readonly scan: 5000; readonly nodes: 24; readonly key: 40 }   // world/caps.ts
// src/game/world/met-names.ts (S6): takenNames(g), nameFree(g, first, last), resolveName(g, lat): { first; last; k }
// src/game/world/met-ops.ts  (S7)
export function touchMet(g: GameState, key: string, patch?: MetPatch, home?: string, identity?: LatentPerson): boolean   // identity added at Life's ask (X12)
export function markMet(g: GameState, key: string, stake: { fl?: number; gr?: number; ob?: number }): boolean          // SET semantics: a bit can be cleared (X12)
export function evictMet(g: GameState, key: string, why: 'idle' | 'cap' | 'gone'): 'dropped' | 'tomb' | 'kept' | 'absent'
export function tombstoneMet(g: GameState, key: string, stake?: { fl?: number; gr?: number; ob?: number }): boolean    // accepts a legacy person id
export function sweepMet(g: GameState): number        // called inside lodSweep, stamped by lod.y
export function isProtected(g: GameState, key: string): boolean
export function registerProtector(id: string, fn: (g: GameState) => Iterable<string>): void   // module load; keys are personKey values; a throw protects nothing
export function registerSalience(id: string, fn: (g: GameState, key: string) => number): void // returns f + s + abs(o) of the player edge only, no role weight (Met adds w x 10) (X13)
```

Met stakes: `fl` bits are 1 debt, 2 spouse, 4 heir, 8 company, 16 feud, 32 will (0 to 63). Life writes bits 2 and 4 with `markMet`; Edges write none and protect through `registerProtector` (X14).

**Person bridge** (S8)

```ts
// src/game/materialize.ts  (root file, domain life)
export interface MaterializeOpts { relation: RelationKind; age?: number; occupation?: string; relationship?: number; money?: number; livesWithPlayer?: boolean; contextId?: string; home?: string; role?: number; data?: Record<string, Json> }
export const SID_RELATIONS: ReadonlySet<RelationKind>        // every relation except child, stepchild, grandchild, pet
export function materializePerson(g: GameState, sid: string, opts: MaterializeOpts): Person | null   // draw-free: createPerson is given every field, so g.rng does not move and g.nextId moves by one; idempotent; null for a bad sid or a relation outside SID_RELATIONS
export function personOfSid(g: Pick<GameState, 'people'>, sid: string): Person | undefined
```

`createPerson` is NOT a wrapper (54 calls in 29 files, grep now): its draw order is a pin (S1). Opening `money` is the literal LEDGER.md rule 6 exempts.

**Persona** (S2, S9, S10)

```ts
// src/game/world/axes.ts (S2)
export const AXIS_IDS: readonly ['ambition','honesty','empathy','risk','steadiness']   // the order of AxisTuple and of MetRecord.a
export type Axes = Record<AxisId, number>      // whole numbers 0..100, 50 neutral
export const TRAIT_AXES, TRAIT_SETS; axesFromTraits(traits): Axes; labelsFromAxes(a, n = 2): string[]
export const VOICES: readonly ['warm','blunt','dry','anxious','grand','sly']; voiceOf(a: Axes): VoiceId
export const STAFF_AXES; axesFromStaff(traitId): Axes
// src/game/world/persona-me.ts (S9): PERSONA_KEY = 'persona.me'; personaOf(g): Axes; inferAxes(g): Axes; nudgePersona(g, axis: Exclude<AxisId,'ambition'>, by: number, why: string): number
// src/game/npc-state.ts (S10): axesOfPerson(g: Pick<GameState, 'world'>, p: Person): Axes     // the one name Edges calls (C7); ambition of the player is ambitionOf(g), effort.you stays (X18)
```

**The known mask** (U2, U3). R4 saves no mask. What a screen may know about a person is a pure function of `yearsKnown`, `relationship` and `livesWithPlayer`, plus rows in `flags.know` (already capped at 120):

```ts
// src/game/people-fog.ts (U2, domain life)
export const PEOPLE_CAPS: { readonly lookKeys: 5; readonly personality: 6; readonly connections: 6; readonly memories: 3; readonly forgetPerStep: 12 }
export function peopleFog(): boolean; usesProfile(p): boolean /* peopleFog() and alive and not a pet: the eager gate of the lazy profile chunk (U4) */; exposureOf(p): number; isClose(p): boolean; pplKey(p, field): string | null; readPerson(g, p, field, truth): Estimate | null; lookKeysOf(g, p): string[]; traitsShown(p): { shown: string[]; hidden: number }
// knowledge/kinds.ts: KeyKind.gone?(g: GameState, key: string): boolean
// hubs/people-facts.ts (U3): FactRow, PersonFacts, PERSON_SECTIONS (['facts','traits','personality','connections','rep','memories','notes']; 'rep' draws nothing in R4), personFacts(g, p)
// business/leader-fog.ts (U6): staffExposure, staffSkillRead, traitNamed, leaderRead, skillText; the `stf` key kind (label and gone only)
```

The `ppl` kind reads a Person of `g.people` by `personKey`; a Met-only record has no profile in R4 (R6 materializes first). The key rows are `ppl:<personKey>:<field>`.

**Edge model, memory and stamp** (E6, E7, E8)

```ts
// src/game/world/edges.ts (E6, layer 2)
export type LinkKind = 'kin' | 'rival' | 'company' | 'staff' | 'pair'      // append-only (R6 appends agent, manager, coworker, boss, classmate, teacher, mentor, employer); stored as the string, an unknown value is dropped by the normalizer
export interface Edge { t: number; f: number; r: number; s: number; o: number; y: number; l: number; m?: string[]; n?: string[]; d?: number[]; q?: [rung: number, since: number, cause: number]; dv?: [owed: number, ratePct: number, since: number, kind: number, paid: number]; c?: number; k?: LinkKind }
export type EdgeKey = string                  // 'person:p12>person:p3', at most 140 characters, both ends pass parseRef
export type EdgeMap = { readonly [key: EdgeKey]: Readonly<Edge> }   // what heirEdges and Life's carryEdges take (review: E6 defines it)
export function edgeLocalBound(e: Readonly<Edge>): boolean            // pure, from the edge alone: k set, an unpaid dv, q set, or a pinned memory; E6's putEdge and E7's orphan rule use it, E14's isBound widens it with the person-level cases
export function liveFeuds(g: Pick<GameState, 'world'>): number; openDebts(g: Pick<GameState, 'world'>): number   // pure counts of edges with a valid q (rung 1 to 4) and a valid dv (E6)
export function edgeKey(from: EntityRef, to: EntityRef): EdgeKey | null; readEdge(g, from, to): Readonly<Edge> | null; edgesOf(g, ref): readonly (readonly [EdgeKey, Readonly<Edge>])[]
export const MEMORY_KINDS: readonly string[]  // 40 ids, order fixed, append-only; U10 holds one phrase per kind, so an appended kind needs a phrase in the same commit
export function memoriesOf(e): readonly { kind: MemoryKind; year: number; w: number; by: 'ego' | 'them' }[]; salience(e, role?): number
export function remember(g: GameState, who: Person | EntityRef, kind: MemoryKind, o?: { w?: 1 | 2 | 3; by?: 'ego' | 'them'; with?: EntityRef }): boolean   // no-op unless socialOn(g)
export function putEdge(g: GameState, key: EdgeKey, patch: Partial<Edge> | null): boolean       // the one writer; null removes
export function socialOn(g: Pick<GameState, 'world'>): boolean; stampSocial(g: GameState): void  // world/social.ts: shard 'social' { v: 1, on: 1, y, fy, ay?, ms? } (ay: the year society.acts last ran; ms: the mentor baseline, at most 3 [ref, skill] pairs; both written by E10/E11, sanitized by E6)
// src/game/world/edge-heir.ts (E8)
export const EGO_COPY = { t: 0.5, f: 0.5, r: 0.5, s: 0.6, o: 1 }; export const HEIR_KEEP_KINDS: ReadonlySet<string>   // = new Set(['kin']) in R4 (X28)
export function heirEdges(map: EdgeMap, fromEgo: EntityRef, toEgo: EntityRef, year: number): EdgeMap     // pure; scales t, f, r by 0.5 and s by 0.6, never raises a field; memories keep at weight - 1; drops n, d, c AND dv; keeps q and k only for HEIR_KEEP_KINDS (C10)
export function memoryOdds(g: Pick<GameState, 'world'>, p: Person, group: 'repay' | 'peace' | 'ask'): number   // pure, within +-0.15, +-0.05 a kind
// src/game/world/edge-bound.ts (E14, layer 2)
export function isBound(g: GameState, key: EdgeKey): boolean     // society/contract.ts re-exports it (C4)
```

Caps: `EDGE_CAPS = { edges: 1200, memPerEdge: 8, memTotal: 4000, talkEdges: 120, feuds: 12, debts: 40, secrets: 40, holders: 6 }` (`world/caps.ts`, appended after `MET_CAPS`). `Edge.n` (callback keys told, 6) and `Edge.d` (topic ids said, 8) are the dialogue-memory store; nobody writes them in R4 (X27).

**The addRelationship shim contract** (E5)

```ts
// src/game/core.ts (layer 0)
export function addRelationship(g: GameState, p: Person, delta: number, kind?: RelKind): void   // body is the old expression verbatim (non-finite relationship or delta returns; Math.round(clamp(p.relationship + delta)))
export function setRelationship(g: GameState, p: Person, value: number, kind?: RelKind): void   // p.relationship = value, verbatim, for the 43 raw writes (the old right-hand side is passed unchanged, so a randInt inside it draws in the same order)
// src/game/kernel/relations.ts (layer 0)
export type RelKind = 'affection' | 'offence' | 'decay'; export interface RelChange { before: number; after: number; kind: RelKind }
export function applyRelationship(p: Person, delta: number, kind?: RelKind): RelChange | null; assignRelationship(p: Person, value: number, kind?: RelKind): RelChange
export function bindMirror(fn: (g: GameState, p: Person, change: RelChange) => void): void   // a HOOK, not a port (C3, X23). Unbound it does nothing. world/edge-mirror.ts binds it at load
```

The default kind is `affection` for a change of zero or more and `offence` for less; `decay` only where a caller says (the two yearly drift writes, the nepo mood steps). The mirror does nothing for a pet, an unstamped life, a zero change or a person with no valid ref; otherwise `edge(person>player).f === p.relationship` after every call.

**The family-act budget and the society door** (E9, E10, E14)

```ts
// src/game/society/contract.ts  (layer 3 door)
export function useFamilyAct(g: GameState, source: 'wealth' | 'nepo' | 'will' | 'use' | 'social'): boolean   // spends one of the year's 3 (g.yearActions['fam.act']); false when none is left
export function familyLive(g: GameState): boolean                               // pure; reserves 1 of the 3
export function socialNodes(g: GameState, p: Person): MenuNode[]                 // pure menu rows
export function runAct(g: GameState, act: SocialAct, key: EdgeKey, person: Person | null): ActPatch | null
export function debtsOf(g: GameState, ego: EntityRef): readonly { key: EdgeKey; owed: number; owedBy: boolean; kind: number }[]   // owedBy is true when the ego is the debtor (the key starts at the ego), false when the ego is owed; sorted oldest first
export function serviceDebt(g: GameState, key: EdgeKey, amount: number, token: string, from?: Purse): number   // books under 'support' (kind 0) or 'divorce' (kind 1) through cash.moveCash; returns what was paid (X24)
export const DEBT_KIND: { readonly loan: 0; readonly divorce: 1 }
export { isBound } from '../world/edge-bound'
export { betray } from './secret'            // love.ts calls it when an affair is found out (it creates the secret record); a non-society file never imports society/secret.ts directly (C39)
export { reconcileOdds } from './reconcile'   // will-amends.ts when stamped
export { liveFeuds, openDebts } from '../world/edges'   // created in E9 (the budget reserve reads them, so they cannot wait for E12); E10 to E12 add only their own lines
export function debtToken(kind: 'loan' | 'debt' | 'divorce' | 'estate', year: number, key: EdgeKey, extra?: string): string   // E10; `<kind>:<year>:<8 hex of fnv1a(extra|key)>`, under 40 characters: the ledger cuts a token at 80 (kernel/ledger.ts:89,177) and an edge key can be 95, so a token ending in the year or the key would lose it
```

**Acts, secrets, feuds, staff** (E10 to E13), the shapes R5 reads:

```ts
// src/game/society/acts.ts, secret.ts, feud.ts and business/staff-loyalty.ts
export interface ActCtx { g: Readonly<GameState>; key: EdgeKey; person: Person | null; year: number; roll: () => number }   // roll = outcomeStream(g, 'social', year, `${act}|${key}`)
export interface MoneyLine { from: 'player' | Person; to: 'player' | Person; amount: number; token: string }                   // booked as 'support' through cash.moveCash
export interface ActPatch { edge?: Partial<Edge>; remember?: { kind: MemoryKind; w?: 1 | 2 | 3 }[]; relationship?: { delta: number; kind?: RelKind }[]; money?: MoneyLine[]; log?: string; notice?: { title: string; text: string } }
export interface SocialAct { id: string; blocked(g: Readonly<GameState>, c: ActCtx): string | null; plan(g: Readonly<GameState>, c: ActCtx): ActPatch }   // both pure
export interface Secret { a: EntityRef; k: 'affair' | 'debt'; v: 1 | 2 | 3 | 4 | 5; h: EntityRef[]; y: number; p?: number }   // stored in the edges map under 'secret:<n>', cap 40, 6 holders; hop cap 2; a secret leaks at most once (p, the leaked year, ends it)
export function leakPass(g: GameState): void; betray(g: GameState, key: EdgeKey, severity: number): void; reconcileOdds(g: Pick<GameState, 'world'>, p: Person): number; mentorSettle(g: GameState): void
export function stepFeuds(g: GameState): void     // Edge.q rung 1..4, at most 12 live; liveFeuds is E6's counter
export function staffRef(s: KeyStaff): EntityRef; mgrRef(a: Asset): EntityRef; staffLoyaltyYear(g: GameState, a: Asset, b: BizState): void   // 'staff:<id>', 'mgr:<asset id>'
```

R5 owns reputation by group, leak timing beyond this pass and scandal stories, on storage it adds itself (an optional field of the `social` shard).

**Kin, life path and the heir carryover** (L2 to L11)

```ts
// world/life-path.ts: LIFE_MAX_AGE = 130; KinBase { sid; born; health }; LifeState { age; alive; died: number | null; unwell }; healthAt(base, age); ageTo(g: Pick<GameState,'lifeId'|'flags'>, base, year, opts?: { since?: number; died?: number }): LifeState
// world/kin.ts: KIN_CAPS = { kids: 6, records: 160, heirs: 7, persons: 30, deadYears: 10 }; Person.data keys spouseSid, kidSids (6), kinY, estateY, widowed, kin; readKin; kinView; kinHeirIds; kinPending; kinLabel; kinProblems
// kin.ts: adoptSpouse(g, anchor, identity?), adoptChild(g, anchor, identity), unlinkSpouse, syncKin;  modules/kin-estates.ts: settleKinEstates
// modules/heirs.ts: heirShareOf(n, childId); payPersonalDebts(n, old, available); carryReceivables(n, old, share); keptContacts(n, childId, oldEgo); carryEdges(n, oldEgo, heirRef, kept)
// divorce-debt.ts: openDivorceDebt(g, ex, owed); serveDivorceDebts(g);  events/will-strife.ts: strifeEdges(n, plan, heirId);  EstatePlan.recipients: { id: string; pct: number }[]
```

**The heir carryover contract**, in the order `continueAsChild` runs it (all of it only when `socialOn(g)`; an unstamped hand-over runs the old statements untouched):

1. Before the slices: bank loans as today; `payPersonalDebts` pays the late player's person-to-person debts (`debtsOf`, oldest first, `serviceDebt` with token `debtToken('estate', year, key, old.id)`); a shortfall lapses in one line and moves no money (no burn). The heir is never liable (D4(b)).
2. The seven `randInt` re-rolls keep their order and count (life.ts:1410, 1416, 1422, 1425, 1442, 1455, 1460). A direct kin's relationship is `round((roll + old) / 2)` and their `Edge.f` equals it (so a sibling at 10 becomes about 42, not 5; the owner decides, X33); pets as before. `n.rng` after the block equals the unstamped value.
3. The heir's spouse: if `heirP.data.spouseSid` has a record, the existing `createPerson` call (life.ts:1436) keeps its option shape so its draws happen, then name, gender, age and `data: { sid }` are overridden by the record, through `heirSpouseOverrides` in `modules/heirs.ts` (so `life.ts` carries no `sid:` token). If a Person with that sid already exists in `n.people` it is reset to `spouse` instead of creating a second holder of the sid (C21). A garbage link takes the old path.
4. Kept contacts: the old rule (NpcLife or family owner) plus bound persons plus the 12 best friends by edge salience 60 or more plus feud enemies; at most 40 added; relationship `max(25 if bound, round(0.5 x old))` capped at 60; an enemy `min(old, 30)`.
5. After `n.character = heir`: `carryReceivables` reads `readTies(n, p).owes` stamped by the old id before the switch and writes `owes x share` stamped by the heir (`updateTies`); `carryEdges` runs `heirEdges` over `kept>oldEgo`, re-keys to `kept>heirRef`, sets `f` to the final `Person.relationship`, merges into an existing `kept>heirRef` edge by field-wise maximum of `s` and a union of memories (C12), removes every edge that ends at the old ego, then calls `syncLegacy` for each kept person so the legacy numbers win; anger travels as `Edge.s x 0.6`. Notes of the living stay cleared. `readTies` and `readWl` stay owner-stamped, so `wealth.test.ts:446` and `will-feud.test.ts:756` stay green (C11).
6. `settleReading` (life.ts:1679, after `n.yearActions = {}` at :1521): `strifeEdges` between cut-out and favored relatives; one `useFamilyAct(n, 'will')` before either choice; exactly one of S_ASK and S_HEIR is ever queued.
7. Belt: if the heir Person has a valid `data.sid`, `foldAccount(n, person:<sid>, person:<id>, token)`; unreachable by S8, one line.

**Streams, facts, flag, caps**

| Frozen name | Owner | Rule |
|---|---|---|
| stream tags `social` and `life.path` | E10, L2 | both through `outcomeStream(g, tag, year, id)`; a jump re-rolls the year it lands in; each has a row in `test/stream-tap.ts` and a driver in `stream-isolation.test.ts` |
| facet keys `soc.latent` (S3) and `soc.kin` (L4) | S3, L4 | `streamKey` and `streamUnit` only (pure, no generator, no table row); documented in `docs/STREAMS.md` |
| fact kinds `life.wed`, `life.birth`, `life.death`, `life.estate`, `social.leak`, `social.feud` | L4, L5, E11, E12 | declared in `ModuleDef.facts`; Life emits at most 8 a year (`g.yearActions['life.facts']`); `social.*` severity 40 to 90 |
| build keys `social`, `peopleProfile` | P3 | `{ default: false, ships: '5.3.0' }`; flipped together with the version (X7) |
| world shards `met`, `edges`, `social` | S4, E6 | `met` and `edges` are entity slices (`e.met.<n>`, `e.edge.<n>`, 8 shards each); `social` rides the `world` chunk |
| module ids and sources | E7, E10, L4, L5, L7 | `world.edges` (close/5), `society.acts` (close/6; one yearly entry), `life.kin` (life/37), `life.estates` (life/55), `life.debts` (money/75); the phases and the free orders were read from `kernel/registry.ts:30-47` and `modules/yearly-aging.ts` now. The `society` phase stays empty and 45 stays free: `test/kernel-aging.test.ts` registers its own module at life 45 and pins that it sits between `relationships` and `sharedProjects` (:92-93, :112), pins `world.frontier` then `yearly.history` as the first two entries (:73, :113) and `effort.you` right after `household` (:74); `kernel-parity.test.ts:217` pins `world.frontier` first. A module with two aging entries is renamed `<id>#0` and `<id>#1` (registry.ts:303-304) and the group tables are keyed by module id, so every new module has one entry |
| pace families | E9 | `pop.kin.feud`, `pop.kin.lender`, `pop.kin.leak`; `PACE.maxFamilies` 80 (63 used after R4, 17 free for R5 and R6) and `TEXT_MEM_LIMITS.families` 160 |
| Person.data keys | L3, S8 | `sid` (text <= 40), `spouseSid`, `kidSids`, `kinY`, `estateY`, `widowed`, `kin` (<= 20 characters) |

### 3.2 Conflicts found and how each is resolved

| # | Conflict | Resolution |
|---|---|---|
| C1 | Registry names a build key `society` and a world flag `society.on`; Edges names `social`, shard `social`, `socialOn`; Life follows whatever `socialOn` reads | One stamp: key `social`, shard `social`, `socialOn(g)`. The Registry's lead action 3 is withdrawn; the Met kernel needs no switch because nothing calls it until Life does (X6) |
| C2 | Registry S5 and Edges E6 each say they land the first production entity slice | S5 first (70 lines, a spike with a recorded fallback); E6 depends on S5 and copies the row style; neither writes the other's plumbing (X10). `kernel/slices.ts` and the codec already carry `chunk: 'entities'`; no `src` file uses it (grep now) |
| C3 | E5 defines the port `social.mirror` and binds nothing; the binder arrives in E7. `hub-entry.test.ts` ("every port is bound after entering through aging and menus", read now) would be red for E5, E6 and part of E7. R3 hit the same trap and chose hooks (R3 D8) | The mirror is a hook in `kernel/relations.ts` (`bindMirror`), not a port. No row in `EXPECTED_PORTS` (hub-entry.test.ts:62; the plan said :57) or `PORTS` (kernel-acceptance.test.ts:17) (X23) |
| C4 | E14 puts `isBound` in `society/bound.ts` (layer 3) and has `world/edge-write.ts` (layer 2) use it. `test/layer-kit.ts` makes `world/` layer 2 and a new upward import fails (`new-upward`, baseline may only shrink) | `isBound` lives in `world/edge-bound.ts` (layer 2) and reads only types, edge fields, `Person.data` raw, `readHoldings`, `npcFirmId` and `edge-legacy.ts`; `society/contract.ts` re-exports it (X25) |
| C5 | E14 says `world/lod.ts:178` is the Registry's guard and S7 does not edit it | That guard protects index rows of Persons in `g.people`, which are already guarded (lod.ts:120-128 read now). The real guard for sid-born people is S7's `sweepMet`, so the hook is dropped and E14 registers a protector (C6) |
| C6 | S7 expects Edges and Life to call `registerSalience`, `registerProtector` and `markMet`; no task in either plan does | E14 registers `edges.bound` (the persons at the far end of every bound edge) and `edges.salience` (`f + s + abs(o)`). Life marks spouse and heir with `markMet` bits 2 and 4 in L4 (X13, X14) |
| C7 | Edges needs `axesOf(p)`; Registry offers `axesOfPerson(g, p)`; `personRef` and `personEntity` both exist after S1 | `axesOfPerson(g, p)` is the name (E10's seam calls it, so E10 depends on S10); `personRef` stays as an alias of `personEntity` |
| C8 | Life asks `touchMet` for an `identity` argument and `markMet` for set semantics; the Registry plan has neither | Accepted; S7 amended (X12) |
| C9 | Life asks `serviceDebt`, `Edge.dv[3]` kind 1 for a divorce and a pass that skips it; the Edges plan has none | Accepted; E10 exports `serviceDebt` and `DEBT_KIND`; its yearly pass serves kind 0 only; L7's `serveDivorceDebts` serves kind 1 (X24) |
| C10 | E8 says `heirEdges` keeps `dv`; L6 passes receivables by the will's share through the legacy record and says "no duplicate from heirEdges" | `heirEdges` drops `dv`. The legacy record is the authority; `carryReceivables` writes it, `syncLegacy` mirrors it. A debt the late player owed was paid or lapsed in step 1, so no `dv` survives a hand-over |
| C11 | E4 says the pins `wealth.test.ts:446` and `will-feud.test.ts:756` are expected moves; L says they are not | They do not move. Both set `g.character.id` and call the owner-stamped readers directly (read now); the carryover re-stamps a claim, never a reader. Inline fix in E4. Note: the first test's title ("heirs inherit the people, not their parent's ... loans") is stale for stamped lives (X18) |
| C12 | L10 writes up to 36 strife edges with a feud rung `q`; E6's `EDGE_CAPS.feuds` is 12 and its normalizer would strip the surplus silently | Strife edges set `s` always and `q` only while `liveFeuds(g) < 12`; the 36 is an edge cap (X31). `carryEdges` merges on collision (section 3.1) |
| C13 | E9 says `usePopup` "also spends the shared key"; `nepo-year.ts:554` spends `usePopup` for an outcome NOTICE and the plan's unit is a choice popup; `wealth.ts:73` `popupBudget` only returns a number, so asks queued under it would never spend the shared counter | The shared key is spent only where a choice is queued: wealth asks (once per ask queued), `nepo-asks.ts:463`, `nepo-life.ts:143`, `nepo-year.ts:561` (baton), `will-feud.ts:234`, the `luxury-family.ts` party or crash choice, the reading choice, `A Lender Calls`, `A Falling Out`. The nepo outcome notice keeps only its local `nepo.pop` cap (X40) |
| C14 | E9 maps source `social` to group people; the module id is `society.acts` (a module entry's source is its module id, R3 section 2.5); E7, L4, L5, L7 add modules with no group row | Group tables and `MODULE_SOURCES` are keyed by module ids: `world.edges`, `society.acts`, `life.kin`, `life.estates`, `life.debts`, all group `people` (X42) |
| C15 | E9 raises `TEXT_MEM_LIMITS.families` to 160 and lists four pinned pace tests; `test/notice-acceptance.test.ts:83,300` also pins `families: 120` | E9 edits that pin too; and `test/text-memory.test.ts:46` asserts the exact limits object and `:436-448` the 700-node full memory, so six files in all (review, section 8) |
| C16 | E16 flips `social` "early, not on release day" and keeps `ships: '5.3.0'`; `test/flags.test.ts:61-83` fails unless a flag with `ships <= package version` defaults on and the rest default off; `package.json` says 5.2.0 | Flip and version bump are one commit; so is `peopleProfile` (X7). Because the flip cannot be early, E16 follows all four acceptance tasks and a rehearsal runs first (X7) |
| C17 | U2 calls `flagOn('peopleProfile')` in `peopleFog()`; the plan lets the lead add the key "before U4"; E7 needs `social` the same way | P3 adds both keys, before U2 and E7 |
| C18 | The UI plan says "Registry, Edges, then this track last" and also "E13 merges after U6" | No track-level order. First resolved as "no order, the hunks are 20 or more lines apart"; the review found the HIRE hunks of U6 and E13 share :222-224, so E13 now depends on U6 (X1, sections 1.4 and 2) |
| C19 | Life says the UI track changes `relationLabel` (core.ts:845); the UI plan does not list it. A materialized niece reads "Friend" today (`relationLabel` returns `Friend` for `friend`; `kinWord` in nepo-state.ts:166 already reads `data.kin`) | U9 owns it, with a test (X38) |
| C20 | E10 and E13 name `test/stream-tap.test.ts` and `test/staff.test.ts`; U6 and U7 leave test names UNVERIFIED | `stream-tap.ts` is a kit, `staff.test.ts` does not exist; replaced by files that exist (section 11) |
| C21 | L9 builds the heir's spouse with `createPerson` and `data: { sid }`; the Registry rule says `materializePerson` is the only writer; if a Person holding that sid exists (a materialized kin) a second holder shares the ledger account | Allowed as the second named writer; reset an existing holder instead of creating (X15) |
| C22 | R5 preflight proposes `p.data.said`; E6 reserves `Edge.d` (8 topic ids) and `Edge.n` (6 callback keys) | `Edge.d` and `Edge.n` are the store; `p.data.said` is not created (X27) |
| C23 | The roadmap "player sees" lists dialogue that shifts and a banker who is the minister in 2040 | D.11 is R5 and slots for ministers are R6 D.6 and R7; flagged (X46) |
| C24 | Wrong cites: `aging.ts:37` (reset is at :38), `will-amends.ts:34` and `:39` (they are :35 and :40) | Fixed in the plans |
| C25 | Three money scans (S11, E15, L12) with three file lists; the UI track has none | Each scan globs its own directories; U11 adds a four-line scan case over `people-fog.ts`, `hubs/people-*.ts`, `business/leader-fog.ts`; S11 adds a token scan that `data.sid` is assigned only in two files (X50) |
| C26 | Four tasks append rows to `ceiling-list.json` at different anchors ("after frontier-caps", ":34", "after waves-per-year") | One order at the tail: S11, E15, L12, U11 (section 2) |
| C27 | The roadmap and the R5 and R6 preflights want an interface freeze note early; `docs/PEOPLE.md` is written by S11, the last Registry task | S3 creates `docs/PEOPLE.md` with the grammar, facets and caps; this section is the authority until then (X51) |
| C28 | L8 sat in lane `estate` after L7, and the plan merges the whole estate lane before L9 (a hot-file order on `life.ts`), so L7 and L8 sat on the critical path for no code reason | L8 moved to `main` after L5 (it needs only L1 and E7); L9 waits for L6 only, the one estate task that shares `life.ts:1496-1497` with it |
| C29 | E3 and E4 shared lane `gold`, so two 900-line oracles ran one after the other | E4 moved to lane `side` |
| C30 | S6 lists `allBrands` among consumed names; R5 plans to make brands lazy | S6 imports no `data/brands` and no `data/locales` (names come from the pools of `world.ts`); the ten brand names are a copied list pinned equal to `rivals.ts:142-145` by a test (X20) |
| C31 | E10 says the rebase for `society->life` is "`cash.ts` only"; E11's mentor reads `npc-state.ts` and E10's seam calls `axesOfPerson` (also `npc-state.ts`) | The rebase prints `cash.ts` and `npc-state.ts` edges; the lead approves exactly those two files (X26) |
| C32 | The bundle allowance is +60,000 gzip bytes and 23 bytes remain; the plans estimate 18 to 27 KB each (UNVERIFIED proxy of 8.2 gzip bytes a line) | P1 re-captures the baseline at v5.2.0 and leaves the +60,000 limit alone; lazy loading of the profile is planned in U4 and a raise needs the owner (X48) |
| C33 | The over-cap world drop removes the largest shard; `edges` would be it; Registry and Edges each ask for a fixed order but not the same | P2 writes one order, with `ledger`, `holdings`, `met`, `edges`, `social` never dropped while anything else can be (X47) |
| C34 | S3 reserves facet 15 ("path seed for Life's `ageTo`"); L2's `ageTo` uses `outcomeStream(g, 'life.path', y, sid)` and never reads the facet | Facet 15 stays reserved and unused; documented |
| C35 | Life plan quotes `Edges 17,000 nodes`, Registry `9,600` (10,401 after the record's `r` and `j` fields were counted), Edges `+20,000 nodes` roadmap line; the sum with today's world passes the 40,000 cap (section 5) | P2 (X47) |
| C36 | S8 defines `heirUnsafe` in `materialize.ts` (a root file, layer 3); L3's `world/kin.ts` (layer 2) names it in `kinProblems`. A layer-2 import of `materialize.ts` is an upward import (`world/met.ts` reports the same fault without importing it) | `heirUnsafe` is defined in `kernel/person-ref.ts` (S1, layer 0); `materialize.ts` re-exports it; `world/met.ts` and `world/kin.ts` import it from the kernel |
| C37 | E10's `debtsOf` returns `owedBy: boolean` with no definition; L6 relies on the direction ("debts with the ego as debtor") | defined in section 3.1: `owedBy` is true when the ego is the debtor (the edge key starts at the ego) |
| C38 | L4 mints `kin.<country>.<year>.<ord>` from `g.year`; `makeSid` throws a `RangeError` for a cohort outside 1850..2400 by design ("code, never saved data"), and `g.year` is saved data | the kin sid builder returns null outside that range and `adoptSpouse` / `adoptChild` return null with no half link; a hostile-year case is in L4's red tests (X16) |
| C39 | E11 has `love.ts:912-918` and `will-amends.ts:82,215` call into `society/secret.ts` and `society/reconcile.ts`; `love.ts` is domain `life` and `will-amends.ts` domain `events`, so a direct import adds a `life->society` and an `events->society` pair (only `contract.ts` imports are free, `test/layer-kit.ts` `contractPath`) | everything a non-society file calls goes through `society/contract.ts`: `socialNodes`, `useFamilyAct`, `familyLive`, `debtsOf`, `serviceDebt`, `DEBT_KIND`, `isBound`, `betray`, `reconcileOdds`, `liveFeuds`, `runAct` (section 3.1) |

## 4. The single popup budget (3 family choices a year)

### 4.1 What exists today (read now)

| Hook (phase and order) | Cap today | What it counts | Deferrable at the year close | Code |
|---|---|---|---|---|
| `wealth` (money/70) | 3 (`WEALTH_POPUP_CAP`; `TIER_POPUP_CAP` is `[0,1,2,3,3]`; 1 in prison) | choices: each big ask, one bundle for all the small asks, and "All Grown Up" (`askAboutGrownKids` takes one off the budget) | `wealth.ask` and `wealth.bundle` yes; the grown-kids script no | events/wealth.ts:73, 268-290, 344-380; hubs/year-close.ts:35 |
| `familyUse` (money/80) | none (one party-or-crash decision a year by construction) | 1 choice | no | shops/luxury-family.ts:530, 621, 664 |
| `nepo` (money/90) | 2 (`NEPO_POPUPS`, key `nepo.pop`) | an ask (nepo-asks.ts:452-463), a life event (nepo-life.ts:134-143), the baton prompt (nepo-year.ts:559-561) and ONE outcome notice (nepo-year.ts:554) | no | business/nepo-year.ts:28-38 |
| `willFeuds` (money/100) | 1 (`will.scene`) | one scene | no | events/will-feud.ts:234 |
| the reading of the will (once a life) | none | one notice and one of S_ASK or S_HEIR (never both: will-estate.ts:578 needs `!heirCut`, :605 needs `heirCut`) | no | events/will-estate.ts:540-621 |

So a rich family life can queue up to 3 + 1 + 2 + 1 = 7 choices a year today. `DEFERRABLE_SCRIPTS` is the three literals `events.random`, `wealth.ask`, `wealth.bundle`; every other script is "kept and counted first" by the year close (hubs/year-close.ts:35, read now). The close's own 3 only decides which of the deferrable choices wait.

### 4.2 The R4 rule

- One counter: `g.yearActions['fam.act']`, cap 3, reset with the other year actions at `aging.ts:38`. Spend: `useFamilyAct(g, source)`. Reserve: `familyLive(g)` (a family firm with employed relatives, someone cut from the will, an open feud or debt) holds 1 of the 3 against the two sources that run before `nepo` (`wealth` at money 70 and the luxury `use` choice at money 80): between them they may spend at most 2 on such a life (`fam.early`), so `nepo`, `will` and `social` can take the reserved slot (review: without this `use` would take it first); a life with none of these gets exactly today's wealth popups.
- The unit is a **choice**. A notice is not counted (notices keep the year close's separate budget, `noticesMax 5`). So the nepo outcome notice (nepo-year.ts:554) keeps only its local `nepo.pop` cap and does NOT spend `fam.act` (C13). The shared key is spent at: each `presentAsk`, one `presentBundle`, `askAboutGrownKids`, the luxury party-or-crash choice, `nepo-asks.ts:463`, `nepo-life.ts:143`, the baton prompt, `will-feud.ts:234`, the reading's choice (L10), `A Lender Calls` (E10) and `A Falling Out` (E12).
- The old per-source caps stay inside the 3 as `min(old, 3 - reserve - used)`.
- `DEFERRABLE_SCRIPTS` gets no new entry. The kin scripts are kept and counted first, as nepo and will are today. The R6 preflight asked for the opposite; it is declined: a family choice that waits a year changes the thing it asks about, and the close's budget is for choices that can wait (X40).
- A feud scene (E12) needs both `useFamilyAct` and `will.scene` unspent, so there is one popup a year across the two ladders. The reading at the hand-over runs in a fresh year (`n.yearActions = {}` at life.ts:1521 comes before `settleReading` at :1679).
- Unstamped lives (every v5.2.0 save, and their heirs) keep 3 + 1 + 2 + 1. A stamped life is capped by the shared counter, not by the sum of the old caps.

### 4.3 Who builds it

E9 builds `society/contract.ts` and `society/budget.ts` (the counter, `useFamilyAct`, `familyLive`, the reserve) and edits the hooks in `wealth.ts`, `nepo-year.ts`, `nepo-asks.ts`, `nepo-life.ts`, `will-feud.ts` and `luxury-family.ts`. E10 (`A Lender Calls`), E12 (`A Falling Out`) and L10 (the reading) call `useFamilyAct`; none of them adds a counter. Proof: `test/family-budget.test.ts` (E9: a stamped tier-4 life over 30 years never exceeds 3 family choices in a year, the reserve leaves a slot when live, unstamped counts equal the E3 wealth and nepo rows, and a scripted saturated year in which every source is eligible at once, because natural play may never exercise the sources together and "never above 3" could pass vacuously: exactly 3 queued by script id, `wealth` and `use` at most 2 together, the reserved slot to `nepo`, `will` or `social`, every later call false, the nepo notice not counted, a feud scene and `will.scene` never both; the same household for 40 years through the real yearly step, an idempotent second run of each yearly entry, and a control run with `familyLive` false that gives exactly the E3 wealth counts), `test/heir-strife.test.ts` (L10), `test/social-feud.test.ts` (E12, one popup a year across the ladders), and the 120-year probe of E15.

### 4.4 Pace and text memory

Three pace families join the engine `kin` (`pop.kin.feud`, `pop.kin.lender`, `pop.kin.leak`): 60 + 3 = 63 of `PACE.maxFamilies` 80, leaving 17 for R5 (offers, gossip, composer) and at most 4 for R6. `TEXT_MEM_LIMITS.families` goes from 120 to 160. The raise is made once, by E9; six test files pin the old numbers (section 8). It was 60 of 60 before (R6 preflight, confirmed by `pace.test.ts:22`).

## 5. Platform tasks (the lead owns these)

None of these has a planner. Each blocks the tasks named. Commits follow the rules of the roadmap (explicit pathspecs; the attribution lines the session gives).

**R4-P1. Bundle baseline re-capture at v5.2.0; the limit stays +60,000.** `scripts/bundle-budget.mjs` measures the gzip of the JS and CSS that `index.html` loads before any dynamic import. The baseline is still v5.0.0 (2,909,121 bytes, `scripts/bundle-baseline.json`); the R5 and R6 preflights ran the script on the v5.2.0 build (built at e4cde49) and got 2,969,098, which is +59,977 of +60,000: 23 bytes. The first eager source line of R4 fails the gate. P1: build a45d3a1, run `node scripts/bundle-budget.mjs --update` (it rewrites `initialGzBytes` only and keeps `allowGrowthBytes`, `bundle-budget.mjs:12,175-181`), edit `measuredAt` by hand to `"v5.2.0 (main at a45d3a1)"`, commit the baseline, and leave `allowGrowthBytes` at 60,000. The headroom is then a fresh +60,000 for the four tracks together; no per-track allowance is set, and `test/bundle-budget.test.ts` stays untouched. The plans' estimates (24 KB Registry, 18 KB UI, 27 KB Life, none given for Edges) and their sum of about 114 KB at an unverified 8.2 gzip bytes a line are UNVERIFIED and are not a basis for the limit; they only say that a breach is likely, so the relief is planned work and not a fallback: U4 loads the profile cards through `lazyView` from the start, and the lead measures with `node scripts/bundle-budget.mjs` at B3 and B4 (section 1.5) and prints the delta in each merge commit. **Raising the limit needs the owner's explicit OK** with the measured delta and the reason, recorded in `docs/RELEASE-v5.3.0.md`; the raise edits the pin `test/bundle-budget.test.ts:364-372` (the title "...the 60,000 byte allowance" and `expect(b.allowGrowthBytes).toBe(60_000)`) in the same commit as the baseline, with the lead's reason in a comment; that test scans its own source for U+2013 and U+2014, so the comment uses plain hyphens. Done before S1.

**R4-P2. World node cap, budget and drop order.** `WORLD_NODE_CAP` is 40,000 (`world/caps.ts:11`) and over it `normalizeWorld` drops the LARGEST shard whole, in live play at the settle step as well as on load (`world/state.ts:153-160`, read now). Worst cases by the plans' own caps: today's shards about 19,000 nodes (the R5 preflight's sum by the caps in code; the R2 maximal world is 11,414 nodes as the Registry plan measured it, and the frontier cap of 3,600 and facts of about 2,800 are not in that figure), `met` 10,401 (400 records of 22 nodes, 200 tombstones of 8, the root), `edges` about 17,000, secrets 560, `social` about 16: about 47,000, so the dropped shard would be `edges`, and every debt and memory with it. P2 sets, with the arithmetic written in a comment next to the constants: `WORLD_NODE_CAP` 80,000; `WORLD_BUDGET` nodes 55,000 and bytes 800,000 (starting numbers; the P2 test measures the maximal world with `met` and `edges` at their caps and sets the budget to the measurement plus 15% when that is larger); an allotment table `R4 about 29,000, R5 +6,000, R6 +6,000`; and a fixed over-cap order in `normalizeWorld`: drop `facts`, `frontier`, `lod`, `people`, `firms`, `homes` first (they are indexes or news and are rebuilt or bounded), never `ledger`, `holdings`, `met`, `edges`, `social` while anything else can go, largest first inside a class, ties by name. The save side needs no change: `met` and `edges` are entity slices with their own caps (`world.met` 12,000 nodes and 300,000 characters, `world.edges` 24,000 and 420,000), and `MAX_CHUNKS` is 96 (save-codec.ts:63), of which these two use 16. Before S4 and E6.

**P2 moves four tests and a document (review: the plan listed one).** Raising the cap fails more than the pin at `test/world-budget.test.ts:116`, so the P2 commit also carries: (a) `test/world-state.test.ts:197-221`: the `toBe(40_000)` pin becomes the new constant, the shard sizes are scaled from it (for example 0.75, 0.5, 0.625 and 0.375 of the cap, so the tie, the three-shard and the "fits exactly" cases keep their meaning), and new cases for the classes: `facts` and `frontier` go before `edges` even when `edges` is the largest; `ledger`, `holdings`, `met`, `edges` and `social` survive while any other shard can go; largest-first with ties by name holds inside a class (the test registers its synthetic shards as the file already does and needs the real names for the class cases). (b) `test/world-repair.test.ts:66-70`: the junk is sized from the constant, for example `junk(WORLD_NODE_CAP * 6)` plus `junk(WORLD_NODE_CAP * 4)`, so the precondition `nodes > WORLD_NODE_CAP * 10` keeps holding (300,000 + 200,000 nodes would be under 10 times an 80,000 cap). (c) `docs/WORLD.md:102-104` and `:143-147`: 40,000 becomes 80,000, the class drop order is described, and the budget numbers 25,000 and 450,000 become the new ones. (d) the title and pin at `test/world-budget.test.ts:3,115-116` and the maximal-world builder (:255-305). Checked now and left alone: `test/world-acceptance.test.ts` asserts `< WORLD_NODE_CAP` after each hostile year (:166), which a larger cap keeps true; whether each of its twelve hostile worlds still exceeds the new cap or is dropped by its own reader or by the unknown-key rule is UNVERIFIED, so P2 re-reads the builders (:125-160) and scales any that were sized against 40,000 from the constant. P2's checks: `npx vitest run --maxWorkers=1 test/world-state.test.ts test/world-repair.test.ts test/world-budget.test.ts test/world-acceptance.test.ts`. The P2 commit lists `docs/WORLD.md` and both new test edits in its files. P2 also updates the roadmap R4 block (`State +20,000 nodes` becomes the allotment above) and records the revised line and node totals in `docs/RELEASE-v5.3.0.md` (P6).

**R4-P3. Flag keys.** `FLAG_DEFS` (flags.ts:27-48) is a closed list that only the lead edits. P3 adds `social` and `peopleProfile`, each `{ default: false, ships: '5.3.0' }`, and changes `test/flags.test.ts:88-98` from nine keys to eleven, once for all R4 (three plans asked for keys). Comments follow `flags.ts:6-18`: a flag that changes simulation output is stamped into the save at life creation (`social`: the shard `g.world.social`, E7) and never read from `FLAGS` at run time; `peopleProfile` changes presentation only. Before U2, U8, E7.

**R4-P4. CI to 8 shards.** `node scripts/ci-shard.mjs --plan 4` (run now): 1,391 s of worker time a shard, about 11.6 minutes at 2 workers, against the roadmap's 12-minute target; `--plan 8`: 696 s. R4 adds about 25,500 test lines (+10% on 257,406), so 4 shards would pass 12 minutes. P4: `.github/workflows/ci.yml` lines 33, 55, 61, 63, 74 and the 4 in `node scripts/ci-shard.mjs --verify 4`, `docs/CI.md`, and a timings refresh from a green run (84 test files are untimed and weigh a default 5 s). The roadmap planned 8 shards from R5; the numbers say R4 (X49). Any time in wave 1.

**R4-P5. `moved-tests.md` and the protocol.** The plans cite `docs/superpowers/plans/2026-10-26-r4-v5.3.0/moved-tests.md`; it does not exist and this cross-check was not asked to create it. P5 creates it with a heading per track (`registry-persona`, `edges-acts`, `life-heirs`, `people-ui-fog`, `platform`) and the table format of `2026-10-22-r3-v5.1.0/moved-tests.md`, and copies section 8 of this file into it as the expected rows. It also writes the re-record protocol (X2) at the top. Before E4 records, and before P2 and P3, which add the first rows (review: the graph now says so).

**R4-P6. Release.** After E16: `docs/RELEASE-v5.3.0.md` (what the player sees; that only NEW lives get the stamped behaviour and old saves and their heirs keep v5.2.0 behaviour (X6); the flags; the caps; the measured bundle delta at B3 and B4 and any owner decision to raise the limit; the revised line and node totals of the R4 block; known limits: dialogue memory and non-kin recurring people come in R5 and R6, cousins and the popup in-laws of the player's own spouse stay per-popup names (X46), the player-facing half of the persona is R5 (X18), F18 is only partly closed (the payer is a named pool, a named employer is R6 A.K3), and the "Design 7 departures in R4" table of this file), the refresh of `scripts/test-timings.json` (new files: `registry-acceptance` about 30 s, `social-acceptance` about 25 s, `life-acceptance` about 25 s, `people-ui-acceptance` about 30 s), and the roadmap brought up to date: the R4 block (nodes, lines, hours) gets the revised totals, and the R5 "Offers, reputation, composer" block gains `personaOf`, `nudgePersona` and `axesFromStaff` as its inputs (X18). **Record the v5.3.0 save fixture** (review; roadmap F.1 "one new fixture per release"; precedent `save-v5.0.0-heavy.json.gz` and `save-v5.1.0-heavy.json.gz`, the latter recorded by 99ea72e): after the tag-candidate commit and before the merge and the tag, record `test/fixtures/save-v5.3.0-heavy.json.gz` with the `docs/SAVE.md` recipe ("One fixture per release"). Use `git archive <release commit>`, because the tag does not exist yet. Build the `heavy` mode under Node 22, twice, and require byte-identical output; run the life with `social` and `peopleProfile` on, so it carries `g.world.met`, `g.world.edges`, the `social` stamp and kin records. If the heavy life produces no edge debt, secret or feud, add a scripted `stamped` mode to `scripts/save-fixtures.ts` (22 exes, a loan, a divorce debt, a secret, a feud and one completed heir hand-over) and run it on the release tree only, never on the E1 tree, which has no edges API. The commit message names the commit it was built from and the digests. `test/old-saves.test.ts` picks the file up with no edit; add one line to the "One fixture per release" paragraph of `docs/SAVE.md` and one line to the header list and cases of `test/save-v3-schema.test.ts`. The release notes' Known limits say that `save-v5.2.0-social` is the pre-stamp fixture and `save-v5.3.0-*` is the stamped fixture that R5 and R6 (and the nightly old-saves job) must keep loading. Then one full CI on the merged tree, the exit-gate walks (section 7), merge, tag.

**Golden-test ordering (the "oracle gate", X4).** Recorded on the unmodified tree and merged before E5, in this order: E1 (kit, social save fixture, ratchet, mutation check) then E2, E3, E4 in parallel; L1 (needs the kit); U1 and the pins commit of S1 (they need nothing). Then P2 and P3 (they do not touch behaviour), then E5. A pin is never re-recorded to make a change pass: a deliberate move takes `RECORD_REASON`, a `moved-tests.md` row and the lead.

**Version bump and the flip.** `package.json` goes 5.2.0 to 5.3.0 in the same commit that sets `social` and `peopleProfile` to `default: true`, because `test/flags.test.ts:61-83` (`releaseRuleProblems`) fails any flag whose `ships` is at or below the package version and defaults off, and any flag above it that defaults on. That commit is E16.

## 6. Decisions

These answer every open question of the four plans (35 in all, mapped at the end) and every conflict of section 3.2, consistently with the roadmap decisions D4, D17, D2 and D15 (table at the end). They override the plans.

### Process

**X1. Graph, lanes, merge order.** The 56-node graph of section 1 is the plan. Lanes are as listed; a task never shares a worktree with a task it does not depend on. Track priority at a conflict: Registry kernel, Edges, Life, UI. E13 follows U6 (both edit the HIRE lines of `staff.ts`, review); there is no ordering between S10 and the Edges tasks (C18).

**X2. Fixtures and the re-record protocol.** R3's section 4 applies unchanged. (1) A task that moves a fixture re-records it on its own track branch with the reason in the commit and a row in `moved-tests.md`; that recording is provisional. (2) Nobody merges a fixture by hand: at each track merge the integrator takes the release side, runs `golden.mjs check` to read which slices moved, confirms they are the ones the track may move, and re-records from the merged tree under Node 22 with the reason `merge of <track>`. (3) Allowed moves: Registry none (no module, no hook, no key written in a played life; if one moves the task is wrong); UI none; Edges `kernel-parity.json` aging list (+`world.edges` at E7, +`society.acts` at E10); Life `kernel-parity.json` aging list (+`life.kin` at L4, +`life.estates` at L5, +`life.debts` at L7). The aging list grows from 39 to 44 entries and moves only by those new ids. The `lives`, `menus` and `views` parts of `kernel-parity.json` must not move before E16. **`test/kernel-aging.test.ts` is a constraint, not a move (review).** It registers its own module `ext.k9between` at life/45 and pins that it sits right between `relationships` and `sharedProjects` (:92-93, :112), pins `world.frontier` then `yearly.history` as the first two aging entries (:73, :113) and `effort.you` right after `yearly.household` (:74); `kernel-parity.test.ts:217` pins `world.frontier` first. So no module takes life/45 or the society phase: `life.kin` is life/37, `life.estates` life/55, the mentor settle lives in the single `society.acts` entry. L4, L5, L7, E7, E10 and E11 run `test/kernel-aging.test.ts` in their checks. `golden-digests.json`, `r2-parity.json`, every `social-parity-*.json` and the heir-parity rows move only at E16. (4) Floats are cut to 9 significant digits; every recording runs under the Node major CI uses (22).

**X3. `moved-tests.md`.** Created by P5, not by a planner; implementers add real rows, the "expected" rows are section 8.

**X4. The oracle gate.** E5 depends on E2, E3, E4, L1, S1 and U1 (section 1.4). It is the only way "numbers are unchanged" is provable.

**X5. Models.** Sonnet for every task. One heavy task at a time, after Sonnet failed it once: L9 (the hand-over; the Life plan names it, and the roadmap calls A.K8 and the `npc-lives.ts` edits the riskiest) or E6 (first production entity slice); the `npc-lives.ts` hunks of S10 are a few lines each, Sonnet first, Opus only if the S1 grid moves. Never two Opus sessions at once.

### Stamp and flags

**X6. One stamp: new lives only.** The build key is `social` (`{ default: false, ships: '5.3.0' }`), the saved stamp is the world shard `social` (`{ v: 1, on: 1, y, fy }`), written by `createNewLife` when the key is on, read everywhere through `socialOn(g)`. The Registry's `society` key and `society.on` flag are withdrawn. `flags.ts:11-14` ("a flag that changes simulation output must be stamped into the save at life creation and read from the save") is met: the key only decides whether a new life is stamped. Every v5.2.0 save, every unstamped life and every heir of one keeps v5.2.0 behaviour byte for byte and gets no Settings opt-in (answers Edges Q1, Q2, Registry Q6, Life Q3). `docs/RELEASE-v5.3.0.md` says so.

**X7. The flip is the release commit, and it cannot be early.** `releaseRuleProblems` (test/flags.test.ts:61-83) ties a flag's default to the package version, so E16 changes `package.json` to 5.3.0 and sets both `social` and `peopleProfile` to `default: true` in one commit. It runs after S11, E15, L12 and U11. Because the re-record is large (every golden slice that holds a new life, the 104 test files that call `createNewLife`, the three repetition gates), E16 starts with a rehearsal on a scratch branch: `setFlags({ social: true, peopleProfile: true })` in the shared test setup, run `golden.mjs check`, `quiet-acceptance`, `text-kit`, `text-repeat` one at a time, and list what moves; the real commit then re-records and fixes at the source (more phrasings, a state row, a longer gap), never a threshold. The gate for the rehearsal is B4 (section 1.5), so the news arrives before B5, not after it.

**X8. One flag for the whole UI track.** `peopleProfile` gates the profile, the staff and CEO reads and the cockpit tiles (answers UI Q1). It stays off until the exit-gate walk passes (section 7). If the walk fails, the release commit leaves `peopleProfile` at `ships: '5.4.0'` and `default: false` (the rule allows any `ships` value) and the rest of R4 ships.

### Registry and persona

**X9. Shard `met`, an entity slice.** The Met store is the shard `g.world.met`, not extra rows in `g.world.people` (that shard strips every field but `{ id, seen }`, world/people.ts:48-53, and four places assume "people = the 80 intimate"). Edges live in a sibling shard `edges` with the same slice style. If the S5 spike shows the world chunk still rewritten, `met` falls back to a derived `world` row and the commit records the measured bytes a tap writes (SAVE.md measures the world chunk at about 520 KB after 50 years); the lead accepts that only with P2's chunk numbers in hand (Registry Q1, Q2).

**X10. S5 first, E6 follows.** S5 spikes the first production entity slice (no `src` file defines one today; `test/save-codec.test.ts:395-447` is the only test). E6 depends on S5. If S5 slips by more than a day the lead may cut the edge; the first of the two to merge owns the pattern note in `docs/SAVE.md` and the other copies it (answers Edges Q9).

**X11. Who writes first.** The Life track: L4 (NPC spouses and babies of stamped lives) and L9 (the heir's spouse). Classmates, coworkers, dating candidates, strangers, election opponents, directors, `KeyStaff`, `Manager` and the nepo Outsider wait for R6 D.6 (roadmap X24). Roadmap D2 holds: Met cap 400 (200 tombstones), at most 160 of them kin records, 32 career peers a life counted by sid kind with `metKinds` (R6).

**X12. `touchMet` identity and `markMet` set semantics.** Accepted at Life's ask (answers Life Q4): `touchMet(g, key, patch?, home?, identity?: LatentPerson)` builds the record from the given identity (from `fromSeeded`) so the face the legacy code already drew never changes; `markMet` sets the stake fields to the given values, so a bit can be cleared when a link ends.

**X13. Protector and salience contract.** `registerProtector(id, fn)` and `registerSalience(id, fn)` are called at module load; keys are `personKey` values (a legacy person is protected by its id); the same id with another function throws; they run in id order; a function that throws protects nothing and ranks 0, and a test says so. Salience is the edge part only, `f + s + abs(o)` of the edge `person>player`; Met adds its role weight `w x 10`, so a role weight is never counted twice. E14 registers `edges.bound` and `edges.salience` (C6). Life registers none.

**X14. Who owns obligation and grudge.** Edges (`Edge.o`, `Edge.s`, `Edge.dv`) and the legacy records. The Met fields `ob` and `gr` are written only by `tombstoneMet(g, key, stake)` and by S7's synthetic tests; Life writes only `fl` bits 2 (spouse) and 4 (heir) with `markMet`. A Met record whose person is the far end of a bound edge is kept by the protector, not by a stake. E15 adds the integration case (a sid-born debtor with an edge debt survives 30 yearly sweeps) so "eviction never drops a debt" is proved across the two tracks, not twice in halves.

**X15. `data.sid`.** Written only by `materializePerson` (S8) and by the heir-spouse rebuild in `continueAsChild` (L9), always on a new Person with a relation in `SID_RELATIONS`. Never on an existing Person, a child, stepchild, grandchild, pet or the former player, because the ledger already names `person:<data.sid>` (cash.ts:75-77) and a sid stamped later renames an account. S11 token-scans `src/game` for any other `sid:` assignment. L9 resets an existing holder of the sid to `spouse` rather than creating a second one (answers Edges Q8).

**X16. Minting kin sids.** `kin.<country>.<year>.<ord>` with `ord` one above the highest ord among Met records and tombstones with that prefix, at most 9999. A full Met refuses and leaves no half link. The builder returns null for a year outside 1850..2400 (it never calls the throwing `makeSid` with saved data) (C38).

**X17. Reserved room for R5 and R6.** `MetRecord.r` (role tag, `[a-z][a-z0-9.-]{0,15}`) and `.j` (job or firm ref, a valid ref of at most 52 characters): optional, sanitized, written by nobody in R4, 22 of the 24 nodes a record may use. Latent facet 15 stays reserved. `Edge.n` and `Edge.d` are reserved and sanitized. `SID_KINDS`, `MEMORY_KINDS` and `LinkKind` are append-only.

**X18. Persona (roadmap D15).** Ambition is `ambitionOf(g)` (effort/persona.ts:169); `effort.you` is NOT moved into `persona.me` (the departure from effort-core.md section 2 is accepted, Registry Q5); `persona.me` holds at most four nudges within +-15 and 40 stamps. The ambition shown from age 18 and the yearly posture are R3's and are done. The title of `wealth.test.ts:446` ("heirs inherit the people, not their parent's allowances or loans") is stale for loans on stamped lives; the test itself stays true and green, and `docs/KIN.md` says which part changed. **The player-facing half of D.2 moves to R5 with the composer (review):** inferred persona feedback, narrator pools, guilt costs for acting against honesty or empathy, how NPCs read the player (design 7.3) and the move of `Manager.integrity` and `KeyStaff.trait` onto axes have no R4 task. R4 ships the store (`persona.me`), the readers at parity and `axesOfPerson`, unwired: `nudgePersona`, `personaOf` and `axesFromStaff` have no caller in any R4 plan (grep), and the `persona-nudge` ceiling row probes the store. The R5 "Offers, reputation, composer" track consumes them and names the owner of the two stored fields. Decision D15's "inferred persona" is therefore half delivered in R4 and the release notes say so.

**X19. S10 is one task.** It depends on S1, S2, S4, S9 (S4 for `readMet` and `metRecord`, S9 for the lane order). Its `will-core.ts` hunk (407-441) is 30 lines or more from the Edges hunks (371-376, 584), and the nepo files are touched by no Edges task (grep now), so it does not wait for the Edges merge (answers Registry Q9).

**X20. Names.** One name is not two people is enforced at promotion only, between promoted people; `rosterAt` names stay authoritative (R6's rivals keep their names). No new module imports `data/brands` or `data/locales` (R5 makes them lazy); names come from the pools of `world.ts`. The ten brand names are a copied list, held equal to `special/kit/rivals.ts:142-145` by a test.

**X21. If S1 slips.** U2 may use a local `pplId(p)` (`data.sid` else `id`) and swap to `personKey` in one line (answers UI Q4). The strings are equal for every person made before `sid` exists.

### Edges and acts

**X22. Authority stays where it is.** `Person.relationship`, `married`, `spouseName`, `kids` (Life), `WealthTies` and `Wl` remain the source; edges and kin records mirror them, `edge.f === p.relationship` is an invariant for every non-pet person with an edge, and a later release flips the authority once it has run live. No existing reader moves.

**X23. Hook, not port.** The mirror is `bindMirror` in `kernel/relations.ts`. A port defined in E5 and bound in E7 would fail `hub-entry.test.ts` for three tasks (R3 chose hooks for the same reason).

**X24. Debts (roadmap D4).** One record in one place: `Edge.dv = [owed, ratePct, since, kind, paid]`, kind 0 a loan, 1 a divorce; no separate `oblig` shard. Person-to-person principal, service and interest are booked under `support` (a divorce under `divorce`) through `cash.moveCash`; no new reason, no mint, no burn; `loan.private` is a one-line append if the owner wants it (Edges Q3, Q4, Life Q5). Heirs are never liable; the late player's person debts are paid from the estate after bank loans, oldest first, and a shortfall lapses with no burn; debts owed TO the player pass through the legacy record by the will's share (X34). `heirEdges` drops `dv`.

**X25. `isBound` is a layer-2 function.** `world/edge-bound.ts`, re-exported by `society/contract.ts`. E14 does not edit `world/lod.ts` (C4, C5).

**X26. The layer baseline.** One `UPDATE_LAYER_BASELINE=rebase` in E10 for the new pair `society->life`. The lead approves exactly the printed edges: `society/*` to `cash.ts` and `society/*` to `npc-state.ts` (the seam and the mentor). Any other added edge is a defect of the task.

**X27. Dialogue memory.** The store is `Edge.d` (8 topic ids) and `Edge.n` (6 callback keys) on the 120 highest-salience edges; `heirEdges` clears them. `p.data.said` is not created. Unstamped lives have no edges, so R5 decides what they get.

**X28. Append-only enums and the heir link rule.** `HEIR_KEEP_KINDS = new Set(['kin'])`: only kin links survive the switch; rival, company, staff, pair and R6's career links name the late player's position and are dropped (D4: standing and memory do not pass). R6 may append a kind to the set with a reason.

**X29. Facts.** The kinds of section 3.1. Life emits at most 8 a year. `social.leak` is emitted by E11 on a leak pass, `social.feud` by E12 when a feud reaches rung 3 or 4 or ends (E12 gains this, about 30 lines). Both are declared in the `society.acts` module's `facts`. R4 does not use the `news` phase.

**X30. Goldens and seeds.** The oracles (E1 to E4, L1, S1, U1) record constant `[seed, year]` tuples searched once with `findSeed` at record time, as `test/effort-parity-kit.ts` does. `test/seed-pins.test.ts` counts only lines matching `\bseed:\s*\d+` (read now), so tuples and `makeTestGame(n)` positional arguments pass. Every other new test uses `findSeed(pred)` and never writes `seed: <digits>` (Edges Q6). The goldens (about 3,400 test lines) are charged to E1 to E4, not to D.12's 700 (Edges Q7). They run in the fast tier.

**X31. Strife and feuds.** L10's strife edges carry `s` always and a feud rung `q` only while `liveFeuds(g) < 12`; the 3 a person and 36 in all are edge caps, not feud caps. The will ladder (`Wl`) is untouched; a `Wl.cut` pair stays on it and counts toward the 12.

### Life and heirs

**X32. Mirror, not flip** (Life Q1): see X22.

**X33. The blend** (Life Q2). A direct kin's hand-over relationship is `round((roll + old) / 2)`, so the seven `n.rng` draws stay in order and the heir starts with a sane number; `t`, `r` and a non-kin's `f` copy at 0.5 and `s` at 0.6 through `heirEdges`, but a direct kin's `f` equals their blended `Person.relationship` (L9 sets `f` from it), so it is not half of the old number: a sibling at 10 becomes about 42, not 5, and the random 55-95 re-roll the roadmap names (F17) survives half-way. This departs from the roadmap's Acceptance 3 wording and stays an owner decision (Life Q2): the roadmap line is amended once the owner agrees, and if the owner picks the strict 0.5 the fix is to keep the seven draws, discard the rolled value for kept kin and set `relationship = round(0.5 x old)`. L9 tests the blend explicitly.

**X34. Receivables** (Life Q6). They pass by the will's share (`heirShareOf`), re-stamped to the heir; the rest is forgiven in one line; a cut-out heir carries nothing; allowance, history and marks stay blank.

**X35. Cases left open by the plans, all accepted as written** (Life Q7, Q8, Q11): the ex's shortfall to the player after a divorce stays forgiven (no income path for an NPC ex); the houses and cars of non-heir siblings and a sibling who already owns a firm stay cash until an NPC property entity exists; relatives employed at a firm the designated sibling adopts (nepo-year.ts:456-469): L1 row (e) records what happens and pins it; R4 changes nothing there and lists it under known limits in `docs/KIN.md` (UNVERIFIED whether they lose their jobs until L1 records).

**X36. Layer homes** (Life Q9). `modules/heirs.ts` and `modules/kin-estates.ts` (layer 4, where `life.ts` already sits); `ASSEMBLY_FILES` is not changed.

**X37. NPC wages** (Life Q10). R4 asserts a booked, bounded, named-pool payer: `wage` from `pool:employers` (reasons.ts WORK group), under a ceiling row `npc-wage` (3.5 x typical income is UNVERIFIED; L12 measures and sets it). A named employer entity is A.K3 (R6).

**X38. Materialized kin** (Life Q12). `relation: 'friend'` plus `data.kin` (at most 20 characters, `niece`, `sister-in-law`); no `RelationKind` member is added (it would touch every exhaustive switch). A string `data.kin` also makes `yearlyNpcLife` give the person a full NpcLife (`npc-lives.ts:241`: keyed decisions, wages from `pool:employers`, marriage rolls) every year; that is deliberate (a niece has a life), bounded by `KIN_CAPS.persons` 30 and the `npc-wage` ceiling, tested for a `g.rng` draw and for the nepo-coworker collision in L5, and stated in `docs/KIN.md` (review; settle before U9 codes `relationLabel`). `relationLabel` (core.ts:845) returns the capitalized `data.kin` for a `friend` that has one and whose `data.kin` matches `/^[a-z][a-z -]{0,19}$/` (a hostile value reads as `Friend`); U9 owns the change and a test, and a check that no v5.2.0 fixture person is a friend with `data.kin` (`nepo` kin are coworkers: nepo-state.ts:127).

**X39. Hand-over guards.** The sid fold of L11 is kept (Registry Q4, one line and a test); L9's spouse reuse and the edge-collision merge of section 3.1.

### Popups and text

**X40. The popup budget** is section 4: choices only, `fam.act`, reserve 1, old caps inside, `DEFERRABLE_SCRIPTS` unchanged.

**X41. Pace and text memory** (Edges Q5). `PACE.maxFamilies` 60 to 80 and `TEXT_MEM_LIMITS.families` 120 to 160, once, in E9; six test files move (section 8). The three kin families are real families; none is folded into `ask`.

**X42. Group tables** are keyed by module ids (`world.edges`, `society.acts`, `life.kin`, `life.estates`, `life.debts`), all group `people`, in `hubs/year-plan.ts`, `ui/components/logModel.ts` and `MODULE_SOURCES` of `test/quiet-integration.test.ts`; the task that adds a module adds its three rows.

### People UI and fog

**X43. No new free source, no Briefing change** (UI Q2, Q3). Exposure is the only free path; the investigator stays flat per scope. A cheaper "acquaintance" source is a Knowledge decision and is not added. Briefing crowding is bounded (12 rows) and not fixed.

**X44. The known mask is exposure** (design 6.6 asks for a saved 2-bit mask per axis in the registry row; R4 departs, see "Design 7 departures in R4"). Nothing is saved per person: `exposureOf` is pure from `yearsKnown`, `relationship` and `livesWithPlayer`; an heir recomputes it from the re-rolled relationships (life.ts:1370-1377). The eight rule rows are approved with the numbers of the UI plan (face .12/.02, health .22/.15, mood .28/.30, mind .32/.03, cash .50/.25, skill .30/.08, worth .55/.20, hired skill .20/.05), `KeyKind.gone` is approved, and the exposure guard of `knowledge-unwired.test.ts` is an allow-list of exactly two files, `src/game/people-fog.ts` and `src/game/business/leader-fog.ts` (review: U6's leaf must pass `exp:` to `know()`, so a one-file guard would go red at U6; routing the leaf through `people-fog.ts` would add a business-to-life import in the 59-module business cycle). `docs/KNOWLEDGE.md` says exposure is wired by two readers, the person profile and the hired-staff and CEO reads, and by no screen beyond them. The profile itself is a lazy chunk (U4, `usesProfile` is the eager gate).

**X45. Profile scope.** At most 6 connection rows and 3 memory lines; the card position `rep` is reserved and draws nothing (R5 D.7); `MEMORY_PHRASE` holds one phrase per `MEMORY_KINDS` entry and its test fails the day R6 appends a kind without a phrase (by design).

**X46. Three roadmap "player sees" lines R4 does not deliver as worded.** "Dialogue shifts with what happened": D.11 and E.T4 are R5; R4 delivers odds that shift (E8 `memoryOdds`) and memory lines on the profile (U10). "The banker met in 2031 is the minister in 2040": it needs live writers for non-kin people (R6 D.6) and politics slots (R7); R4 delivers the mechanism and proves it with kin and the heir's spouse (same name after eviction, reload, heir and fork). "Real in-laws and cousins": cousins and the popup in-laws of the player's own spouse stay per-popup names in R4 (`events/wealth-family.ts:48-57` `inLaw()` and `cousin()` build a name per popup from `chance(g, ...)` and `randomFirstName(g, ...)`, `:507` and `:531` call them, and no task touches them; routing them through the registry would change their `g.rng` draws, move every seeded wealth popup and every seeded life, and add repetition-gate risk in a file the Edges shim already changes under golden parity). R4 delivers real in-laws and nieces only for NPC weddings, babies and estates (L4, L5): a sibling's spouse and baby are Met records that become Persons only through an estate, and U9 shows the spouse by name and a kid count from today's data on a living family. The exit-gate reader (the owner) is told in `docs/RELEASE-v5.3.0.md`.

### Platform

**X47. World caps** are P2 (section 5): 80,000 nodes, budget 55,000 and 800,000 bytes as starting numbers, an allotment table, a fixed drop order that never drops `ledger`, `holdings`, `met`, `edges`, `social` while anything else can go. The same commit moves `test/world-state.test.ts:197-221`, `test/world-repair.test.ts:66-70`, `test/world-budget.test.ts:3,115-116` and `docs/WORLD.md:102-104,143-147` (review).

**X48. Bundle.** P1 re-captures the baseline at v5.2.0 and leaves `allowGrowthBytes` at 60,000 (review: the earlier default of 120,000 doubled the owner's standing budget on an UNVERIFIED estimate of about 114 KB, and `--update` keeps the allowance, so it would have been a deliberate hand edit). The lazy-load relief is planned work: the profile cards (`FactRow`, `people-facts`, `people-web`, `people-memory`, in `PersonProfile.tsx`) load through `lazyView` from U4 on, behind a gate `ui/people/lazy.tsx` and a zone in `test/lazy-zones.test.ts`; the engine code (the society acts, the edge store, the kin code, the registry) is synchronous game logic called from menus and has no lazy form (UNVERIFIED that none exists), so it stays eager. The lead measures with `node scripts/bundle-budget.mjs` at B3 and B4 and prints the delta in each merge commit. **Rule: raising the limit needs the owner's explicit OK** with the measured delta and the reason, recorded in `docs/RELEASE-v5.3.0.md`; a raise edits the pin `test/bundle-budget.test.ts:364-372` in the same commit as the baseline. The owner is shown the bundle delta at the playthrough (section 13). R5's K.8 re-captures again after its diet.

**X49. CI** goes to 8 shards in R4 (P4).

**X50. Static scans.** Each acceptance task scans its own directories: S11 (`world/sid.ts`, `latent.ts`, `met*.ts`, `axes.ts`, `persona-me.ts`, `materialize.ts`, plus the `sid:` assignment scan), E15 (`society/`, `world/edge*.ts`, `world/social.ts`, `business/staff-loyalty.ts`), L12 (`kin.ts`, `divorce-debt.ts`, `world/kin.ts`, `life-path.ts`, `mortality.ts`, `modules/heirs.ts`, `kin-estates.ts`, `kin-years.ts`, `divorce-years.ts`, `events/will-strife.ts`), U11 (`people-fog.ts`, `hubs/people-*.ts`, `business/leader-fog.ts`). Each forbids `.money` or `.cash` writes, `['money']`, `Object.assign(` on a person, `personPurse(...).add(`, `bookMint`, `bookBurn`, `earnIncome`, `spend`, `addMoney` and `Math.random`, has a self-test and a non-empty file list. `kernel/relations.ts` and `kernel/person-ref.ts` are added to E15's list. S11's `sid:` scan allows `materialize.ts` and `modules/heirs.ts` only (L9's `heirSpouseOverrides` lives in the second).

**X51. The freeze note starts early.** S3 creates `docs/PEOPLE.md` with the grammar, the facets and the caps; S4, S7 and E6 extend it; S11 completes it. Until S3 merges, section 3 of this file is the freeze note (R5 and R6 asked for one within the first hours).

**X52. R5 and R6 stack on `release/v5.3.0`** at the freeze point F1, never in parallel from main (section 9).

### Roadmap decisions as they apply

| Roadmap decision | Default taken in R4 | Where |
|---|---|---|
| D4 Heirs and debts or career assets: kin debts pass through holdings, career assets pass, standing and memory do not | Kin debts: the late player's person debts are paid from the estate (the holdings table is a derived index with no debt field, world/holdings.ts, so the debt lives on `Edge.dv`); receivables pass by the will's share; secured debt already travels with the asset record; career assets are R6; standing and memory do not pass (`HEIR_KEEP_KINDS`, memories at weight - 1 only for kept kin) | X24, X28, X34 |
| D17 NPC web and family initiative: player-centred plus kin, feuds and company links, only what is known; family acts unprompted inside 3 popups a year | Edges are player-centred plus structural kin, pair, rival, company and staff links; NPC-NPC edges only for marriage, feud and shared company (3 a person); the profile shows known facts and a capped connections card; family acts inside `fam.act` | X31, X40, X44, X45 |
| D2 Who gets a persistent record: only touched strangers, 400 named and 32 career peers a life | Met cap 400 records and 200 tombstones, kin at most 160; promotion on contact; peers counted by sid kind (R6) | X9, X11, X17 |
| D15 Player personality and ambition: inferred persona, ambition shown from 18, visible yearly posture | Inferred `persona.me` store, ambition is `ambitionOf`, nudges bounded, readers at parity, all unwired; the player-facing half (inferred persona feedback, narrator pools, guilt costs, NPC reads of the player) moves to R5 with the composer; posture and ambition display are R3's | X18 |

### Design 7 departures in R4

The roadmap (line 8) says design sections 1 to 16 are fixed and the design wins on design questions. R4 departs from design 7 and 6.6 in six places. Each was settled by a cross-check decision with no owner decision number, so each is listed here with its reason, marked "lead default taken, listed for the owner at the playthrough", and repeated in `docs/RELEASE-v5.3.0.md`. There is no separate spec amendment file.

| Design text | What R4 does | Reason (path:line) | Decision |
|---|---|---|---|
| 7.4 `addRelationship` becomes a shim onto affection and resentment; `WealthTies.owes` and `Wl.anger` migrate into obligation and resentment on first read | `Person.relationship` stays the authority; the edge mirrors it at every write (hook in `kernel/relations.ts`); `owes` and `anger` are mirrored at their two writers and read through a pure overlay; nothing migrates on read | a write on first read breaks menu purity (`readTies` `wealth-core.ts:220` and `readWl` `will-core.ts:329` run under `deepFreeze`); flipping the authority moves every seeded life (edges-acts.md, "Where the roadmap is stale" item 4) | X22, X23; lead default taken, listed for the owner |
| 7.5 NPC marriages and children become real records, replacing `spouseName` and `kids` | the records mirror `married`, `spouseName` and `kids`, which stay authoritative | four writers and about a dozen readers, one of them moves money (`npc-lives.ts:369`); a later release flips the authority once the records have run live (life-heirs.md, "Not in this track") | X22, X32 (Life Q1); lead default taken, listed for the owner |
| 6.6 sightings are a saved 2-bit mask per axis in the registry row | nothing is saved; `exposureOf` is pure from `yearsKnown`, `relationship` and `livesWithPlayer` | a registry row is normalized to `{ id, seen }` (`world/people.ts:48-57`) and a field in `Person.data` is copied to heirs against the personal-knowledge reset (`life.ts:1371-1380`) (people-ui-fog.md, "Where the roadmap is stale" item 6) | X44; lead default taken, listed for the owner |
| 7.2 named people live in `g.world.people`; `createPerson` becomes a wrapper that materializes a slot first | a new shard `g.world.met` (an entity slice) and `materializePerson`; `createPerson` is untouched | the `people` shard is an index of `{ id, seen }` rows and four places assume "people = the 80 intimate" (`lod.ts:127`, `invariants.ts:141-155`, `budget.ts:69-70`); `createPerson` has 54 call sites in 29 files and a fixed `g.rng` draw order (`people.ts:166-187,202-207`) (registry-persona.md, "Not in this track" and section 3) | X9; lead default taken, listed for the owner |
| 7.8 and 5.10: mentorship and reconciliation are `practice` runs | bespoke capped formulas (mentor gain at most x1.15, `reconcileOdds` from `peaceOdds` and `memoryOdds`); the focus-week hookup is left to R6 | the `practice` machinery is not in the R4 tracks and the capped formulas are pinned by probes (edges-acts.md, E11 and E12 Behaviour) | E11, E12; lead default taken, listed for the owner |
| 7.6 favor capacity is the giver's reach and wealth and it decays; staff loyalty includes whistleblowing | favor capacity is reach (strength `min(1, 0.5 + reach / 24)`) with a 3-year call-in cooldown; no wealth term and no decay of obligation; whistleblowing is not built | there is no wrongdoing state to blow the whistle on (`business/state.ts`; edges-acts.md, "Not in this track"); `Edge.o` is also the mirror of `WealthTies.owes`, so a decay would fight the E7 legacy sync (see the review notes: skipped) | E10, E13; lead default taken, listed for the owner |

### Open questions of the plans, mapped

| Plan | Question numbers and decisions |
|---|---|
| Registry (9) | Q1 X9; Q2 X9; Q3 X11; Q4 X39; Q5 X18; Q6 X6; Q7 X47, X48; Q8 X13; Q9 X19 |
| Edges (9) | Q1 X6; Q2 X6, X7; Q3 X24; Q4 X24; Q5 X41; Q6 X30; Q7 X30; Q8 X15; Q9 X10 |
| Life (12) | Q1 X22; Q2 X33; Q3 X6; Q4 X12; Q5 X24; Q6 X34; Q7 X35; Q8 X35; Q9 X36; Q10 X37; Q11 X35; Q12 X38 |
| People UI (5) | Q1 X8; Q2 X43; Q3 X43; Q4 X21; Q5 X1 |

## 7. Acceptance map (roadmap lines 244 to 269, the decision table, the Global Constraints)

Each line has one primary owner, the task whose named test fails if it breaks. "Supporting" proves a half or guards a neighbour. File names are the plans'.

| Roadmap line | Primary owner and test | Supporting |
|---|---|---|
| **Acceptance 1.** A 120-year seeded probe: no NaN, bounds held | S11 `registry-acceptance.test.ts` (met and persona.me in caps); E15 `social-acceptance.test.ts` (3 stamped lives: edges, memories, debts, secrets, feuds); L12 `life-acceptance.test.ts` (3 stamped lives, two hand-overs) | U11 `people-ui-acceptance.test.ts` (hostile records, 3 lives of 40 years) |
| ... conservation: estates settle once | L5 `kin-estate.test.ts` (exact split, once, `expectConserved`); L12 (each dead Person with `estateY` holds under $1 or has its token row) | L6 `heir-debts.test.ts`, E15 (strict ledger drift 0) |
| ... NPC wages need a payer | L12 `npc-wage` ceiling row and case (every NPC wage booking has `pool:employers` as counterparty and stays under the ceiling) | X37; named employer is R6 A.K3 |
| ... the same names for the same seed | S11 (replay, `structuredClone`, JSON reload, heir `continueAsChild`, `arriveInPast` fork give equal Met keys and names); L12 (equal names after heir, reload, clone and fork) | S3 `world-latent.test.ts` and `latent-golden.json`, S6 `world-met-names.test.ts`, L4 `kin-records.test.ts` |
| **Acceptance 2.** Eviction never drops a debt, spouse, heir or company link | S7 `world-met-ops.test.ts` (each stake bit, an obligation, a grudge, a Person, a holder and a registered protector survive 40,000 touches and the idle sweep; a stake-only record becomes a tombstone that keeps the obligation); E14 `edge-bound.test.ts` (25 exes and one debtor; 1,200 edges plus 100x offered evicts only unbound edges, order-independent) | L4 `kin-records.test.ts` (kin flags while the link stands), L9 `heir-carryover.test.ts` (bound persons kept), **E15 integration case (new, X14)**: a sid-born debtor with an edge debt survives 30 yearly sweeps |
| **Acceptance 3.** Heir switch: kin edges copy at 0.5 of trust and affection, 0.6 of resentment. **Exception, owner decision pending (Life Q2, X33):** a direct kin's `Person.relationship`, and so `Edge.f`, is `round((roll + old) / 2)`, not 0.5 x old; `t`, `r` and `s` of all kept edges, and `f` of non-kin, copy at 0.5 and 0.6. The roadmap Acceptance 3 and F17 wording is amended to say this once the owner agrees | E8 `edge-heir.test.ts` (the pure copy, exact constants, never raises a field, 100x input inside `EDGE_CAPS`); L9 `heir-carryover.test.ts` (the switch: kept contacts, `f === relationship`, the blend test for old = 10, 50 and 90 with three roll sequences, a non-kin friend at `max(25 if bound, round(0.5 x old))`, `Edge.t` and `Edge.r` at 0.5 and `Edge.s` at 0.6 of old, a sibling with anger 80 has `Edge.s` 48) | E4 `heir-parity.test.ts` (baseline L9 moves on purpose) |
| ... debts survive through the estate | L6 `heir-debts.test.ts` (a $120,000 divorce debt and a $30,000 loan paid from a $1M estate in that order; an insolvent estate lapses the rest; a friend's $40,000 owed passes at the will's share) | L7 `divorce-debt.test.ts` |
| ... a sibling keeps the firm instead of cash (the pin at `nepo-year.test.ts:392` changes on purpose) | L8 `sibling-firm-held.test.ts` (mortgaged firm and a firm at 18 to 20 held when stamped). The pin itself already changed in R0-13: `nepo-year.test.ts:393-397` asserts `npcCompany` held and money unchanged (read now), and `sibling-firm.test.ts` keeps the four cash cases for the unstamped path. Not an R4 move | L1 row (e) |
| ... a divorce deficiency becomes an obligation (F36) | L7 `divorce-debt.test.ts` (`dv` kind 1 equal to the pinned `remaining`, 20% of cash a year, 10-year lapse, the ex dies, the player dies and L6 settles it) | L1 pins the legacy deficiency |
| **Acceptance 4.** `Person.relationship` keeps today's numbers (golden parity) | E2 `relationship-parity.test.ts`, `love-parity.test.ts`; E3 `wealth-parity.test.ts`, `will-parity.test.ts`; E4 `nepo-parity.test.ts`, `heir-parity.test.ts`, `social-lives-parity.test.ts`; each byte-identical unstamped (E5) and stamped (E7) | E1 `social-mutation.test.ts` (three files go red on a one-point drift), `relationship-ratchet.test.ts`; S1 `registry-pins.test.ts` (`createPerson` draw order); L1 `life-pins.test.ts` |
| ... one popup budget of 3 family popups a year | E9 `family-budget.test.ts`: the natural-play probe and, because that may never exercise the sources together, a scripted saturated year (every source eligible at once; exactly 3 queued by script id, `wealth` and `use` at most 2 together, the reserved slot to `nepo`, `will` or `social`, every later call false, the nepo notice not counted, never a feud scene and `will.scene` together), a 40-year repeat with an idempotent second run, and a control run with `familyLive` false that equals the E3 wealth counts | L10 `heir-strife.test.ts` (the reading spends one slot), E12 `social-feud.test.ts`; E15 |
| ... menus pure under `deepFreeze` | one purity case in every task; E15 `edge-purity.test.ts` (every menu and reader of the society layer); U11 case (b) (every screen of the UI track) | S3 to S9, L3 to L5, `replay-purity.test.ts` |
| **Probe.** Favor farming (cap by reach, decay, one call-in per person per 3 years) | E10 `social-acts.test.ts` (100 attempts over 40 people in 3 years give at most one call-in each); E15 ceiling row `favor-callin` | |
| **Probe.** Marriage for wealth (shown wealth is not spendable) | E15 `social-acceptance.test.ts` case (b) owns it (review): marry an NPC with $50M, play 10 years, divorce and, separately, widow; the player's net worth gain is at most what the existing settlement rule allows (`love.ts:1643`, half the wealth gap times 0.5 to 1, paid from the ex's own cash at `:1672`), the ledger has no mint and the books balance, and 100x the NPC's wealth raises the gain by at most 100x and never above the spouse's own cash (the gain is real cash that moves by `moveCash`; a shown wealth moves nothing). The review's draft said "the same gain at 100x"; the code (`love.ts:1643,1672`) scales the gain with the wealth gap, so the bound is the spouse's cash, not a constant. The U3 and U11 purity case (a read or a shown row changes no money: JSON equal before and after) is true of any pure read and no longer counts as proof of this probe | existing `love-parity` settlement grids |
| **Probe.** Loan-shark spiral | E10 `social-loan.test.ts` (40 years of default never passes 3 x principal, cash never negative); E15 ceiling row `loan-cap` | |
| **Probe.** Gossip hop cap 2 | E11 `social-gossip.test.ts` (hop count never above 2 in 10,000 simulated leaks); E15 ceiling row `gossip-hops` | |
| **Probe.** Adoption to inherit (estate taxed) | L12 `life-acceptance.test.ts` (an adopted child counts in `willSlices` and `kinHeirIds`; `tax.estate` is booked once) | |
| **Probe.** Mentorship bonus at most x1.15 | E11 `social-mentor.test.ts`; E15 ceiling row `mentor-gain` | |
| **Player sees.** The banker you met in 2031 is the minister in 2040 | **Not deliverable in R4** (X46). The mechanism: S11 (a person touched in 2031, evicted, met again in 2040 has the same name; tombstone keeps it) | R6 D.6 and R7 supply the writers |
| **Player sees.** Dialogue and odds shift with what happened | Odds: E8 `edge-odds.test.ts` (`memoryOdds` within +-0.15). Memory lines on the profile: U10 `people-memory.test.ts`. **Dialogue: R5 (D.11)** (X46) | |
| **Player sees.** Real in-laws and nieces (NPC wedding, baby, estate). **Cousins: not delivered (X46)** | L4 `kin-records.test.ts` (an NPC wedding and baby become records), L5 `kin-estate.test.ts` (an estate makes the heirs Persons); U9 `people-web.test.ts` (`relationLabel` reads `data.kin`: a niece is not "Friend"; a living sibling's profile shows the spouse by name and a kid count on a stamped life). The records of a living family are Met-only and show no profile; a niece or sister-in-law appears as a Person only after her relative dies and leaves an estate of at least half a year's income (L5). Cousins and the popup in-laws of the player's own spouse stay per-popup names (`events/wealth-family.ts:48-57`) | |
| **Player sees.** A person profile with "known" and "unknown" rows | U3 `people-facts.test.ts`; U4 `person-facts-ui.test.ts` (Realistic: a chip per estimate, `Private` for a stranger, no true digit) | U1 `people-ui-golden.test.ts` (Exact and flag-off equal v5.2.0) |
| **Player sees.** Heirs inherit friendships and feuds | L9 `heir-carryover.test.ts` (12 best friends, feud enemies, bound persons kept), L10 `heir-strife.test.ts` | |
| **Risk.** The shim touches 374 call sites | E1 `relationship-ratchet.test.ts` (373 calls in 63 files, 43 raw writes in 14 files, 10 `bumpRelationship` calls, all counted now), E5 (ratchet to 0 raw writes outside `core.ts` and `kernel/relations.ts`) | |
| **Risk.** Eviction and heir switches are the likeliest places to lose a debt | S7, E14, L9, L11 `heir-invariants.test.ts` (`danglingIds`), L11 `heir-carryover-table.test.ts` (one outcome per personal flag that holds money or a promise) | |
| **Risk.** Popup budgets across four yearly hooks must become one | E9 | section 4 |
| **State.** +20,000 nodes (the roadmap budget; R4 plans about 29,000, see P2 and the allotment) | S4 `world-met.test.ts` (10,401 worst case), E6 `world-edges.test.ts` (about 17,000), P2 (cap and budget with both at their caps), E15 (save-budget with the maximal edges) | L12 (`Person.data` keys: about 7,300 worst case inside the above) |
| **CI.** 4 shards; the golden files run in the fast tier | E2, E3, E4, L1, U1 carry `// ci: fast` (about 0.5 s, 3 s, 7 s); P4 moves to 8 shards (X49) | |
| **Global.** Saves: every new field optional, validated by its own reader, bounded; old saves load | S4, S5, E6, L3, S9 (readers and caps); `old-saves.test.ts` with the new E1 fixture; S11, E15, L12, U11 (12 hostile worlds each) | |
| **Global.** Determinism: no `g.rng` in a read; new modules draw from named streams | the `world-streams` guard, `stream-tap.ts` rows `social` and `life.path`, S3 (`trapRng` over `latent`), every task's purity case | |
| **Global.** Money: every dollar booked once, no `Person.money` write outside the ledger | the four scans of X50; `money-ratchet.test.ts` stays at or below its baseline; E15 and L12 strict ledger drift 0 | |
| **Global.** Ceilings with a probe at 100 times | 20 rows: `met-caps`, `persona-nudge` (S11); `edge-caps`, `memory-total`, `loan-cap`, `favor-callin`, `gossip-hops`, `feud-live`, `mentor-gain` (E15); `kin-caps`, `life-facts`, `life-path-scan`, `kin-estate`, `estate-debts`, `receivable-carry`, `divorce-debt`, `kept-contacts`, `strife-edges`, `npc-wage` (L12); `people-reads` (U11). The `gossip-hops` row also holds the damage a person can take from leaks in a year; `npc-wage` also holds the aggregate of all NPC wages; `persona-nudge` probes the store (no caller exists in R4) | |
| **Global.** Voice and no dash | `voice-guards.test.ts` (U5 removes 3 em-dashes; the guard's limit of 24 stays), `text-lines.test.ts` rows, grep of every new file | |
| **Global.** Repetition gates | E16 (`text-repeat`, `quiet-acceptance`, `text-kit` one at a time after the flip; a miss is fixed at the source) | S11, L12, U11 run each once before the flip |
| **Global.** Authorization lives inside actions (design 14.1 invariant 4; roadmap Global Constraints) | E10 `social-act-auth.test.ts`: a table-driven direct-call test that bypasses every menu, for each SocialAct (favor ask and call-in, vouch, broker, loan ask and lend, make-peace, mentor enrolment), `serviceDebt`, a secret leak, `betray` and `staffLoyaltyYear`, in each blocked state (unstamped life, person dead or estranged, cooldown not elapsed, cap reached, lender cash below the principal, another owner's edge): it returns null, 0 or false, `JSON.stringify(g)`, `g.rng` state and `g.nextId` are unchanged and the ledger has no new row | E11 to E13 add rows; L7 `divorce-debt.test.ts` (`openDivorceDebt` and `serveDivorceDebts` in the same blocked states); E15 runs the table |
| **Exit gate.** Acceptance green; the old-save matrix (a v4.0.2 fixture, a life with 20 exes, a life with a family firm) migrates | `test/old-saves.test.ts` over every `save-*.json.gz` (including `save-v4.0.2.json.gz`); E1's `save-v5.2.0-social.json.gz` (22 exes, a will with a cut-out child, a loan, a family firm with relatives on payroll and a designated successor); E15 migration matrix (the 22-exes life keeps its debtor and its cut-out child); S11, L12, U11 old-save cases. **Stamped fixture (review; roadmap F.1 "one new fixture per release"):** `save-v5.3.0-heavy.json.gz`, recorded by P6 from the release commit with the `docs/SAVE.md` recipe (twice, byte-identical, `social` and `peopleProfile` on, a scripted `stamped` mode if the heavy life has no edge debt, secret or feud), so R5, R6 and the nightly job load a save that has `g.world.met`, `g.world.edges`, the `social` stamp and kin records | |
| **Exit gate (human).** The lead's walk with the owner | Chromium at 360 px and 320 px with `?flags=peopleProfile,social`: open a person from the list, Back, a Palette pick, Look closer open then Back, a hire with a check, a CEO shortlist; a 3-life playthrough that includes a wedding of a sibling, a death with an estate, a hand-over with a divorce debt and a will fight (the vitest environment is node, so layout and focus cannot be proved in CI: `vite.config.ts:18`) | UI plan lead action 7 |

## 8. Seeded tests and fixtures that will move (and those that will not)

The rule of the roadmap stands: a seeded test that moves is explained, never silently re-baselined. A moved row below is expected; a moved row that is NOT below means the task is wrong, not the fixture. P5 copies this table into `moved-tests.md`.

**Moves on purpose**

| Test or fixture | Task | Why |
|---|---|---|
| `test/world-budget.test.ts:116` (`WORLD_BUDGET` pin, title at :3 and :115) and its maximal-world builder (:255-305) | P2 (pin), S4 and E6 (builder gains `met` and `edges` at their caps) | the cap and budget are raised on purpose (X47) |
| `test/world-state.test.ts:197-221` (the `toBe(40_000)` pin, the shard sizes of the tie, three-shard and fits-exactly cases), `test/world-repair.test.ts:66-70` (`junk(300_000)` plus `junk(200_000)` against `> WORLD_NODE_CAP * 10`), `docs/WORLD.md:102-104,143-147` (40,000 and the 25,000 and 450,000 budget) | P2 | the cap is raised on purpose (X47): the pin takes the new constant, the sizes are scaled from it, the junk is sized from it (`WORLD_NODE_CAP * 6` plus `* 4`), new cases for the protected classes; `world-acceptance.test.ts` is checked and its hostile builders scaled only if one was sized against 40,000 (review) |
| `test/save-world-adapter.test.ts:26` (sorted shard list) | S4 (`met`), E6 (`edges`, `social`) | adding the shards is the point of the tasks |
| `test/flags.test.ts:88-98` (nine keys) | P3 | eleven keys |
| `test/hub-entry.test.ts` HUBS rows | S4, E6, E7, E10, L4, L5, L7, U2 | one row per module that registers at load; no `EXPECTED_PORTS` row (X23) |
| `test/fixtures/kernel-parity.json`, `aging` list only | E7 (+`world.edges`), E10 (+`society.acts`), L4 (+`life.kin`), L5 (+`life.estates`), L7 (+`life.debts`); re-recorded by the integrator at each merge (X2) | 39 entries become 44, only by those new ids (`life.kin` life/37, `life.estates` life/55: `test/kernel-aging.test.ts` is not edited and constrains those orders, X2); `lives`, `menus`, `views` must not move |
| `test/pace.test.ts:22`, `ask-families.test.ts:81-82`, `biz-pace.test.ts:57-62`, `kit-pace.test.ts:63-67`, `notice-acceptance.test.ts:83,300` | E9 | `PACE.maxFamilies` 60 to 80 (`pace.test.ts:22` pins the whole object), `TEXT_MEM_LIMITS.families` 120 to 160 (`notice-acceptance.test.ts:83,300`, which the Edges plan missed, C15; and `text-memory.test.ts:46`, the exact limits object, plus `:436-448`, the 120-family full memory held at 700 nodes, which the cross-check missed: six files in all, review) |
| `test/knowledge-estimate.test.ts:542-568`, `test/knowledge-unwired.test.ts:35-39`, `docs/KNOWLEDGE.md:64,123,128,169-173` | U2 | eight rule rows; the exposure guard is an allow-list of two files, `people-fog.ts` and `business/leader-fog.ts` (U6 runs the test and adds the path only if U2 did not) |
| `test/nav-cockpit.test.ts:371-382` | U8 | the "no tiles" case runs under `withFlags({ peopleProfile: false })` |
| `src/game/npc-lives.ts:478,481,482` (three U+2014 to hyphens, Exact text too) and the count in `voice-guards.test.ts` (limit 24 stays; the UI plan measured 23 em-dashes in strings and 3 of them here, so 20 after; not re-run) | U5 | "Exact is today" and "no U+2014" meet there; no test pins the characters |
| `test/layers-baseline.json` (`society->life`) | E10 | one `UPDATE_LAYER_BASELINE=rebase`, edges approved by the lead (X26) |
| `test/quiet-integration.test.ts:70-79`, `test/text-lines.test.ts:95,251`, `test/notice-weight-table.test.ts`, `test/stream-tap.ts`, `test/stream-isolation.test.ts` | E7, E10, E11, E12, L2, L4, L5, L7, L10 | rows, pools, titles, stream tags |
| `test/ceiling-list.json`, `ceiling-kit.ts`, `ceiling-probe.test.ts:60` | S11, E15, L12, U11 | 20 new rows (section 7) |
| `scripts/bundle-baseline.json` | P1 | re-captured at v5.2.0; `allowGrowthBytes` stays 60,000 and `test/bundle-budget.test.ts:364-372` is untouched (a raise needs the owner's OK and edits that pin in the same commit, X48) |
| `test/lazy-zones.test.ts` (a `people-profile` zone) | U4 | the profile chunk's fence and gate |
| `docs/KERNEL.md` | S1 (`person-ref.ts` line), E5 (`relations.ts` line) | `kernel-acceptance.test.ts` requires one entry per kernel file |
| `docs/SAVE.md` "One fixture per release" and `test/save-v3-schema.test.ts` header and cases | P6 | one line each for `save-v5.3.0-heavy.json.gz` |
| `scripts/test-timings.json` | P4 (refresh), P6 | new files |
| `.github/workflows/ci.yml`, `docs/CI.md` | P4 | 8 shards |
| **At E16 only (the flip):** `test/fixtures/golden-digests.json` (slices `world` for the shards `social`, `edges`, `met`; `character` for `yearActions['fam.act']`; `people` for kin links, `data.sid` and materialized kin; `rng` for `nextId` and the uids of the new log lines; `text` for lines and family memory), `r2-parity.json`, every `social-parity-*.json` (the `stamped` option becomes the default), the heir-parity rows, `life-pins` rows that run through `createNewLife` | E16 | every new life is stamped; the 104 test files that call `createNewLife` now run stamped; a life that stays free of kin events moves only in `world` and `character` |

**Does not move (and why a reader might think it does)**

| Test | Why it stays |
|---|---|
| `test/nepo-year.test.ts:393-397` ("the sibling keeps the company as a holding, not as cash (R0-13)") | the roadmap says this pin changes on purpose in R4; it already changed in R0-13 (read now). L8 adds only the two cases that stayed cash |
| `test/sibling-firm.test.ts` (mortgaged firm and sibling under 21 stay cash; owns-a-firm and family-co-owners unchanged) | they pin the unstamped path, which lives as long as old saves do. L8's stamped twins are new tests |
| `test/wealth.test.ts:446` and `test/will-feud.test.ts:756` | owner-stamped readers are unchanged; the hand-over re-stamps a claim (C11). Edges E4 said they move; they do not |
| `test/seed-pins-baseline.json` | no new `seed: <digits>` line (X30) |
| `golden-digests.json`, `r2-parity.json` before E16 | no module, hook or written key reaches an unstamped life (every task declares it; E1 to E4, L1, S1, U1 are test-only; S1 to S10, U2 to U8 add no state to a played life) |
| `test/quiet-acceptance.test.ts`, `text-kit.test.ts`, `text-repeat.test.ts` before E16 | lives do not diverge until the stamp is on; E16 reruns them |
| `test/kernel-aging.test.ts` | it is never edited; it pins life/45 (its own `ext.k9between`), the first two aging entries and `effort.you` after `household`, so the plans choose orders that keep it green (X2) |
| `test/bundle-budget.test.ts:364-372` | `allowGrowthBytes` stays 60,000; the pin moves only if the owner approves a raise (X48) |
| `test/world-acceptance.test.ts` | its hostile worlds assert `< WORLD_NODE_CAP` (:166), which the new cap keeps true; P2 re-reads the builders (review) |

**`moved-tests.md` skeleton (P5):** headings `registry-persona`, `edges-acts`, `life-heirs`, `people-ui-fog`, `platform`; columns `Test`, `Task`, `Was`, `Now`, `Why`, `Commit`.

## 9. R5 and R6 preflight findings: what R4 keeps open, and when they may start

### 9.1 What R4 does about each finding

| Preflight finding | Where it lands |
|---|---|
| R5: R4's interfaces do not exist; plan against a written freeze note, ideally within the first hours | section 3 is the note; `docs/PEOPLE.md` is created by S3 (X51) |
| R5: declare R4's fact kinds now; keep the `news` phase unused | X29: `life.wed`, `life.birth`, `life.death`, `life.estate` (L4, L5), `social.leak`, `social.feud` (E11, E12); declared in `ModuleDef.facts`; R4 emits no `news`-phase entry |
| R5: `p.data.said` does not exist; leave `conversation()` and `pickTopic()` (relationships.ts:2291-2340) as one replaceable seam | X27: the store is `Edge.d` and `Edge.n`; no R4 task edits `conversation()` or `pickTopic()` (grep of the four plans) |
| R5: the facts store keeps the first arrivals, 12 a kind-year, 400 in all | Life emits at most 8 a year; detectors must rank before emitting (R5's problem); R4 does not raise `FACT_CAP` |
| R5: WORLD_NODE_CAP 40,000, the largest shard is dropped | P2 (X47) |
| R5: 23 bytes of headroom, 5.5 MB raw is the wrong unit | P1 (X48); the target is stated in gzip; R5's K.8 re-captures after the diet |
| R5: CI is at 11.6 minutes on 4 shards | P4 moves to 8 now |
| R5: no pack data at module load; latent names from `world.ts`; new UI behind `lazyView` | X20 (no `data/brands`, `data/locales`); latent uses `namePoolOf`, `nameFitsYear`; `lazyView` is the bundle relief ladder (X48). R4's new modules read no era pack, history row, locale or brand at module level (to be checked by `layers.test.ts`'s eager-read ratchet; UNVERIFIED for each new file until the task runs it) |
| R5: D.4 and D.7 overlap; R4 owns Secret storage, the SocialAct engine and gossip with hop cap 2; R5 owns `rep[group]`, leak timing and scandal stories | E11 builds exactly that; `Edge`-side secrets (cap 40, 6 holders) are frozen; `rep` needs no reservation: R5 adds an optional field to the `social` shard (its normalizer drops unknown keys today, so an older save has none) |
| R5: R5 reads D.1, D.2, D.4, D.5 and D.9, not only D.3 | all five are in section 3 |
| R6: sid is a ref-safe string, accepted verbatim from seeded sources, derived with `worldSeed` | S3 grammar fits every `rosterAt` id (`actor.us.1985.3`); `fromSeeded` keeps the name; `SID_KINDS` is append-only |
| R6: registry reads and writes, a way to materialize an intimate Person, no draw in a read | S3, S4, S8 |
| R6: edge API with an extensible memory enum and structural link kinds | `MEMORY_KINDS` already holds the seven career kinds (signed_me, fired_me, poached_me, beat_me, hired_me, referred_me, mentored_me); `LinkKind` is append-only |
| R6: a registerable eviction-protection hook, exported caps, a counter for career peers | `registerProtector` (S7); `MET_CAPS`, `EDGE_CAPS`, `KIN_CAPS`; `metKinds` (X11) |
| R6: a payer-to-person money door in `cash.ts` | `cash.moveCash(g, from: Purse, to: Purse, amount, reason, token)` and `payPerson` exist (cash.ts:138, 193); R4 adds none. `serviceDebt` is person-to-person debt only. The NPC wage payer is `pool:employers` (X37) |
| R6: generic fog key kinds by sid | the `ppl` kind keyed by `personKey` (U2); a Met-only record has no truth provider until materialized |
| R6: heir contract: kit records personal, career assets divisible, edge-copy rule accepts link kinds | `HEIR_KEEP_KINDS` (X28); all `special.*` flags stay personal (world-flags.ts) |
| R6: family-act scripts into `DEFERRABLE_SCRIPTS` | declined (X40); the career slot `pace.kit` stays separate |
| R6: room for job and firm links on the Met record and a role tag | `MetRecord.r` and `.j` reserved (X17) |
| R6: do not make registry names globally unique at generation time | X20 |
| R6: raise caps once with an allotment per release | P2 (nodes), E9 (families), P1 (bytes) |

### 9.2 Can R5 and R6 start before R4 is merged?

Not in parallel from `main`, but both can stack on `release/v5.3.0` once it reaches the freeze point F1 (S8, S10, E8 and L3 merged, about wave 8 to 9 of section 1.3), because:

- Four hot files are shared: `business/staff.ts` and `dynasty-ownership.ts` (R4 E13, U6, U7, L5) are members of the 59-module business cycle that R5's K.2b rewrites, and `tech-waves.ts` (R5 C.10) is in the same cycle; `modules/index.ts`, `kernel-parity.json` and the golden digests are re-recorded by every release.
- R5's composer, offers and reputation track reads R4's Edge memories, personas and `Edge.d`; R6's K2, K3, K5, K6, K8, A.K3 and D.6 read the registry and the protector hook. They need the code, not only the note.

| Work | Start | Merge |
|---|---|---|
| R5 Facts and Paper (E.N1 to E.N8), detectors, the Paper screen | any time after B1; it needs only the bus and the facts store, which exist | after R4's tag (the `news` module and the facts re-record the same fixtures) |
| R5 K.8 stage 1a (era packs, history events) | any time on its own worktree off main | after R4's tag; it re-captures the bundle baseline once at the end and cuts the allowance (R5 preflight: to about 30,000) |
| R5 offers, reputation, composer, C.10 | after F1 (stacked) | after R4's tag |
| R5 K.2b cycles | after R4's tag | last, in small commits (it edits `staff.ts`, `dynasty-ownership.ts`, `tech-waves.ts`) |
| R6 Kit v2 K1 (payers), K4 awards, K7 to K11 stubs, books, auto; Author; C.5 school and practice | after R3 only (C.5 can start at hour 0; the rest at F1 so the freeze note can cite R4 by name) | after R4's tag |
| R6 K2, K3, K5, K6, K8, A.K3, D.6, Game employee | after F1 (stacked) | after R4's tag; A.K3 and `staff.ts` after U6, U7, E13 |

Two things to carry forward: the 17 pace families left after R4 (R5 offers, gossip and composer, plus at most 4 for R6) and the about 8,000 nodes of budget left (R5 +6,000, R6 +6,000 will need the next raise, with the measured figure; it was 8,800 before the Met shard's worst case was corrected from 9,600 to 10,401 nodes).

## 10. Top risks

1. **The shim's mass diff (E5).** 373 calls in 63 files and 43 raw writes in 14 files change in one commit while three other tracks edit the same files. Mitigation: the oracle gate, E5 as a barrier, an idempotent codemod, a two-commit E5 (mechanical diff alone, then primitives and hook) that a reviewer re-derives by running the script on the parent. A closure whose state variable is not named `g` is the likeliest hand-placed site.
2. **The flip is large and cannot be early (C16, X7).** Every golden slice that holds a new life moves, 104 test files change meaning, and the three repetition gates bite whenever lives diverge (the Edges plan saw 10 `sameWithin10` hits in 3 of 13 lives; not re-run here). Mitigation: the rehearsal in X7; fixes at the source; a stamp that touches only new lives limits the blast to `world` and `character` for a life with no kin event.
3. **Silent data loss at the node cap (X47).** Until P2 merges, `edges` is the largest shard and `normalizeWorld` drops it whole: every debt, memory and feud with it, in live play. P2 is a hard prerequisite of S4 and E6, and E6's maximal-world test fails loudly rather than letting it vanish.
4. **Two sources of truth.** `Person.relationship` and `edge.f`; `married`, `spouseName`, `kids` and the kin records; `WealthTies.owes` and `Edge.dv`. Held equal by invariants (`edge.f === relationship`, `kinProblems`, `syncLegacy` at the two writers), not by construction. A writer that clears `married` is caught a year late.
5. **The hand-over (L9, L6, L11).** `continueAsChild` is one function of about 560 lines edited by five hunks of Life and E5's codemod; the rolls must stay in order; the heir's spouse can collide with a materialized holder of the sid; the edge re-key can collide with a strife edge. Mitigation: X39, the sid fold, `danglingIds`, the carryover table, Opus fallback for L9.
6. **Layering.** `society` is a new domain (one `society->life` rebase with two files); `world/` must not import it (C4). A slip shows as `new-upward` in `layers.test.ts`.
7. **First production entity slices (S5, E6).** Unproven in the game; S5 spikes with a recorded fallback (X9); a root edited in place throws on a frozen shared root, which is the alarm.
8. **Bundle.** 23 bytes today; about 114 KB gzip estimated at an unverified 8.2 bytes a line (a proxy, not a basis for a limit). P1 re-captures the baseline and leaves +60,000 for all four tracks; the profile cards are a lazy chunk from U4 on (planned, not a fallback), the lead measures and prints the delta at B3 and B4, and raising the limit needs the owner's explicit OK (X48). The engine code stays eager.
9. **CI time.** +25,500 test lines on a suite at 11.6 minutes on 4 shards. P4 moves to 8 shards.
10. **Popup semantics.** The 3-a-year budget counts choices; the nepo outcome notice and the year close's own 3 are different budgets. A task that spends the key on a notice, or forgets the wealth ask spend points, silently changes the counts (C13); `family-budget.test.ts` must run stamped tier-4 lives for 30 years and a scripted saturated year, because natural play may never exercise every source together.
11. **Old saves split for good.** An unstamped life and its heirs never gain R4 behaviour (X6). This is intended, but the release notes and the owner must say so.
12. **Facts store pressure.** First arrival wins, 12 a kind-year, 400 rows; Life emits up to 8 a year plus leaks and feuds, and R5 detectors share it. R4 does not raise it.
13. **Unowned items found by this cross-check** (now owned): the marriage-for-wealth probe (E15 and U3 and U11), `relationLabel` for kin (U9), `registerProtector` and `registerSalience` callers (E14), the `social.feud` fact (E12), the freeze note (S3), the `notice-acceptance` pin (E9; the review found a sixth pin, `text-memory.test.ts`). **Not deliverable**: dialogue memory, the banker-minister line and cousins (X46).
14. **A kernel nobody calls can rot.** Until L4, nothing in a played life touches the Met store. S11's scripted caller keeps it exercised; L4 is the first real writer and is two waves later than S8.

## 11. Plan against code: claims checked with grep and reading

A script checked 180 `path:line` anchors of the four plans for the expected text at the cited lines (176 matched; of the 4 misses, 2 were false alarms of my pattern and 2 real), and I read the exact content of about 90 more. Counts are from `grep` run now. Everything not listed is untouched. UNVERIFIED claims of the plans (estimates, the 8.2 bytes a line, tolerances) stay marked in the plans.

| Claim (plan, task) | Result |
|---|---|
| `core.ts:59` is `addRelationship(p, delta)` with no `g`; `core.ts` is layer 0 (E5) | true (`KERNEL_FILES` has `core`, layer-kit.ts:25-36) |
| 373 `addRelationship(` calls in 63 files; 43 raw `.relationship` writes in 14 files outside `core.ts`; 10 `bumpRelationship` calls (E1, E5) | true (grep now: 373 / 63; 44 matches in 15 files including `core.ts` itself; 12 `bumpRelationship(` lines, two of them definitions) |
| `createPerson(` 54 calls in 29 files; `createNewLife(` in 104 test files; 661 test files (S1, E7) | true (55 matches incl. the definition; 104; 661) |
| `cash.ts:75-77` and `world/people.ts:31-32` hold two copies of "sid else id" (S1) | true |
| `world/caps.ts:11` 40,000; `:21` `FRONTIER_CAPS`; `budget.ts:18` `{25_000, 450_000, 60}`; `state.ts:153-160` largest-first drop (S4, E6, P2) | true |
| `shards.ts:7` `import './facts'`; `invariants.ts:145` frontier loop; `world/types.ts:72` index signature; `save-slices.ts:25` (S4, S5, E6) | true; `budget.ts:77` is `case 'frontier'` (S4 inserts before it), `budget.ts:75` is `case 'holdings'` (E6 inserts before that): adjacent, keep both |
| `lod.ts:322-337` is `lodSweep`, idempotent by `lod.y` (S7) | true |
| `lod.ts:178` is a guard the Registry track owns (E14) | false in effect: the LOD person index guards `g.people` rows already (:120-128); dropped (C5) |
| `kernel/slices.ts:43-48` `EntityShards`; `defineSlice` accepts `world.met`; no `src` file uses `chunk: 'entities'`; `MAX_CHUNKS = 96` (S5, E6) | true (`save-codec.ts:63`) |
| `kernel/registry.ts:30-47` has the phases `society`, `life`, `money`, `close`, `settle`, `news`; `yearly-aging.ts` orders life 40/50, money 70/80/90/100, close 10 (E7, E10, L4, L5, L7) | true; free orders after the review: close 5 and 6 (`world.edges`, `society.acts`), life 37 (`life.kin`), life 55 (`life.estates`), money 75 (`life.debts`). Not free: society (empty, pinned by `kernel-aging.test.ts:73,113`) and life 45 (that test's own `ext.k9between`, :90) |
| `hubs/year-close.ts:35` `DEFERRABLE_SCRIPTS` is three ids (E9) | true |
| `wealth.ts:73`, `nepo-year.ts:32-38`, `will-feud.ts:234`, `luxury-family.ts:530,621,664` (E9) | true; `nepo-year.ts:554` spends `usePopup` for a notice (C13) |
| `text/pace.ts:29` 60; `text/memory.ts:16` 120 (E9) | true; six test files pin them, the plan listed four (C15 and the review: `text-memory.test.ts:46,436-448`) |
| `flags.ts:27-48` nine keys; `test/flags.test.ts:88-98` (E7, P3) | true; release rule at :61-83 forbids the early flip (C16) |
| `hub-entry.test.ts:50-57` HUBS and the port row at `:57` (E5, S4) | HUBS ends at :55 (true); `EXPECTED_PORTS` is at :62 (fixed); no port row is added (X23) |
| `kernel-acceptance.test.ts:17` `PORTS` (E5) | true; unchanged under X23 |
| `life.ts:1186, 1214-1231, 1233-1240, 1367-1470, 1496-1497`; `:1436` the heir's spouse `createPerson` with given gender, age, names and skin; `:1521` `n.yearActions = {}` before `:1679` `settleReading` (L5 to L11) | true |
| `relationships.ts:896-917` (`npcMortality` at :898, used :945), `:1338-1378`, `:1525`, `:1541`, `:2129`, `:2136` (20 exes), `:3697`, `:3721` (E7, E10, E14, L2, L4, U5) | true |
| `npc-lives.ts:96, 104, 250, 336` seed strings; `:158-168` `adoptNpcCompany` (age gate 21); `:475-492` `npcLifeNodes`; U+2014 at :478, 481, 482 (S10, L8, U5) | true |
| `will-core.ts:371-376`, `:407` `FORGIVING`, `:584` `peaceOdds`; `wealth-core.ts:277-281`, `:573` (E7, E8, S10) | true |
| `love.ts:912` (affair found), `:1627` (`divorce`), `:1651` (`remaining`), `:1669` (E8, E11, L7) | true |
| `staff.ts:219, 350, 689`; `board.ts:218` (E13) | true for 350, 689 and `board.ts:218`; `:219` is the `morale:` line of the `KeyStaff` literal, so the hire hunk is `:222-224` after `b.staff.push(s)` (`dropVet` is at :174, `id: uid(g, 'ks')` at :209); fixed in E13 and U6 (review) |
| `knowledge/keys.ts:85` `ppl.*` is .45/.20; `estimate.ts:161-162` takes `opts.exp` (U2) | true |
| `PersonSheet.tsx:70, 89`; `cockpit.ts:216-218`; `hubs/people.ts:20, 51, 65`; `manage.ts:1824, 1971, 2190` (U4, U7, U8) | true |
| `aging.ts:37` resets `g.yearActions` (E9) | false: `:38`. Fixed in the plan |
| `will-amends.ts:34` is `statusLine` and `:39` the `(N/100)` (U1, U5) | false: `:35` and `:40`. Fixed in the plan |
| `test/stream-tap.test.ts` exists (E10); `test/staff.test.ts` exists (E13); "the existing staff test file" and "the manager, board and conglomerate test files" (U6, U7) | false (`stream-tap.ts` is a kit; no `staff*.test.ts`). Fixed: `fog-hire`, `ledger-flows-business`, `board`, `company-dashboard`, `lab-team`, `ceo`, `ceo-letters`, `conglomerate-v2-management`, `sector-ceo` |
| "The two clean-slate pins are expected moves" (E4) | false (C11). Fixed in the plan |
| `nepo-year.test.ts:392` pin changes on purpose in R4 (roadmap) | already done in R0-13; the assertion is at :393-397 |
| `ceiling-list.json:34` is the last row and `ceiling-kit.ts:589` / `:703` are insertion points (S11, L12, U11) | the list ends with `waves-per-year` (:34); the kit has `frontier-caps` at :589, `waves-per-year` at :622 and ends with `know-keys` near :703; the three anchors differ but sit in the same two files (C26) |
| `node scripts/ci-shard.mjs --plan 4` and `--plan 8` (P4) | run now: 1,391 s and 696 s a shard |
| `package.json` 5.2.0; `scripts/bundle-baseline.json` is v5.0.0 / 2,909,121 / +60,000 (P1) | true; the 2,969,098 figure is from the R5 and R6 preflights (not rebuilt here) |
| `vite.config.ts:18` environment node, `setupFiles: ['./test/setup-exact.ts']` (U4) | true |
| `test/seed-pins.test.ts` counts lines matching `\bseed:\s*\d+`; a tuple passes (X30) | true |
| `docs/LEDGER.md:172-173`, `:251`: an opening `money:` literal is not a flow (S8) | true |
| `kernel/ids.ts` ref key charset `[A-Za-z0-9._-]`, 52 characters; `knowledge/keys.ts` `PART` 40 characters, key 64 (S3, U2) | true: a 40-character sid fits every key it appears in |
| `test/layer-kit.ts`: `world/` and `effort/` are layer 2, `kernel/` layer 0, `modules/` and `hubs/` layer 4; a new upward import is `new-upward` (E14, E10) | true (C4) |
| `kernel/ports.ts`: a port is "bound" only after `use()`; `hub-entry` fails on an unbound port (E5) | true (C3) |
| `kernel/streams.ts`: `stream` is a pure function of family, tag, year, id; `outcomeStream` re-rolls after a jump (E10, L2) | true |
| The four plans and this file contain no U+2014 or U+2013 | true (grep) |

**Anchors checked while applying the review (2026-10-26, grep and reading at a45d3a1).**

| Claim | Result |
|---|---|
| `test/kernel-acceptance.test.ts:23-31` fails on a `src/game/kernel` file with no ``- `src/game/kernel/<file>` - <words>`` line in `docs/KERNEL.md` (entries at :138-151) | true; S1 and E5 each add their line |
| `test/kernel-aging.test.ts:73-74,90-93,112-113` pins `world.frontier` first, `effort.you` after `household`, its own module at life 45 between `relationships` and `sharedProjects`, and `world.frontier` then `yearly.history` as the first two trace entries; `kernel-parity.test.ts:217` pins `world.frontier` first | true; hence life 37 and life 55 and an empty society phase |
| `kernel/registry.ts:303-304` names the entries of a module with two aging entries `<id>#0` and `<id>#1`; `hubs/year-plan.ts:58-60` says a module's entry id is its module id | true; every new module has one aging entry |
| `test/world-state.test.ts:197-221`, `test/world-repair.test.ts:66-70` and `docs/WORLD.md:102-104,143-147` pin 40,000 (and 25,000 and 450,000) | true; P2 moves them |
| `test/bundle-budget.test.ts:364-372` pins `allowGrowthBytes` at 60,000 and `scripts/bundle-budget.mjs:12,175-181` keeps it on `--update` | true |
| `test/text-memory.test.ts:46` asserts the exact `TEXT_MEM_LIMITS` object and `:436-448` the 120-family memory at 700 nodes; the limit is `text/memory.ts:16` | true (the earlier anchor `:14` is the `export const` line) |
| `test/knowledge-unwired.test.ts:32-36` fails on `exp:` in any file that imports `knowledge/contract'` outside `knowledge/`; its docs case is `/exposure[^.]*no screen/i` (:38-41) | true; the allow-list is two files and the docs sentence keeps the words "no screen" with no full stop before them |
| `love.ts:1643` (settlement is half the wealth gap times 0.5 to 1) and `:1672` (the player receives at most the spouse's own money) | true; the marriage-for-wealth bound is the spouse's cash, not a constant gain |
| `events/wealth-family.ts:48-57,507,531`: `inLaw()` and `cousin()` build a name per popup from `chance(g, ...)` and `randomFirstName(g, ...)` | true |
| `npc-lives.ts:241`: a string `p.data.kin` gives any person a full NpcLife | true |
| `business/staff.ts:174` (`dropVet`), `:209` (`id: uid(g, 'ks')`), `:222` (`b.staff.push(s)`) | true |
| `kernel/ledger.ts:89,177`: tokens are cut at 80 characters | true |
| `typicalIncome` is `events/wealth-core.ts:54`, domain `events` (not `society` or a leaf) | true; flagged at E10 |
| `advisors/team.ts:46-54` (`claimed` above `skill` for a crook) and `:220-225` (`ratingLabel` is a word) | true |
| `src/ui/lazy/lazyView.tsx` exists with `preload()`; `test/lazy-zones.test.ts` holds the zone table (charts, palette, games) | true; U4 adds a zone |
| design 14.1 row 10 ("one spouse, mutual") is at design.md:1196 and P9 at :54 and :1203 | true |

## 12. What the cross-check changed in the plan files

(The review of 2026-10-26 then edited the same five files again; its list is the closing section "Review amendments (2026-10-26)".)

Every plan: a new banner and a closing section "Cross-check amendments". Inline corrections (ten): `aging.ts:37` to `:38` (edges E9); `test/stream-tap.test.ts` dropped from E10's command; E13's command now names existing tests; E4's "clean-slate pins move" corrected; `will-amends.ts:39` to `:40` twice and `:34` to `:35` (UI); U6 and U7 test names (UI); the `moved-tests.md` owner (Life).

- **registry-persona.md**: dependencies (S1 after P1, S4 after P2, S10 after S9); the stamp key (C1); `docs/PEOPLE.md` created by S3; `touchMet` identity and `markMet` set semantics; the protector and salience contract; `metKinds`; reserved `r` and `j`; the `data.sid` writer rule and scan; the `axesOfPerson` name; S10 not waiting for Edges; no `data/brands` import; S5 as the first entity slice.
- **edges-acts.md**: dependencies and lanes (E3, E4, E5, E6, E7, E10, E13, E14, E16); the mirror as a hook; `isBound` at layer 2; E14 registers the protector and salience; `serviceDebt`, `DEBT_KIND`; `heirEdges` drops `dv` and keeps `k` for `HEIR_KEEP_KINDS`; the choice-only budget spend and the wealth spend points; the fifth pace test; module-id group keys; the `social.feud` fact; the flip coupled to the version bump; integration cases for E15.
- **life-heirs.md**: dependencies and lanes (L8 to `main`, L9 free of L8, L12 on L7); the accepted Registry and Edges asks; spouse reuse and edge collision merge in L9; strife `q` under the 12 cap; module-id group keys; `relationLabel` owner; answers to the 12 questions.
- **people-ui-fog.md**: dependencies (U2 and U8 after P3, U4 after P1); `relationLabel` in U9; the test names; the marriage-for-wealth display half in U11; the scan; the flip; answers to the 5 questions.

## 13. For the lead

1. Start wave 1: E1 and U1 first (both record on the unmodified tree), then P1, P4, P5, then S1 and L1. P1 before any merge that adds source; follow the slot schedule of section 1.3 (at most 9 lane worktrees open, at most 3 agents running tests).
2. Merge the oracle gate (section 1.5, B1) and then E5 alone. Tell every open worktree to run `node scripts/codemod-addrel.mjs --apply` after E5.
3. Do P2 and P3 in wave 2 (P5 first). Do not let S4 or E6 merge before P2; P2 moves four tests and `docs/WORLD.md` with the constants.
4. Re-capture the bundle baseline in P1 and leave +60,000 (X48). Run `node scripts/bundle-budget.mjs` at B3 and B4 and print the delta in each merge commit. A breach goes to the owner with the measured delta; do not raise the limit yourself.
5. At each track merge follow X2. Add the new test files to `scripts/test-timings.json` at P6 (`registry-acceptance` about 30 s, `social-acceptance` about 25 s, `life-acceptance` about 25 s, `people-ui-acceptance` about 30 s, the rest under 5 s).
6. Run the E16 rehearsal (X7) as soon as B4 is merged; do not wait for B5.
7. The calls that deserve the owner's eye at the playthrough: only new lives get the stamped behaviour (X6); `peopleProfile` can ship dark (X8); the NPC web is mirrored, not authoritative (X22); heirs are never liable and receivables pass by the will's share (X34); dialogue memory, recurring non-kin people and cousins are not in this release (X46); the family popup budget counts choices only (X40); the six departures from design 7 (section 6, "Design 7 departures in R4"); a direct kin's affection at the hand-over is the blend, not half (X33, the owner may choose the strict 0.5); the persona is stored but not yet felt, its player-facing half is R5 (X18); F18 is only partly closed (X37); the measured bundle delta against +60,000 and the lazy profile chunk (X48); the v5.3.0 save fixture (P6).
8. Every one of the 35 open questions the four planners raised has a decision in section 6; none is left for the owner except the playthrough review in point 7.

## Appendix A. The graph check (run for section 1.6)

Run with `node graph.mjs`. Rows are `[id, track, lane, dependsOn, sourceLines, testLines]` from section 1.2. It checks duplicate ids, missing dependencies, a cycle (Kahn's algorithm: every node must be reached), lane order (each task of a lane must reach the one before it, directly or through other tasks), and prints the waves, the longest chain by count and by lines, and the totals. Output of the run for this file, after the review: 56 tasks (50 planner, 6 lead), `acyclic: true`, no missing or duplicate id, no lane problem, longest chain 17 tasks (P1 S1 S2 S3 S4 S5 E6 E7 E8 E10 L6 L9 L10 L11 L12 E16 P6), 14,105 source and 26,280 test lines (planner 14,055 and 26,130; lead 50 and 150), the largest task 850 source lines (E10), the largest unordered set 12 tasks, 14 planner lanes. Before the review the same script gave 14,005 and 25,590 and a largest task of 840.

```js
// R4 task graph check: ids exist, acyclic, waves, longest chains, lane order, totals.
// [id, track, lane, deps, src, tests]
const T = [
  // platform (lead)
  ['R4-P1','platform','lead',[],0,0],
  ['R4-P2','platform','lead',['R4-P1','R4-P5'],40,130],
  ['R4-P3','platform','lead',['R4-P1','R4-P5'],10,20],
  ['R4-P4','platform','lead',[],0,0],
  ['R4-P5','platform','lead',[],0,0],
  ['R4-P6','platform','lead',['R4-E16'],0,0],
  // registry-persona
  ['R4-S1','registry','main',['R4-P1'],120,520],
  ['R4-S2','registry','main',['R4-S1'],330,420],
  ['R4-S3','registry','main',['R4-S2'],500,540],
  ['R4-S4','registry','main',['R4-S3','R4-P2'],450,560],
  ['R4-S5','registry','persist',['R4-S4'],70,330],
  ['R4-S6','registry','main',['R4-S3','R4-S4'],190,280],
  ['R4-S7','registry','main',['R4-S4','R4-S6'],490,680],
  ['R4-S8','registry','main',['R4-S7'],240,400],
  ['R4-S9','registry','persona',['R4-S2'],300,430],
  ['R4-S10','registry','persona',['R4-S1','R4-S2','R4-S4','R4-S9'],200,340],
  ['R4-S11','registry','main',['R4-S5','R4-S8','R4-S9','R4-S10'],130,640],
  // edges-acts
  ['R4-E1','edges','main',[],0,800],
  ['R4-E2','edges','main',['R4-E1'],0,850],
  ['R4-E3','edges','gold',['R4-E1'],0,900],
  ['R4-E4','edges','side',['R4-E1','R4-P5'],0,900],
  ['R4-E5','edges','main',['R4-E2','R4-E3','R4-E4','R4-L1','R4-S1','R4-U1'],330,190],
  ['R4-E6','edges','main',['R4-E5','R4-P2','R4-S5'],830,790],
  ['R4-E7','edges','main',['R4-E6','R4-P3'],540,730],
  ['R4-E8','edges','main',['R4-E7'],420,520],
  ['R4-E9','edges','acts',['R4-E7'],300,560],
  ['R4-E10','edges','acts',['R4-E8','R4-E9','R4-S10'],850,840],
  ['R4-E11','edges','acts',['R4-E10'],670,710],
  ['R4-E12','edges','acts',['R4-E11'],530,660],
  ['R4-E13','edges','side',['R4-E8','R4-E4','R4-E10','R4-U6'],400,470],
  ['R4-E14','edges','main',['R4-E8','R4-E10','R4-S7'],310,420],
  ['R4-E15','edges','main',['R4-E12','R4-E13','R4-E14'],150,990],
  ['R4-E16','edges','main',['R4-E15','R4-S11','R4-L12','R4-U11'],150,200],
  // life-heirs
  ['R4-L1','life','main',['R4-E1'],0,640],
  ['R4-L2','life','main',['R4-L1','R4-E5'],240,430],
  ['R4-L3','life','main',['R4-L2','R4-S1','R4-S3','R4-S4'],300,460],
  ['R4-L4','life','main',['R4-L3','R4-S7','R4-E6','R4-E7'],470,600],
  ['R4-L5','life','main',['R4-L4','R4-S8'],330,490],
  ['R4-L6','life','estate',['R4-L1','R4-E5','R4-E7','R4-E10'],360,520],
  ['R4-L7','life','estate',['R4-L6','R4-E6','R4-E10'],300,470],
  ['R4-L8','life','main',['R4-L5','R4-L1','R4-E7'],150,380],
  ['R4-L9','life','heirs',['R4-L4','R4-L5','R4-L6','R4-E8','R4-E14','R4-S8'],550,780],
  ['R4-L10','life','heirs',['R4-L9','R4-E6','R4-E9'],250,380],
  ['R4-L11','life','heirs',['R4-L10','R4-L9'],190,330],
  ['R4-L12','life','main',['R4-L8','R4-L7','R4-L11'],130,840],
  // people-ui-fog
  ['R4-U1','ui','main',[],0,430],
  ['R4-U2','ui','main',['R4-U1','R4-S1','R4-P3'],190,340],
  ['R4-U3','ui','main',['R4-U2'],330,430],
  ['R4-U4','ui','main',['R4-U3','R4-P1'],290,360],
  ['R4-U5','ui','rows',['R4-U2'],230,380],
  ['R4-U6','ui','staff',['R4-U2'],250,360],
  ['R4-U7','ui','staff',['R4-U6'],330,380],
  ['R4-U8','ui','cockpit',['R4-U1','R4-P3'],230,300],
  ['R4-U9','ui','main',['R4-U4'],215,300],
  ['R4-U10','ui','main',['R4-U9','R4-E6','R4-E8','R4-S1'],130,200],
  ['R4-U11','ui','main',['R4-U4','R4-U5','R4-U7','R4-U8','R4-U9','R4-U10'],90,660],
]
const ids = new Map(T.map(t => [t[0], t]))
let problems = []
if (ids.size !== T.length) problems.push('duplicate id')
for (const [id,,,deps] of T) for (const d of deps) if (!ids.has(d)) problems.push(`${id} depends on missing ${d}`)
// lane rule: within one (track, lane), the next task must have the previous one as a direct or transitive dependency
const trans = new Map()
const reach = (id) => { if (trans.has(id)) return trans.get(id); const s = new Set(); trans.set(id, s); for (const d of ids.get(id)?.[3] ?? []) { s.add(d); for (const x of reach(d)) s.add(x) } return s }
// Kahn
const indeg = new Map(T.map(t => [t[0], t[3].length]))
const out = new Map(T.map(t => [t[0], []]))
for (const [id,,,deps] of T) for (const d of deps) out.get(d)?.push(id)
const wave = new Map(); let q = T.filter(t => t[3].length === 0).map(t => t[0]); q.forEach(i => wave.set(i, 1)); let seen = 0
const order = []
while (q.length) { const n = q.shift(); order.push(n); seen++; for (const m of out.get(n)) { wave.set(m, Math.max(wave.get(m) ?? 1, wave.get(n) + 1)); indeg.set(m, indeg.get(m) - 1); if (indeg.get(m) === 0) q.push(m) } }
const acyclic = seen === T.length
if (!acyclic) problems.push('cycle among: ' + T.filter(t => indeg.get(t[0]) > 0).map(t => t[0]).join(' '))
// lanes in order
const lanes = new Map()
for (const t of T) { const k = t[1] + '/' + t[2]; (lanes.get(k) ?? lanes.set(k, []).get(k)).push(t[0]) }
const laneProblems = []
for (const [k, list] of lanes) if (!k.startsWith('platform')) for (let i = 1; i < list.length; i++) if (!reach(list[i]).has(list[i-1])) laneProblems.push(`${k}: ${list[i]} does not follow ${list[i-1]}`)
// longest chain by count and by source lines
const lenN = new Map(), lenL = new Map(), prevN = new Map(), prevL = new Map()
for (const id of order) { const t = ids.get(id); let bn = 0, bl = 0, pn = null, pl = null; for (const d of t[3]) { if (lenN.get(d) > bn) { bn = lenN.get(d); pn = d } if (lenL.get(d) > bl) { bl = lenL.get(d); pl = d } } lenN.set(id, bn + 1); prevN.set(id, pn); lenL.set(id, bl + t[4] + t[5]/2); prevL.set(id, pl) }
const pathTo = (end, prev) => { const p = []; for (let c = end; c; c = prev.get(c)) p.unshift(c); return p }
const endN = [...lenN].sort((a,b)=>b[1]-a[1])[0][0]
const endL = [...lenL].sort((a,b)=>b[1]-a[1])[0][0]
const sum = (f) => T.reduce((s,t)=>s+f(t),0)
const byTrack = {}
for (const t of T) { const k = t[1]; byTrack[k] ??= { n:0, src:0, test:0 }; byTrack[k].n++; byTrack[k].src += t[4]; byTrack[k].test += t[5] }
console.log(JSON.stringify({ tasks: T.length, planner: T.filter(t=>t[1]!=='platform').length, platform: T.filter(t=>t[1]==='platform').length, acyclic, missingOrDup: problems, laneProblems, longestChainByCount: pathTo(endN, prevN), longestByLines: pathTo(endL, prevL), srcTotal: sum(t=>t[4]), testTotal: sum(t=>t[5]), byTrack }, null, 1))
const waves = {}
for (const [id,w] of wave) (waves[w] ??= []).push(id)
for (const w of Object.keys(waves).sort((a,b)=>a-b)) console.log('wave', w, waves[w].sort().join(' '))
const maxFan = [...out].map(([k,v])=>[k,v.length]).sort((a,b)=>b[1]-a[1]).slice(0,8)
console.log('fan-out', JSON.stringify(maxFan))
console.log('lanes', [...lanes].map(([k,v])=>k+': '+v.join(',')).join('\n'))
console.log('topo', order.join(' '))
// largest set of tasks with no ordering between any two (Dilworth: tasks minus a maximum matching on the transitive closure)
{
  const order2 = T.map(t => t[0]), ix = new Map(order2.map((id, i) => [id, i])), n = T.length
  const memo = new Map()
  const anc = (i) => { if (memo.has(i)) return memo.get(i); const set = new Set(); for (const d of T[i][3]) { const j = ix.get(d); set.add(j); for (const x of anc(j)) set.add(x) } memo.set(i, set); return set }
  const adj = Array.from({ length: n }, () => [])
  for (let b = 0; b < n; b++) for (const a of anc(b)) adj[a].push(b)
  const matchR = Array(n).fill(-1)
  const aug = (u, seen) => { for (const v of adj[u]) { if (seen[v]) continue; seen[v] = true; if (matchR[v] < 0 || aug(matchR[v], seen)) { matchR[v] = u; return true } } return false }
  let matched = 0
  for (let u = 0; u < n; u++) if (aug(u, Array(n).fill(false))) matched++
  console.log('largest unordered set', n - matched, 'planner lanes', new Set(T.filter(t => t[1] !== 'platform').map(t => t[1] + '/' + t[2])).size, 'largest task (source lines)', Math.max(...T.map(t => t[4])))
}
```

## Review amendments (2026-10-26)

The adversarial review (21 confirmed findings, 20 unverified minors, 3 refuted) was applied to this file and to the four plans, in place; where a finding named a line, the line was re-read in the code first (section 11, "Anchors checked while applying the review"). Nothing under `src/` or `test/` was edited and nothing was added to git. All text uses plain hyphens. After the edits the task graph was re-run (appendix A): 56 tasks, acyclic, every dependency id exists, lane order holds, longest chain 17, largest task 850 source lines (E10), largest unordered set 12; totals are 14,105 source and 26,280 test lines (planner 14,055 and 26,130; lead 50 and 150), against 14,005 and 25,590 before. Dependencies added by the review: S10 after S4; E13 after E10 and U6; P2, P3 and E4 after P5.

### Applied: confirmed findings

1. Graph, S1 and `docs/KERNEL.md`: S1 now edits `docs/KERNEL.md` (the `person-ref.ts` line, with `heirUnsafe` in its words), runs `test/kernel-acceptance.test.ts`, and the line travels in the person-ref commit and not the pins-only commit; the section 2 row says S1 adds `person-ref.ts` and E5 adds `relations.ts`.
2. Reality, module orders and `test/kernel-aging.test.ts`: `life.estates` is life/55, `life.kin` is life/37, the society phase stays empty, the section 1.2 and module-ids rows and X2 say why (the test pins life/45, the first two entries and `effort.you` after `household`), L4, L5, L7, E7, E10 and E11 run the test, and the aging list of `kernel-parity.json` moves 39 to 44 by the new ids only. Better fix for the mentor snapshot: instead of a society or life entry, the single `society.acts` entry settles against a baseline kept in the `social` shard (`ms`), because a second aging entry renames its entries `society.acts#0` and `#1` (`registry.ts:303-304`) and the group tables are keyed by module id.
3. Reality, `WORLD_NODE_CAP`: P2 now also moves `test/world-state.test.ts:197-221` (pin, scaled sizes, protected-class cases), `test/world-repair.test.ts:66-70` (junk sized from the constant), `docs/WORLD.md:102-104,143-147` and the title of `world-budget.test.ts`, has its own check command, and notes that `world-acceptance.test.ts` asserts `< WORLD_NODE_CAP` and its builders are re-read.
4. Reality, the `allowGrowthBytes` pin (resolved together with finding 11): P1 leaves the allowance at 60,000, so `test/bundle-budget.test.ts:364-372` stays untouched; X48 and section 8 say that any approved raise edits that pin (and its title) in the same commit as the baseline, and that the test also scans its own source for U+2013 and U+2014.
5. Reality, the sixth pin: E9, C15, X41, the matrix and section 8 add `test/text-memory.test.ts:46` and `:436-448` (loop to 160 families, re-derive the 700-node ceiling, about 740 UNVERIFIED), E9's command runs it, and the anchor is `text/memory.ts:16`.
6. Reality, S1 and kernel docs (same defect as finding 1): applied by the same edits; E5 already lists `docs/KERNEL.md` and runs `kernel-acceptance`, now with the `relations.ts` wording.
7. Reality, the exposure guard: the guard is an allow-list of exactly two files (`people-fog.ts`, `business/leader-fog.ts`) in U2, X44, section 8 and U-A4; U6 lists `test/knowledge-unwired.test.ts` in its files and U6 and U7 run it; the docs sentence is worded so `/exposure[^.]*no screen/i` still matches ("by no screen beyond them").
8. Conformance, the heir blend: the acceptance row, X33, life-heirs (design paragraph, rules, acceptance table, L9 behaviour and Red list, question 2) now say that `t`, `r`, `s` and a non-kin's `f` copy at 0.5 and 0.6 while a direct kin's `f` is `round((roll + old) / 2)`; L9 gets the explicit blend test for old = 10, 50 and 90; the owner question stays open with the strict-0.5 alternative named.
9. Conformance, the unwired persona (option b, reduced): `registry-persona.md` S9 and S10, X18 and the D15 row say that `nudgePersona`, `personaOf` and `axesFromStaff` have no R4 caller, the player-facing half of D.2 moves to R5 with the composer, the `persona-nudge` row probes the store, and P6 adds the inputs to the R5 roadmap block; the owner of `Manager.integrity` and `KeyStaff.trait` is named in R5.
10. Conformance, in-laws and cousins (no new Life task): X46 gets a third line (cousins and the popup in-laws stay per-popup names, `wealth-family.ts:48-57`), the section 7 row and verdict item 5 are narrowed, life-heirs line on `kinView` is corrected, and U9 gains a kid-count row from `data.kids`.
11. Conformance, the bundle allowance: P1, X48, risk 8, C32, section 13 and the people-ui and life-heirs lead actions now keep +60,000, mark the 114 KB figure UNVERIFIED and not a basis for a limit, make the lazy profile chunk planned work in U4 (`PersonProfile.tsx`, `ui/people/lazy.tsx`, a `lazy-zones` zone, a hero-only fallback because the legacy bars print the truth), require the owner's explicit OK for a raise, and add the bundle delta to the owner's list. The society act engine has no lazy form (synchronous menu logic) and stays eager.
12. Conformance, design 7 departures: a table "Design 7 departures in R4" (six rows, each with reason and decision) follows the roadmap decisions; X44 now says "design 6.6 asks for a saved 2-bit mask; R4 departs"; item 7 of section 13 and the P6 release notes repeat them.
13. Conformance, the saturated-year test: E9 step 1, section 4.3, the section 7 popup row and risk 10 add the scripted year (every source eligible, counted by script id, 40-year repeat, idempotence, control run). Correction made on the way: the reserve must bind `wealth` and `use` together (`fam.early`), or the luxury choice, which runs before `nepo`, would take the reserved slot; and a loser is dropped, not queued, so the draft's "the lender and feud scripts are also queued" was changed to "queued only if they win a slot".
14. Conformance, authorization tests: E10 creates the table-driven `test/social-act-auth.test.ts` and E11, E12 and E13 add their rows; L7 adds the blocked-state cases for `openDivorceDebt` and `serveDivorceDebts`; E15 runs the file; a new section 7 row maps invariant 4.
15. Conformance, the stamped fixture: P6 records `save-v5.3.0-heavy.json.gz` (release commit, twice, byte-identical, flags on, a `stamped` mode in `save-fixtures.ts` if the heavy life lacks debts, a secret or a feud), updates `docs/SAVE.md` and `test/save-v3-schema.test.ts`, and the Known limits and the exit-gate table say so.
16. Graph, edge-local bound predicate: E6 defines `edgeLocalBound`, E7's orphan rule and E6's eviction use it, E14's `isBound` widens it and swaps both; section 3.1, the matrix and the E14 title say so.
17. Graph, `liveFeuds`, `openDebts` and `familyLive`: E6 defines the two pure counters, E9 creates `society/contract.ts` with `export { liveFeuds, openDebts } from '../world/edges'`, `familyLive` reads only `world/` plus `core` and `kernel`, E10 to E12 add only their own lines, L10 reads the count from `world/edges.ts`.
18. Graph, S10 after S4: dependencies, lane schedule, X19, section 1.2, waves (S10 moves to wave 6) and the appendix rows are updated; the sid-born test uses `writeMet` and a hand-built Person.
19. Graph, E13 after E10: dependencies, wave 11, the `stream-isolation` check and the sentence in E-A1 are updated (E13 also gains U6, see minor `i`).
20. Graph, the exposure guard (same defect as finding 7): applied by the same edits; the leaf is not routed through `people-fog.ts`, which would add a business-to-life import.
21. Graph, oracle files and the new `addRelationship` signature: E1's kit exports one `applyDelta(g, p, delta, kind?)` helper that the E2 table and the mutation wrapper use, E5 edits that one line plus `social-mutation.test.ts` (and the E2 file if needed), the byte-identical rule is stated for the fixtures (`git diff --stat` empty), and the E1 ratchet scans `test/` as well as `src/`.

### Applied: unverified minors (each checked in the code first)

- E12 legal fee (P9) and its cash floor: priced by the object (1.5 x typical income, 2.5 x after 4 years, never above 3 x), capped at 25% of cash, booked through `moveCash` (the E15 scan forbids `spend`), tested at net worth x100 and for "money never below its start".
- Marriage for wealth: E15 case (b) owns the probe, with a correction: the draft's "100x NPC wealth gives the same gain" is false (`love.ts:1643,1672` scale the gain with the wealth gap), so the bound is the spouse's own cash and a 100x factor at most.
- Inventory of the 8 named-person shapes: S3 puts a table in `docs/PEOPLE.md` with the type anchors found now (`love.ts:251`, `events/helpers.ts:454`, `special/politics.ts:583`, `special/kit/rivals.ts:32`, `business/board-state.ts:22`, `business/state.ts:24,282`, `business/nepo-actions.ts:135`); S11 checks the doc names all eight.
- Roadmap R4 node line: P2 updates the roadmap block to the allotment and P6 records the revised totals.
- Trial period: a Not-in-track bullet (exposure `min(1, years/3)` is the trial in effect) and U11 case (j) for the advisor "claimed versus true" (`advisors/team.ts:46-54,220-225`).
- `kinProblems` mutuality: L3 names a spouse sid linked twice and a flagged record no anchor links; L4 adds the pair-edge half.
- S11 `sid:` scan: L9 builds the heir spouse's overrides in `modules/heirs.ts` (`heirSpouseOverrides`) so `life.ts` stays clean; S11's no-met-key life uses `withFlags({ social: false })`; the E16 rehearsal lists tests that assert an unstamped state.
- `staff.ts` hunks: the carried-read `learn` is after `b.staff.push(s)` (:222), E13's `hired_me` is at :222-224 (the `:219` anchor was the `morale:` line), E13 depends on U6, and the "20 lines apart" claim (C18, X1, matrix, U-A7, E-A9) is corrected.
- `society/contract.ts` matrix row and its ordering rule; `edge-write.ts` and `edge-step.ts` matrix row.
- Slot schedule: section 1.3 gains the 9-lane, 3-test-agent rule and four batches (the largest unordered set is 12 after the review).
- `EdgeMap` type defined in E6 (and `edgeLocalBound`, `liveFeuds`, `openDebts` listed in the contracts).
- P5 before P2, P3 and E4 (every task that adds a `moved-tests.md` row is downstream); the `society.acts` group rows move from E9 to E10.
- `data.kin` gives an NpcLife (`npc-lives.ts:241`): stated in L5, X38 and `docs/KIN.md`, with the 30-Person cap, the `trapRng` case and the nepo-coworker collision test; the key is not changed.
- Secrets leak once and the mentor storage: a leak sets `p`, `leakPass` skips it, the `society.acts` entry is stamped by `social.ay`, the mentor baseline is `social.ms` (3 pairs); the damage bound is folded into the existing `gossip-hops` row, so the 20 ceiling rows stay 20.
- Debt token length: `debtToken(kind, year, key, extra?)` (year first, 8 hex of the key, under 40 characters) replaces tokens built from long edge keys (`ledger.ts:89,177` cut at 80); E10, L6, L7 and the heir contract use it, with a two-40-character-sid test.
- Met worst case: 10,401 nodes (400 x 22 + 200 x 8 + root) replaces 9,600 in the Registry plan, P2, C35, section 7 and the life-heirs state paragraph.
- L9, feud rung for rivals: the sentence "the feud rung travels with the edge" is replaced by "only on a kin edge (X28); a rival's feud ends at the hand-over".
- NPC wages (F18): the aggregate is folded into the existing `npc-wage` row (L12 measures the multiple instead of citing 3.5), and the release notes and E-lists say F18 is only partly closed.

### Skipped

- Favor decay and a giver wealth term (E10 and E7): skipped because `Edge.o` is also the mirror of `WealthTies.owes` (E7 legacy sync), so decaying `o` would fight the sync, and a wealth term in capacity is a design call that touches E7's parity-sensitive step; the roadmap probe word "decay" is left to the owner (recorded in "Design 7 departures in R4", row 6, and the favor cooldown plus the reach cap remain the bounds).
- Adding `mgr`, `out` and `rvl` to `SID_KINDS` now: skipped because an `out` kind clashes with the grammar rule that no sid starts with `out.` (the nepo stand-in ids), and the list is append-only so R6 adds the kinds the S3 inventory names, with new golden rows appended.
- Registering recorders E2, E3, L1 and U1 as dependents of P5: not needed (recorders add no `moved-tests.md` rows); P5 gates P2, P3 and E4 instead, which covers every row-adding task.
- A new Life task for real cousins and popup in-laws (the proposed 120-line task): declined as the finding itself advised, because it moves the draw order of seeded wealth popups.
- Putting the society act menus behind `lazyView`: not possible, they are synchronous menu logic (UNVERIFIED that any lazy form exists); the lazy chunk covers the view-layer profile only.

### Refuted (not applied)

- Exit gate "the old-save matrix migrates": refuted; "migrates" means loads and plays unchanged (roadmap lines 480, 1010, 1097), X6 and risk 11 already send the stamp-new-lives-only choice to the owner, and the pure overlay replaces migrate-on-read (menu purity).
- RF2 foresight (no read after `g.year`) unowned in R4: refuted; RF2 belongs to R0-2, R1 X.G1 and R3 H.13, no R4 caller reads past the present, and `kinView` has no UI reader.
- Review Focus RF1-RF8 not mapped and no year-step time test: refuted; `test/save-perf.test.ts:93-110` gates the light life's `ageUp` (160 ms) and clone-plus-encode (200 ms) and `test/world2-performance.test.ts` times the world step, and after the flip they time a stamped life; at most a traceability nit.

### Observed while applying (not review findings; recorded, no task edited beyond the notes above)

- `typicalIncome` is `events/wealth-core.ts:54`, domain `events`; E10's loan cap and E12's fee need it, and a direct import adds a `society->events` pair that X26 does not approve. Noted in E10's Risks: the seam must take it without that pair (a layer-2 copy held equal by a test, or the lead lifts the function), to be decided at the first `layers.test.ts` run.
- The `fam.early` rule (finding 13) is a small design addition to E9, needed so the reserve protects `nepo`, `will` and `social` from the luxury choice; the lead should confirm it with the other E9 decisions.
- The nepo outcome notice, `A Lender Calls` and `A Falling Out` interplay in the saturated year follows the hook order wealth (money 70), use (80), nepo (90), will (100), social (close).
