# Living World Roadmap

> **For agentic workers:** this is the programme roadmap, not a task list. Each release gets its own spec and plan when it starts (part E). Release R0 (part C) and release R1 (part D) are detailed enough to start now: use superpowers:subagent-driven-development (or superpowers:executing-plans when you run the tasks inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** turn AnotherLife from a game where the player is the only entity into one where everything is accounted for: money, goods, people, homes and jobs exist once and are conserved; research of every kind runs on one effort engine fed by staff quality, ambition, labor and money; the player knows only what they have researched; wars, news, relationships, shows and every special job have the depth business has. First fix the bugs and exploits in today's game, then give Profit and Loss real graphics, then build the foundations, then the features, then gate the whole thing on the depth rubric.

**Architecture:** thirteen releases in four phases. Phase 1, fixes: R0 (v4.0.3) patches fourteen verified defects and probes four more. Phase 2, foundations: R1 (v4.1.0) ships what the player can see (a chart kit, Profit and Loss graphics, search, a notice digest, the text picker) while the test platform and guards are laid underneath, and R2 (v5.0.0) ships the world kernel (one money ledger, `g.world`, save v3, RNG streams). Phase 3, features: R3 to R11 build the Effort Engine, the Knowledge System, the Society layer, the Paper, Careers kit v2, wars and the UN, the Show Circuit, the living population and the remaining careers on that kernel. Phase 4, the gate: R12 (v6.0.0) turns the depth rubric into a CI gate. Every release is a train of parallel tracks merged on a release branch, as v4.0.0 was.

**Tech Stack:** TypeScript (strict), React 19, Vite, Vitest. No new runtime dependency. R1 makes `esbuild` an explicit devDependency (it is installed today only through wrangler) for the import-cycle test.

**Spec:** `docs/superpowers/specs/2026-10-20-living-world-design.md` (cited as "design section N"; sections 1 to 16 are fixed). It wins over this roadmap on design questions; this roadmap wins on order, size and tests. Evidence digests, for numbers only: `/tmp/claude-0/-home-user-snag/91204518-72c3-5880-a3f8-357fc9b44d53/scratchpad/plan-audit/{A-world-kernel,B-wars-government,C-research-invention,D-relationships-people,E-news-events-text,F-product-showcase-events,G-navigation-charts-ui,H-information-model,I-special-careers,J-business-depth-rubric,K-engineering-performance}.md`. Code claims below were checked against v4.0.2 (`main` at 5f195c5) with grep, and the R0 behaviours were reproduced with throwaway probes.

## Global Constraints

- Saves: `SAVE_SCHEMA` stays 2 in R0 and R1; every new saved field is optional, validated by its own reader and bounded; `test/fixtures/save-v1.json.gz` loads in every release; save v3 chunking (R2) reads old saves for one release (design section 13).
- Determinism: one seeded stream; no `g.rng` draw in a pure read; from R2 new world modules draw only from `stream(g, tag, year, id)` (design section 4); R0 and R1 add no draw to an existing sequence.
- Money: every dollar booked once; from R2 with a named counterparty and a declared mint or burn; before R2 no new `earnIncome`, `spend` or `addMoney` call in a new file (the R1 ratchet fails on one).
- Foresight: nothing reads year+1 except `invest/instinct.ts`, the documented exception behind the Investing talent (R1 scan enforces it).
- Ceilings: every growth term has a real-world ceiling and a probe at 100 times the input (the lesson of the trillion-dollar studio loop); R&D cost belongs to the product, never to the buyer's wealth.
- Authorization lives inside actions; menus, hints and views are pure; every yearly step is idempotent by a year stamp.
- State: every list is capped; the JSON node cap stays 500,000; each release block states the nodes it adds (a budget, not a measurement).
- Voice: `docs/VOICE.md` (log 90, outcome 120, scene 140, tooltip 120, digest 110 characters; choice labels 5 words); no U+2014 in any file (the guard caps `src` at exactly 24 today); contractions; documentation has no em-dash or en-dash either.
- Models (`CLAUDE.md`): Sonnet for implementation, review and planning; Opus only for one heavy task at a time after Sonnet failed it; never two Opus sessions at once.
- Commits: explicit pathspecs, never `git add -A`; every message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13`.
- Checks per task: `npm run typecheck` plus the named `npx vitest run --maxWorkers=1 <files>`; the full suite runs in CI only (36 minutes unsharded today; sharded from R1).
- Envelope: no release above 28,000 source lines or 9 parallel tracks (v4.0.0 shipped 24,175 source lines with 9 tracks); every feature release ships dark behind flags until its probes pass, with `docs/RELEASE-vX.Y.Z.md` and a `package.json` version bump.
- Compatibility: "Saves from v4.0.2 load unchanged" is true in every release; a seeded test that moves must be explained in the PR, never silently re-baselined (R2 is the one planned exception).

## Review Focus

Each line is pinned by a named test in the owning task or release.

1. **RF1 Money from nowhere.** No new term pays without a payer and a ceiling; the ratchet and, from R2, the conservation probe fail on one. R0-1, R0-3, R0-6, R0-7, R0-8, R0-13, R0-14, R1 X.G1, R2 A.K1.
2. **RF2 Foresight.** No menu, hint, estimate, tip, odds line or rumour reads a year after `g.year`, except the fenced Investing gut. R0-2, R1 X.G1, R3 H.13.
3. **RF3 Heirs.** World state survives `continueAsChild` by construction; personal state does not. R0-4, R0-13, R1 A.K0, R2 A.K2, R4 A.K8.
4. **RF4 Hostile or old saved records.** Garbage, NaN, 500-row lists, another owner's record and a v4.0.2 save load, render and stay bounded. Every release.
5. **RF5 Replay and purity.** A yearly step run twice, a menu rendered twice under `deepFreeze`, a Time Machine fork and a reload give identical JSON. Every release.
6. **RF6 Clutter and repetition.** Popups, log lines and repeated text stay under the measured budgets of design section 9. R1 G.11, R2 E.T3, R3 E.D2.
7. **RF7 Information honesty.** A shown band holds the truth about 80% of the time; the same source twice in a year returns the same number. R3.
8. **RF8 Size and speed.** Per-click cost, year-step time and saved bytes stay inside the budgets of part F. R1, R2, every release.

---

# A. Programme summary

## A.1 Release list

Sizes are planned source lines, then test lines (ratio per area in A.6), then agent-hours at 4.1 per 1,000 source lines (digest K's cost model, from v4.0.0: 72,081 lines in 14 hours with 9 tracks), then wall-clock hours with the stated tracks (agent-hours divided by tracks, plus 15% integration tax, plus five sharded CI runs). Docs are 1,800 lines a release (spec, plan, notes, architecture).

| Id | Version | Theme | What the player sees | Source | Tests | Agent-h | Tracks | Wall h |
|---|---|---|---|---|---|---|---|---|
| R0 | v4.0.3 | Honest numbers | Fake followers stop paying, tips stop reading next year, laws survive heirs, a sibling keeps the family firm, no free CEO profit, a tariff cut no longer draws retaliation, a divorce order is what the judge set, era and country ceilings on deals and Olympic bonuses, a podcast audience that stops growing at the size of the biggest real shows, readable text colours | 690 | 1,620 | 14 | 3 | 7 |
| R1 | v4.1.0 | See it | Profit and Loss waterfall and 30-year book charts, cash walk, rank ladders, search and pins, one OK for a run of notices, Quiet Mode inbox, keyboard and focus fixes, saves in IndexedDB | 14,400 | 10,486 | 59 | 4 | 17.8 |
| R2 | v5.0.0 | Every dollar has a counterparty | Exact cash walk, 88% cheaper taps, smaller saves, text that stops repeating | 19,600 | 22,578 | 80 | 4 | 24.1 |
| R3 | v5.1.0 | Effort, fog and quiet years | Odds with named reasons, burnout and posture, estimates with chips and "Look closer" research, one year card of 8 lines | 24,700 | 28,720 | 101 | 6 | 20.5 |
| R4 | v5.2.0 | People who remember | Recurring named people, memories that change dialogue and odds, favors, feuds, real in-laws, heirs who inherit friends and feuds | 16,900 | 20,024 | 69 | 4 | 21.1 |
| R5 | v5.3.0 | The Paper | A newspaper with outlets and bias, offers and exposes, composed dialogue with memory, gossip, a 35% smaller first download | 16,900 | 18,252 | 69 | 4 | 20.7 |
| R6 | v5.4.0 | Careers kit v2 | Contract ledgers with real payers, agents and teams, awards, exits; Author and Game Employee at business depth; real job vacancies; thesis and PhD | 23,200 | 24,624 | 95 | 5 | 22.7 |
| R7 | v5.5.0 | The President's war loop | Ultimatum to peace as President, treaties, UN votes with shown odds, fictional leaders, war record, fog of war, 2027+ conflicts | 15,100 | 17,864 | 62 | 4 | 18.6 |
| R8 | v5.6.0 | War economy and uniformed careers | Bonds, rationing, refugees, defense sector, general, journalist, spy, Politician and Military at business depth, landlords and depositors, weapons secrecy | 23,300 | 26,460 | 96 | 6 | 19.2 |
| R9 | v5.7.0 | The Show Circuit and every trade | About 90 fairs with booths, keynotes and rivals in the room; 17 more trades with an Operations Desk; inventions in medicine, software, finance, art, sport; goods flows | 27,900 | 29,500 | 114 | 8 | 17.4 |
| R10 | v5.8.0 | Population, Underworld, Sports | Real jobs, homes and firms for strangers; Underworld with crews and heat; league clubs, drafts, franchise ownership | 26,500 | 27,900 | 109 | 5 | 26.0 |
| R11 | v5.9.0 | Creators and the rest | Influencer and fame, finished actor, astronaut, model, musician, journalist, scientist, intelligence careers | 19,000 | 19,500 | 78 | 5 | 19.0 |
| R12 | v6.0.0 | The depth gate | Rubric passes in CI for business and all 11 careers; nightly 160-year probes; optional desktop two-pane | 4,300 | 4,168 | 18 | 2 | 11.3 |
| | | **Total** | | **232,490** | **251,696** | **964** | | **245** |

Agent tasks (about 1,100 source lines each, the careers slice 1 average; R0 is its 16 tasks): R0 16, R1 13, R2 18, R3 22, R4 15, R5 15, R6 21, R7 14, R8 21, R9 25, R10 24, R11 17, R12 4, total 225. Source after the programme: 264,000 plus 232,490 is about 496,000 lines.

## A.2 Order principle

Visible wins first while foundations build underneath. R0 is cheap and removes the exploits before anything new builds on them. R1 answers the owner's "better profit and loss graphics, better player navigation" with the smallest foundation that is also a deliverable: the chart kit, the book series, search, the digest and the text picker. R2 is the one release with little to show and everything to carry, so it follows R1 immediately. After that the order is dependency order (A.3). People (R4) come before the Paper (R5) because digest E's detectors and reputation need `Edge` and memory records, and the composer needs per-person memory. Four departures from the suggested sequence, each with its reason:

1. **Year digest and pacing move up to R3** (design section 9: `closeYear`, weights, family pacing). They depend only on the kernel and the UI work, and every release after R3 adds popups; building them under the budget is cheaper than retrofitting. The text codemod moves into R2, next to the one planned seed rebaseline (digest K, decision "one global rebaseline").
2. **Wars split in two (R7, R8).** Digest B alone is 22,000 source lines. R7 is the digest's own "playable President war loop" (B.1 to B.6 plus fog, the War Record and politics fog). R8 carries the war economy and the uniformed careers, because Military and Politician need B.4 and B.5.
3. **Underworld and Sports (R10) and the creators and leftovers (R11) are separate trains.** Digest I is 60,000 lines; one train would break the 28,000-line envelope. R10 owns the population pools because rosters and crews need them.
4. **The gate is its own release (R12).** The rubric registry (J.1) is advisory from R1; flipping it to a failing test needs every module finished, so the flip is the last release.

R5 and R6 can run in parallel (neither needs the other), and so can R10 and R11 (A.4). That is an option, not the default: it needs 9 and 10 tracks and the owner reviewing two trains at once.

## A.3 Dependency graph (text)

Arrows mean "needs". Item-level edges are in each release block; this is the release-level graph computed from them (no cycles).

```
R0  (none)
R1  <- R0 (clean base). Wave 0 of R1 (K.1, K.7a, K.11, A.K0, X.G1, K.5a, E.T1) feeds R2.
R2  <- R1 wave 0
R3  <- R1 (G.2, G.11, J.1)           <- R2 (K.3, A.K1, A.K2)
R4  <- R1 (G.8)  <- R2 (A.K2, K.6, A.K1)  <- R3 (H.1)
R5  <- R2 (E.T3, K.3, A.K1)  <- R3 (H.1, H.3, C.6)  <- R4 (D.3)
R6  <- R2 (A.K1)  <- R3 (E.D2, H.1, C.1)  <- R4 (D.1, D.3)
R7  <- R2 (A.K1, A.K2, K.3)  <- R3 (H.1)  <- R4 (D.1)  <- R5 (E.N1)
R8  <- R2  <- R3 (C.1, C.6, H.1)  <- R4 (D.1, D.3)  <- R6 (I.Kit2)  <- R7 (B.4, B.5)
R9  <- R1 (G.4)  <- R2  <- R3 (H.4, C.6)  <- R4 (D.4)  <- R5 (E.N1, E.T4)  <- R6 (I.Kit2)  <- R7 (B.5)
R10 <- R2 (K.6)  <- R3 (H.1)  <- R4 (D.1, D.3)  <- R6 (I.Kit2)  <- R9 (F.1, J.5)
R11 <- R3 (H.2)  <- R5 (E.N1)  <- R6 (I.Kit2)  <- R9 (F.8)
R12 <- every module registered in the rubric registry (J.1), so R2 to R11
```

## A.4 Critical path

Serial order (the default): R0, R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12 = 245 wall hours. Dependency critical path: R0, R1, R2, R3, R4, R5, R7, R8, R9, R10, R12, with R6 beside R5 and R11 beside R10 = about 206 wall hours (7 + 17.8 + 24.1 + 20.5 + 21.1 + 22.7 + 18.6 + 19.2 + 17.4 + 26.0 + 11.3). The long pole is the foundation: R1 to R4 are 83.5 hours before a single feature release.

## A.5 Notation, naming and what was merged

Item ids carry the digest letter. Area A items are written `A.K0` to `A.K9` (the digest calls them K0 to K9); area K items are `K.1` to `K.11`; area E items are `E.T1` to `E.T7`, `E.D1` to `E.D4`, `E.N1` to `E.N8`; the other areas are `B.1` to `B.14`, `C.1` to `C.12`, `D.1` to `D.12`, `F.1` to `F.11`, `G.1` to `G.14`, `H.1` to `H.13`, `J.1` to `J.10`. `I.*` are the careers of digest I. `X.G1` (guards) and `X.G12` (the gate) are roadmap-only items. Item sizes in the tables are planned source lines.

Shared things, one each (design sections 4 to 9): **one money ledger** (A.K1, which is digest K's K4; counted once), **one effort engine** (C.1; J7 is C.3), **one knowledge record** (H.1), **one people registry** (A.K2's `EntityRef` index plus D.1's latent and Met tiers), **one news fact feed** (K.3's bus and `worldLog` plus E.N1's detectors), **one text picker** (E.T1; K.9 is only build-time validation), **one careers kit** (I.Kit2 is J2).

Conflicts between digests and how this roadmap resolves them:

| Conflict | Resolution |
|---|---|
| Where world state lives: A says `g.world`; D, C, B, F say owner-stamped or world flags | World entities and world slices go to `g.world.<slice>` (people, frontier, geo, shows); only the player's own records stay in owner-stamped flags (edges, `know`, `effort.you`, `textMem`, `inbox`). The R0-4 whitelist bug cannot recur for `g.world`. |
| Company book history: G says 20 years, J's rubric R9 says 30 | 30 rows (`recordYear` caps at 10 today and the reader at 12; both become 30); about 690 numbers a company, 20,700 nodes at 30 companies (4% of the node cap) |
| Cost per company-year: A cites 80 ms, K measured 2.0 ms | Both are right: 2.0 ms is a light firm, 80 ms an elite firm (LIVING-WORLD.md). Budgets use 80 ms for the 20 full `BizState` firms A allows and 2 ms for `FirmLite` |
| Test volume: F plans 2,500 test lines, I plans 30,000, K says 1.0 to 1.5 times source | Careers slice 1 measured about 1.1 times (17,500 to 17,900 test lines on 16,200 source; digests I and J differ on the model's test count). The roadmap budgets 1.0 for E, F, I, J, 1.2 for A to D and H, 0.56 for UI |
| Careers total: I's per-career figures sum to about 70,000, its stated total is 60,000 | 58,300 planned under I plus 2,000 for B.9, the war half of Military: 60,300. The 70,000 case is in the high estimate |
| J2 "kit extensions" versus I's kit K1 to K11 | One item, I.Kit2, which also gains J's `auto` (hired agent mode with mandate and letter) |
| Ledger: A.K1 (M) versus K.4 (L) | One item at 2,500 lines under A.K1 |
| Save diet: A.K9 versus K.5 | A.K9 is the world-specific part (drop `previous`, history 32 to 16 years, `pack()` chunks `world.*`); K.5 is the generic slice and chunk machinery |
| Digest closes in the store flow or in headless `ageUp` (E) | Store flow (`store.ageUpAction`), as E recommends: 256 test files read `g.queue` |
| History is fixed before 2026 (B, C) | Yes; only the future is emergent; a divergence budget bounds a President's changes (design section 8) |

## A.6 Size ledger

Planned source lines by area, with the area total the digests state in brackets, and the test ratio used.

| Area | Planned | Digest | Tests x | Notes |
|---|---|---|---|---|
| A world kernel | 22,800 | 24,300 by class | 1.2 | A.K0 to A.K9; A.K5 (pools) alone is 7,000 |
| B wars | 22,000 | 22,000 | 1.2 | items fitted to the stated total; B.9 is 2,000 |
| C effort | 19,200 | 2,500 (core only) | 1.2 | the digest sizes the folder, not the migrations |
| D people | 20,000 | 20,000 | 1.2 | |
| E news and text | 15,300 | about 30,000 with tests | 1.0 | |
| F show circuit | 9,000 | 9,000 | 1.0 | digest says 2,500 test lines; raised to 1.0 |
| G navigation and charts | 11,200 | 16,000 to 20,000 with tests | 0.56 | UI is tested through pure functions |
| H information | 17,600 | 21,000 by class | 1.2 | |
| I careers | 58,300 | 60,000 | 1.0 | the war half of Military is B.9 |
| J business depth | 15,800 | by class | 1.0 | includes X.G12 (the gate, 4,000); J2, J3, J4, J7 are counted under I and C |
| K engineering | 20,600 | 22,000 | 1.14 | includes X.G1 (400); the ledger (3,000 in the digest) is A.K1; K.10 (2,500, conditional) is excluded |

The areas sum to 231,800 over R1 to R12; R0 adds 690: 232,490. Tests: 250,076 over R1 to R12 plus 1,620 for R0: 251,696.

---

# B. The releases

**Worktree layout (every release).** The lead creates `release/<version>` from `main`. Each track gets `git worktree add ../wt/<rel>-<track> -b claude/<rel>-<track> release/<version>`. Tracks merge into the release branch in the order a block lists them, never into `main`. A track rebases on the release branch at least every 4 hours (hot files) and before its last CI run. A hot-file edit is additive and sits in its own hunk (the v4.0.0 rule). From R1 every track branch gets a preview deploy (K.11). From R2 a track adds its module through one line of the sorted registry (K.3) and writes its own note under `docs/` instead of appending to `docs/ARCHITECTURE.md` (16 commits touched it in v4.0.0). The lead runs five integration CI runs per release (v4.0.0 needed five and three were red).

**Reading a block.** Lines are planned source lines; the items of a block sum to its total. "State" is the saved JSON nodes the release adds, a budget and not a measurement (today about 125,000 nodes at 12 companies against a cap of 500,000; end of programme about 180,000, 36% of the cap). "Opus candidates" are the only tasks that may escalate to Opus, one at a time and only after Sonnet failed them (`CLAUDE.md`). Item names are in A.5 and the model behind every size is in A.1 and F.4.

## R0 v4.0.3 Honest numbers

**Goal.** Remove fourteen verified exploits and defects before anything builds on them, probe the last three Priority 0 items of the repo's own roadmap, and measure the promotion ceiling. Detailed in part C.

| Track (worktree) | Tasks | Hot files |
|---|---|---|
| `claude/r0-money` | R0-1 followers, R0-3 CEO mint, R0-6 divorce, R0-7 sports and Olympics, R0-8 author, R0-9 studio awards, R0-12 pay scale, R0-14 podcast | `business/yearly.ts`, `love.ts`, `special/social.ts`, `special/common.ts`, `special/fame.ts`, `special/military.ts`, `special/hustler.ts`, `special/sports-olympics.ts` |
| `claude/r0-world` | R0-2 tip, R0-4 heirs, R0-13 siblings, R0-5 tariffs, R0-10 text, R0-11 contrast | `life.ts` (R0-4 and R0-13 in separate hunks, in that order), `npc-lives.ts`, `nation/govern.ts`, `investments.ts`, `ui/styles/global.css` |
| `claude/r0-verify` | R0-15 the four probes | `business/finance-firm.ts`, `competition-state.ts` (read only unless a fix is one function) |

R0-14 needs the `payScale` helper of R0-12, so both sit in the money track, R0-12 first. R0-16 is the release, run by the lead after the three tracks merge.

**Size.** 690 source, 1,620 test, 150 docs lines; 14 agent-hours, 16 tasks, 3 tracks, about 7 wall hours. State +0 nodes for a life that never bought followers or inherited a sibling's firm (one optional `fake` number per social account; about 375 nodes for each sibling firm an heir inherits).
**CI.** One full unsharded run (36 minutes) before release, plus the 28 files of the regression set (C.2).
**Exit gate.** Every R0 test red before its fix and green after; full CI green; no seeded baseline moved (no new `g.rng` draw; the one pinned assertion R0-13 edits is a changed expectation, not a changed seed); release notes list the player-visible changes.

## R1 v4.1.0 See it

**Goal.** Profit and Loss graphics, navigation and calmer notices, with the foundations R2 needs (test platform, guards, text picker, safe saves). Detailed in part D.
**Needs.** R0 merged.

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Charts | G.1 600, G.2 2,300, G.3 700, G.4 1,300, G.5 700, G.6 600, G.7 600 | 6,800 | `business/state.ts`, `economy.ts`, `yearly.ts`, `competition.ts`, `competition-state.ts`, `ui/minigames/AnnualReport.tsx`, `aging.ts`, `global.css`, `business.css` |
| Navigation | G.8 800, G.9 900, G.11 500, G.12 500, G.14 200 | 2,900 | `types.ts`, `ui/store.ts`, `ModalHost.tsx`, `MenuList.tsx`, `Sheet.tsx`, `menus.ts`, `core.ts` |
| Platform | K.1 300, K.7a 500, K.11 300, K.5a 600, A.K0 300, J.1 1,000, X.G1 400 | 3,400 | `.github/workflows/ci.yml`, `package.json`, `main.tsx`, `save-store.ts` |
| Text | E.T1 600, E.T2 500, E.T7 200 | 1,300 | `events/flavor.ts`, `scripts/voice/rules.mjs` |

Total 14,400. Wave 0 is Platform plus E.T1, merged in the first 6 hours so R2 can start from it (D.1).
**Size.** 14,400 source, 10,486 test, 1,800 docs; 59 agent-hours, 13 tasks, 4 tracks, 17.8 wall hours. State +14,000 nodes (S1 at 12 companies 7,400, S2 4,100, S3 1,100, `textMem` and inbox 1,300).
**Exit gate.** D.11 green; sharded CI wall at most 12 minutes; no new import cycle; v4.0.2 saves load.

## R2 v5.0.0 Every dollar has a counterparty

**Goal.** The world kernel: ledger, `g.world`, RNG streams, registry and bus, save v3 with chunks, the LOD framework, and the one seed rebaseline.
**Needs.** R1 wave 0 (K.1, K.7a, K.11, K.5a, A.K0, X.G1, E.T1).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Ledger and world | A.K1 2,500, A.K2 2,500, K.6 1,000 | 6,000 | `core.ts` money primitives, `types.ts`, `life.ts`, `finance.ts`, `test/fuzz-kit.ts` |
| Kernel | K.3 3,000, K.2a 1,200 | 4,200 | `aging.ts` (hooks to the registry), `special.ts`, `menus.ts`, `business/manage.ts`, about 40 cross-directory import edges |
| Save | K.5 6,000, A.K9 1,000 | 7,000 | `save.ts`, `save-schema.ts`, `save-store.ts`, `save-backends.ts`, `snapshot-codec.ts`, `timeMachine.ts`, `economy/*` |
| Platform | K.7b 1,500, E.T3 900 | 2,400 | every file with a `pick(` call, `test/*` |

Total 19,600. The E.T3 codemod and the rebaseline land first and alone, in the first 4 hours; tracks branch off the new base. Opus candidates: K.5, the A.K1 wrapper migration.
**Size.** 19,600 source, 22,578 test, 1,800 docs; 80 agent-hours, 18 tasks, 4 tracks, 24.1 wall hours. State +17,000 nodes for `g.world`, minus about 40,000 from thinning `worldEconomy` (drop `previous`, 562 KB of 1.8 MB; history 32 to 16 years, 456 KB): net about 23,000 fewer.
**CI.** Golden-digest job (canonical-JSON FNV per slice, so a failure names the slice that moved), the nightly deep tier switched on (K.7b), 4 shards.

**Acceptance.**
- A 100-year probe over 40 seeded lives: ledger accounts sum to previous plus mint minus burn each year within $1, and each year's flows net to zero per reason.
- Unreasoned `addMoney`, `earnIncome`, `spend`, `b.cash +=` and `p.money +=` calls never rise (about 460, 160 and 65 today); the government is a named payer of bond par less any default haircut (F37) and capital gains and transaction tax reach `gov:country` through the ledger (F38).
- `g.world` absent reads as empty; the v4.0.2 fixture runs 5 years; restores of Time Machine snapshots pass through `migrateSave` (F39).
- A 50-year probe holds core at most 400 KB, world at most 1 MB, 600 KB gzipped; per-tap clone plus stringify at most 8 ms for the core chunk (digest K measured 3.8 plus 2.3); light-life `ageUp` at most 160 ms desktop, 250 ms mobile.
- One extra draw on a named stream changes only that slice's golden digest (today it changes all of them). Replay, reload and a Time Machine fork give identical JSON.
- The repeated-line rate of E.T2's 13-life probe is at most half of R1's.

**Probes.** Mint and burn are declared and capped (inflation erosion, bank lending creation, write-offs, emigration). Pool prices carry bid-ask spreads (digest A: buy from the pool and sell to it).
**The player sees.** A cash walk with no "everything else" row, faster taps, saves 20 to 30% smaller, lines that stop repeating. Existing seeds play differently after the rebaseline; saves load and continue.
**Risks.** 119 pinned `seed: N` tests move: `findSeed(pred)` replaces them in every touched file. Cutting 40 import edges changes load order: keep the enter-through-each-hub tests.
**Exit gate.** Acceptance green; one full CI per integration run; a written list of every seeded test that moved and why.

## R3 v5.1.0 Effort, fog and quiet years

**Goal.** Research of every kind runs on one engine fed by staff quality, ambition, labor and money; hidden facts are estimates until researched; the year closes into one card.
**Needs.** R1 (G.2, G.11, J.1); R2 (K.3, A.K1, A.K2).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Effort core | C.1 2,500, C.2 800, C.11 300, C.12 800 | 4,400 | new `src/game/effort/*` only |
| Effort migration | C.3 2,500, C.4 1,000, J.8 300 | 3,800 | `business/rd.ts`, `heavy-rd.ts`, `lab-*.ts`, `deeptech-*.ts`, `ai-bench*.ts`, `gamestudio-engines.ts`, `workshop/*`, `yearly.ts` |
| World frontier | C.6 2,000 | 2,000 | `business/tech-waves.ts`, `workshop/market.ts`, history tech tables, `g.world.frontier` |
| Knowledge | H.1 1,000, H.2 2,500, H.3 900, H.13 700 | 5,100 | `types.ts`, `MenuList.tsx`, `vite.config.ts`, `settings.ts` |
| Fog migration | H.4 2,500, H.6 900, H.8 900, H.11 800 | 5,100 | `business/market-menu.ts`, `market-view.ts`, `competition-menu.ts`, `scorecard.ts`, `invest/instinct.ts`, `investments.ts`, `talents.ts` |
| Quiet years | E.D1 500, E.D2 1,500, E.D3 600, E.D4 200, E.T5 700, E.T6 800 | 4,300 | `core.ts` log and notice, `aging.ts`, `life.ts` quiet-year test, `ui/store.ts`, `events/wealth*.ts` |

Total 24,700. Order: core, knowledge and quiet years first; migration and fog after C.1 and H.1 merge. Migration and fog both touch `business/` menus and `yearly.ts`: serialize their merges. Opus candidate: C.3.
**Size.** 24,700 source, 28,720 test, 1,800 docs; 101 agent-hours, 22 tasks, 6 tracks, 20.5 wall hours. State +8,000 nodes (`know` 120 keys 2,000, `fx` records 3,000, frontier 3,000).
**CI.** The golden parity suite (old function against `quote` over an input grid) runs per migrated system; `setupFiles` sets omniscient mode so the 98 hint-text test files pass unchanged; fog tests flip it per file.

**Acceptance.**
- Parity grid within 1 point for Product, Heavy, Ops, deep tech, AI caps, studio and workshop.
- A 200-year probe at maximum inputs: no field above frontier plus headroom, `k` at most 4, knowledge at most 100, no money beyond the market.
- Same source twice in a year returns the same number; a stated band holds the truth about 80% of 10,000 draws; no `g.rng` in any read (the `deepFreeze` fuzz walk); `quote` never reads `u`.
- Popups a year: ordinary lives p90 3, max 5; $50M lives p90 4, max 6; tycoon mean 4 plus one "Your companies" card; a tycoon's visible log lines from 12.5 to 8; the digest at most 8 lines; every culture line at most 110 characters.
- Repeated lines at most 5% (8% rich); the same line within 10 years 0 (state lines once in 5 years); any line at most 3 times.

**Probes.** Ambition widens variance and never adds a free edge (concave, at most plus 25%). Failed research banks at most 15 odds points. Spillover at most 6 points a disclosure, one wave per origin, 2 waves a year. Intel sources are floored (trade press 20%, report 12%, analyst 8%, audit 3%); repeat buys do not average.
**The player sees.** "Odds 62%: team +9, funding +7, hard field -12, tired -4" on research; posture and burnout; ambition from 18; ranges and a confidence chip with a "Look closer" row on market, rival and hiring screens; an Intelligence Briefing hub; Settings: Realistic or Exact; hints that are honest, fallible estimates (the free analyst tip already changed in R0); one year card.
**Risks.** 207 hint sites: change the helpers, not the sites. Fog frustration: defaults are words and research pays visibly. The fog, ambition and Exact-mode decisions (D11, D13, D15) are needed first (part G).
**Exit gate.** Acceptance green; a 3-life human playthrough (research, a hire, a market) read by the owner.

## R4 v5.2.0 People who remember

**Goal.** People exist once, remember, and carry across heirs.
**Needs.** R1 (G.8); R2 (A.K2, K.6, A.K1); R3 (H.1).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Registry and persona | D.1 2,500, D.2 1,000 | 3,500 | `people.ts`, `npc-lives.ts`, `npc-state.ts`, `types.ts` |
| Edges and acts | D.3 2,500, D.4 2,500, D.12 700 | 5,700 | `core.ts` `addRelationship` shim over 374 call sites, `relationships.ts`, `events/wealth-*.ts`, `events/will-*.ts`, `love.ts` |
| Life and heirs | D.5 2,500, D.9 1,000, A.K8 1,000 | 4,500 | `life.ts` `continueAsChild`, `npc-lives.ts`, `events/will-estate.ts`, `business/dynasty-ownership.ts` |
| People UI and fog | D.10 1,000, G.10a 400, H.5 900, H.7 900 | 3,200 | `ui/components/PersonSheet.tsx`, `RelationshipsSheet.tsx`, `business/staff.ts`, `advisors/team.ts` |

Total 16,900. Golden tests of relationships, love, wealth, will and nepo land before the shim. Opus candidates: A.K8 and the `npc-lives.ts` edits (digest A: the riskiest).
**Size.** 16,900 source, 20,024 test, 1,800 docs; 69 agent-hours, 15 tasks, 4 tracks, 21.1 wall hours. State +20,000 nodes (Met 400 people, edges 1,200, secrets 40, feuds 12, memories 8 an edge; about 250 KB raw).
**CI.** 4 shards; the golden relationship, love, wealth, will and nepo files run in the fast tier.

**Acceptance.**
- A 120-year seeded probe: no NaN, bounds held, conservation (estates settle once, NPC wages need a payer), the same names for the same seed.
- Eviction never drops a debt, spouse, heir or company link.
- Heir switch: kin edges copy at 0.5 of trust and affection and 0.6 of resentment; debts survive through the estate; a sibling keeps the firm instead of cash (the pin at `test/nepo-year.test.ts:392` changes on purpose); a divorce deficiency becomes an obligation (F36).
- `Person.relationship` keeps today's numbers (golden parity); one popup budget of 3 family popups a year; menus pure under `deepFreeze`.

**Probes.** Favor farming (cap by reach, decay, one call-in per person per 3 years); marriage for wealth (shown wealth is not spendable); loan-shark spiral; gossip hop cap 2; adoption to inherit (estate taxed); mentorship bonus at most x1.15.
**The player sees.** The banker you met in 2031 is the minister in 2040; dialogue and odds shift with what happened; real in-laws and cousins; a person profile with "known" and "unknown" rows; heirs inherit friendships and feuds.
**Risks.** The shim touches 374 call sites and 131,000 test lines, so golden tests come first. Eviction and heir switches are the likeliest places to lose a debt. Popup budgets across four yearly hooks (wealth 3, nepo 2, will 1) must become one.
**Exit gate.** Acceptance green; the old-save matrix (v4.0.2 fixture, a life with 20 exes, a life with a family firm) migrates.

## R5 v5.3.0 The Paper

**Goal.** News is facts rendered through outlets; text is composed with memory; the first download shrinks.
**Needs.** R2 (E.T3, K.3, A.K1); R3 (H.1, H.3, C.6); R4 (D.3).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Facts and Paper | E.N1 1,500, E.N2 1,200, E.N3 600, E.N4 500, E.N6 1,200, E.N8 400 | 5,400 | `history/events.ts`, `history/market-events.ts`, `economy/*` detectors, a Paper screen, `LifeLog.tsx` |
| Offers, reputation, composer | E.N5 1,200, D.7 1,000, E.T4 1,800, D.11 800, C.10 900 | 5,700 | `relationships.ts` talk summary, `events/wealth*.ts`, `business/tech-waves.ts`, `text/*` |
| Bundle and pipeline | K.8 2,000, K.9 2,000 | 4,000 | `vite.config.ts`, `ui/store.ts` (`ensurePacks`), era-pack files, `scripts/voice/*` |
| Cycles | K.2b 1,800 | 1,800 | about 90 inner modules of the 85-module component |

Total 16,900.
**Size.** 16,900 source, 18,252 test, 1,800 docs; 69 agent-hours, 15 tasks, 4 tracks, 20.7 wall hours. State +6,000 nodes (3 editions plus a 30-year front-page archive at most 30 KB, `textMem` 8 KB). CI goes to 8 shards (9 minutes).

**Acceptance.**
- Stories keyed `${year}:${kind}:${subject}` are idempotent; outlets are fictional; tabloids round up at most 20%; rumours read current state only.
- Offers pay only from a real NPC firm (an endorsement at most 2% of its marketing spend) through the ledger.
- 4 seeded lives to 90: repeated lines at most 5% (8% rich), shared 3-word openers at most 12% (20% rich), a popup family at most 6 a life with gaps of 4 or more, a person's last 8 topics distinct.
- Initial bundle at most 5.5 MB (from 8.3); a bundle-budget test replaces `chunkSizeWarningLimit: 8000`; the cycle baseline shrinks to the modules still pending.

**Probes.** Hook money capped; buzz capped; no foresight in rumours; folding never hides a weight-3 item or a notice before a choice.
**The player sees.** A Paper with a front page and 33 stories an edition, outlets that lean, stories about you by fame (local 15, national 35, front page 60, world 85), offers and exposes in "Tips and Offers", talks that remember, gossip and reputation by group, a first download 35% smaller.
**Risks.** Changed text draws shift about 31 test files that mention `pick` (one draw per pick, one family per PR). Async data packs break synchronous assumptions in tests and the Time Machine (tests preload). Folding can hide something important: review the weight-3 list.
**Exit gate.** Acceptance green; async data packs pass the Time Machine and test-preload checks.

## R6 v5.4.0 Careers kit v2

**Goal.** The shared kit gets what business has (ledger with real payers, team, peers, awards, exits, legacy, news, fog, text, showcase stub, pace, automation); Author and Game Employee prove it.
**Needs.** R2 (A.K1); R3 (E.D2, H.1, C.1); R4 (D.1, D.3).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Kit v2 | I.Kit2 5,800 | 5,800 | `special/kit/*`, `special.ts` yearly tuple, `menus.ts`, `test/career-kit.ts`; its interface freezes within 8 hours |
| Author | I.Author 5,000 | 5,000 | `special/author*.ts`, `special/kit/careers.ts` |
| Game employee | I.GameEmp 4,000, G.10b 400 | 4,400 | `special/gamedev*.ts`, studios as employers |
| Cast and jobs | A.K3 2,500, D.6 3,000 | 5,500 | `careers.ts`, `cv.ts`, `business/staff.ts`, `special/kit/rivals.ts` |
| School and practice | C.5 2,500 | 2,500 | `education.ts`, `special/athlete.ts`, mind and body practice |

Total 23,200. Kit v2 and Author start together; the rest wait for the kit interface.
**Size.** 23,200 source, 24,624 test, 1,800 docs; 95 agent-hours, 21 tasks, 5 tracks, 22.7 wall hours. State +6,000 nodes (kit records stay under 6,000 nodes a career).
**CI.** New career files join `CAREER_SETUPS` and the money-scan regex; the 60-year probes run nightly with a 20-year slice per PR.

**Acceptance.**
- `career-money-scan.test.ts` covers every new career file; payers are world entities with a yearly talent budget.
- A 60-year probe in 3 strategies keeps income within a multiple of `typicalIncome`; an heir probe (heirs inherit assets, not records); idempotent `settleYear`; render purity under `deepFreeze`.
- Real vacancies: persons with `jobId` equal filled slots, one full-time job each, wage bill equals pay flows.
- Rubric advisory print: Author and Game Employee at least 2 on every dimension.

**Probes.** Adaptation, publisher and brand payers have ceilings (the R0 caps become budgets); no income above the payer's budget at 100 times the input.
**The player sees.** Contracts with named payers, an agent, manager or editor whose quality changes odds, awards, three exits per career, a coworker who stays, real openings on the job board, thesis and PhD as effort.
**Risks.** Each career moves its own RNG stream. Kit modules must stay free of `g.rng` in reads. A kit interface that moves after the freeze makes four tracks rework.
**Exit gate.** Acceptance green; a human playthrough of an author life and a studio life.

## R7 v5.5.0 The President's war loop

**Goal.** One conflict ledger replaces six restatements of the same wars; a President can run the whole ladder from ultimatum to peace.
**Needs.** R2 (A.K1, A.K2, K.3); R3 (H.1); R4 (D.1); R5 (E.N1).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Conflicts and nations | B.1 1,800, B.2 1,800, B.3 1,800, B.4 1,800 | 7,200 | `history/events-wars.ts`, `history/events.ts` headline rows, `economy/trade.ts` (flat 0.3 restriction), `data/immigration-blocs.ts`, `business/market-trade.ts`, `nation/state.ts`, `nation/drama.ts` |
| President and UN | B.5 1,600, B.6 700, G.10c 400 | 2,700 | `nation/*`, `special/politics.ts` (`powerFor`), `nation/legislature.ts`, `nation/menu.ts` |
| Fog and record | B.11 700, B.13 700, H.9 2,200 | 3,600 | `nation/menu.ts`, `economy/menu.ts`, `ui/minigames/NationReport.tsx` |
| Tests | B.14 1,600 | 1,600 | `test/fuzz-politics*`, probes |

Total 15,100. Opus candidates: B.3, B.4.
**Size.** 15,100 source, 17,864 test, 1,800 docs; 62 agent-hours, 14 tasks, 4 tracks, 18.6 wall hours. State +5,000 nodes (`g.world.geo`, about 60 KB worst case, 24 active conflicts, 60 archived).
**CI.** 120-year war probes nightly, 20 years in the PR tier; the `fuzz-politics` modes run nightly.

**Acceptance.**
- A life that never touches foreign policy plays byte-identically to R6 (test); casualties equal the sum of person outcomes; old saves load with no conflict ledger.
- 120-year seeded probes: concurrent wars at most 24, debt cap 2.5, inflation shock at most 0.15, state at most 60 KB; hawk, dove and appeaser modes in `fuzz-politics`.
- 2026 conflicts are `open` (no invented outcome in or before 2026); no nuclear use; fictional leaders only; a detail toggle in Settings; at most one war popup a year.
- The divergence budget changes the player's own country and moves an outcome date by a few years at most; other nations' scripted wars still start without real deterrence.

**Probes.** Rally farming (decay in 3 years, 4-year cooldown), one-click history rewrite, diplomacy spam (capital cost), reparations at most 3% of GDP a year and ending, insider trades on your own declaration open a case.
**The player sees.** Ultimatum, deploy, strike, blockade, declaration (a legislature vote with honest odds), mediation, ceasefire, peace terms; summit, treaties, UN resolutions and vetoes with shown odds; polls with a margin of error; a War Record screen; conflicts in 2027 and later.
**Risks.** Taste and safety: aggregates only, no atrocity button, no real living leaders. Moving war facts from six places into one can change headlines, so the parity table gates it.
**Exit gate.** Acceptance green; the owner plays a President through one scripted war and one procedural one.

## R8 v5.6.0 War economy and uniformed careers

**Goal.** War costs money and changes industries; Military and Politician reach business depth; property and banks get real counterparties.
**Needs.** R3 (C.1, C.6, H.1); R4 (D.1, D.3); R6 (I.Kit2); R7 (B.4, B.5).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| War economy | B.7 1,800, B.8 1,400 | 3,200 | `economy/trade.ts`, `economy/government.ts`, `nation/trade-policy.ts`, `business/sector-*.ts` (defense family) |
| Roles | B.10 3,600, B.12 700 | 4,300 | `special/kit/*`, `business/staff.ts` |
| Military | B.9 2,000, I.Military 3,500 | 5,500 | `special/military.ts` |
| Politician | I.Politician 4,000 | 4,000 | `special/politics.ts`, `nation/*`, `special/corruption.ts` |
| World money | A.K4 2,500, A.K6 1,000 | 3,500 | `assets.ts`, `landlord.ts`, `business/bank*.ts`, `finance.ts` |
| Research and fog | C.7 1,000, C.9 900, H.10 900 | 2,800 | `business/tech-waves.ts`, `workshop/*`, `competition-moves.ts` |

Total 23,300.
**Size.** 23,300 source, 26,460 test, 1,800 docs; 96 agent-hours, 21 tasks, 6 tracks, 19.2 wall hours. State +4,000 nodes.
**CI.** Per-domain money scans in the fast tier; property and bank conservation probes nightly.

**Acceptance.**
- Money scans for bonds, reparations, contracts (capped by military-line share), aid and frozen assets.
- Property: holdings sum to 1, one household per unit, owned plus rented plus vacant equals stock, stock moves only by logged construction or demolition. Deposits are never company cash; a bank failure hits depositors.
- War profit through steered contracts has margin ceilings and detection that rises with profit; selling to both sides is a crime; a contractor exit needs a wartime budget cap.
- Rubric advisory print: Politician and Military at least 2 everywhere.

**The player sees.** War bonds, rationing, refugees, a defense sector, generals with doctrine, journalists, protesters, spies, veterans, landlords and tenants with real rents, banks with depositors.
**Probes.** War profit through steered contracts; conquest snowball (occupation burden, counterbalancing coalitions); reparation loops (one way, capped, booked once); rationing and black-market arbitrage.
**Risks.** Military and Politician share `special/kit` merges. Property conservation across the 150-home cap. Depositor accounting for player banks (segregated books today).
**Exit gate.** Acceptance green; a human playthrough of a general, a minister and a landlord.

## R9 v5.7.0 The Show Circuit and every trade

**Goal.** Showing off a product is a calendar, a score and consequences; every trade gets depth; inventions cover more than products.
**Needs.** R1 (G.4); R3 (H.4, C.6); R4 (D.4); R5 (E.N1, E.T4); R6 (I.Kit2); R7 (B.5).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Show core | F.1 800, F.2 1,400, F.3 1,400, F.5 800, F.11 0 | 4,400 | `business/state.ts` (`BizState.shows`), `yearly.ts` (settle before `bookYear`), `product-market.ts` (`appealOf`) |
| Show UI, text, awards | F.4 800, F.6 900, F.10 200, E.N7 400 | 2,300 | `business/manage.ts`, `text/*` |
| Show adapters | F.7 1,700, F.8 600, F.9 400 | 2,700 | `business/deeptech-menu.ts` (SHOWCASE), `special/gamedev-career.ts` (`attendConvention`), `special/model.ts`, `business/gamestudio.ts` |
| Sector families 1 | J.5 Industrial and Hospitality 2,000 | 2,000 | `business/sector-data.ts` banner blocks, `sector-core.ts`, `industries.ts`, `staff.ts` |
| Sector families 2 | J.5 Retail, Projects, Digital 3,000 | 3,000 | the same files, own banner blocks (the v4.0.0 hunk rule) |
| Leftovers and wiring | J.6 2,500, J.9 2,000, J.10 1,000 | 5,500 | `business/*` menus, `yearly.ts` |
| Domains | C.8 4,000 | 4,000 | `workshop/*`, `business/rd.ts`, effort tasks |
| Goods and hiring | A.K7 2,500, D.8 1,500 | 4,000 | `economy/trade.ts`, `business/staff.ts` |

Total 27,900. The largest train: run it only after R6 and R7 prove 6-track merges.
**Size.** 27,900 source, 29,500 test, 1,800 docs; 114 agent-hours, 25 tasks, 8 tracks, 17.4 wall hours. State +4,000 nodes (`BizState.shows` cap 12 entries, `g.world.shows` 60 awards).
**CI.** Show probes (100 years by 40 lives) nightly; 8 shards; sector-family story tests in the full tier.

**Acceptance.**
- Cash delta equals ledger sum; fees paid equal organiser income.
- The `showScore` hint equals the roll over 10,000 draws; settlement draws by hash (family seed, company, edition, salt), never `g.rng`.
- The product of all promotion terms is at most 1.35; `showBoost` at most 0.15 and halving; stock mood at most plus or minus 4% a show.
- 100 shows give no identical outcome within 10; real-brand rivals only win or lose rank; no video keynote in 1950; a 100-year probe over 40 lives.
- The five new families pass their own story and voice tests (the recipe of `test/sector-story.test.ts` and `test/sector-voice.test.ts`).

**Probes.** Pump and dump (capped mood, top-quarter gate, insider case), spend to win (budget share 15%, saturating), intel farming (3 rivals a visit, expiry), award farming (one a category per 3 years), orders into an IPO (deposits are liabilities).
**The player sees.** About 90 fictional fairs by sector and era, booths, keynotes, celebrities, rivals in the room, deposits, awards, headlines; Operations Desks for Industrial, Hospitality, Retail, Projects and Digital trades; inventions in medicine, software, finance, art and sport; goods flowing between suppliers and buyers.
**Risks.** Eight tracks on 4 CPUs. Pump-and-dump, spend-to-win and intel-farming loops. Real-brand naming rules. Each family moves its trade's RNG stream, so that trade's seeded tests are re-baselined with a written reason (digest J).
**Exit gate.** Acceptance green; the owner runs a food trade and a studio through a show.

## R10 v5.8.0 Population, Underworld, Sports

**Goal.** Strangers get jobs, homes and firms; two large careers stand on top.
**Needs.** R2 (K.6); R4 (D.1, D.3); R6 (I.Kit2); R9 (F.1, J.5).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Pools | A.K5 7,000 | 7,000 | `g.world` modules, `npc-lives.ts`, `careers.ts`, `assets.ts`, `economy/cohorts.ts` |
| Underworld | I.Underworld 7,000 | 7,000 | `crime.ts`, `underworld.ts`, `prison.ts`, `special/hustler.ts` |
| Sports world | I.Sports part 1 7,000 | 7,000 | `special/sports-*.ts`, `special/athlete.ts` |
| Franchise trade | I.Sports part 2 3,500 | 3,500 | `data/markets.ts`, `business/industries.ts`, the sector-family recipe |
| Exits and esports | I.Sports part 3 2,000 | 2,000 | `sports-esports.ts`, `sports-olympics.ts` |

Total 26,500. Opus candidate: A.K5.
**Size.** 26,500 source, 27,900 test, 1,800 docs; 109 agent-hours, 24 tasks, 5 tracks, 26.0 wall hours. State +9,000 nodes (rosters and pools).
**CI.** Pool conservation property tests in the full tier; 50-year probes nightly.

**Acceptance.**
- People: births minus deaths plus migration equals the change in Tier 0 plus pools. Jobs, housing and goods follow the digest A checks. Promotion and demotion conserve money by property test.
- Promotion order does not matter (seeded keys, sorted ids; replay equals reload equals fork); the world step takes at most 60 ms a year on desktop.
- League-wide conservation and caps; transfer fees, academy sales and TV pools bounded; endorsements and Olympic medal bonuses from real payers (R0-7's year-scaled bonus becomes a committee budget).
- Underworld stays abstract (as `underworld.ts` states): loot, fences and laundering have named counterparties; seizure and prison are sinks.

**The player sees.** The housing and job market respond to what happens; Underworld in Special Careers with turf, crew and heat; clubs with named rosters, drafts, trades, caps and ownership.
**Probes.** Pool arbitrage (bid-ask spreads, stock-linked price indexes); franchise loops (transfer fees, academy sales, TV pools: league-wide caps); loot and laundering mints (victims, fences and heat are entities).
**Risks.** Storage, not CPU, is the limit: 100,000 light entities cost 3 to 9 ms a year but 15 MB at 150 bytes each, so only touched strangers persist and pools stay statistical. Sports ownership is the new money loop.
**Exit gate.** Acceptance green; 50-year probes in three strategies per career.

## R11 v5.9.0 Creators and the rest

**Goal.** The remaining careers reach the bar.
**Needs.** R3 (H.2); R5 (E.N1); R6 (I.Kit2); R9 (F.8).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Influencer | I.Influencer 6,500 | 6,500 | `special/social.ts`, `special/fame.ts`, kit |
| Actor and musician | I.Leftovers 4,500 | 4,500 | `special/actor-*.ts`, `special/music-*.ts` |
| Astronaut and model | I.Leftovers 2,000 | 2,000 | `special/astronaut-*.ts`, `special/model-*.ts` |
| New careers | I.NewCareers 3,500 | 3,500 | `workplace/*`, `special/kit/careers.ts` |
| Intelligence careers | H.12 2,500 | 2,500 | kit, `crime.ts` spy task |

Total 19,000.
**Size.** 19,000 source, 19,500 test, 1,800 docs; 78 agent-hours, 17 tasks, 5 tracks, 19.0 wall hours. State +3,000 nodes.
**CI.** Per-career probes nightly; the rubric table is printed on every PR.

**Acceptance.**
- Advertising pools cap creator pay; paid followers earn nothing (the R0-1 rule, now by ledger); every new file passes the money scan; a 60-year probe per career in 3 strategies; `fame.ts` (first tests in R0-14) moves onto the kit and the 30,000,000-listener cap of R0-14 becomes a share of the platform audience pool.
- Every career is registered in the rubric registry with an advisory score of at least 45.

**The player sees.** A creator business (platform, niche, calendar, algorithm shifts by year, brand deals, cancellation), stage and voice acting, a player-run label, analog missions, journalist, scientist, lawyer, detective, analyst, private investigator.
**Probes.** Fake-follower and brand-deal loops (R0-1 must not regress); merch and label money needs a world-audience pool; burnout and cancellation are sinks.
**Risks.** Fame feeds many systems; a creator loop is the likeliest new exploit (the R0-1 pattern).
**Exit gate.** Acceptance green; advisory scores at 45 or more for every career.

## R12 v6.0.0 The depth gate

**Goal.** The rubric becomes a failing test; the programme closes.
**Needs.** Every module registered in the rubric registry (R2 to R11).

| Track | Items | Lines | Hot files |
|---|---|---|---|
| Gate | X.G12 4,000 (registry fill, nightly deep tier at 40 seeds by 160 years, polish reserve) | 4,000 | `test/depth-rubric.test.ts`, nightly workflow |
| Optional | G.13 300 (desktop two-pane) | 300 | `src/ui/screens/GameScreen.tsx`, `global.css` |

Total 4,300. If digest K's trigger fires (p95 year step above 400 ms on a 2022 mid-range phone), K.10 (worker, 2,500 lines) is added.
**Size.** 4,300 source, 4,168 test, 1,800 docs; 18 agent-hours, 4 tasks, 2 tracks, 11.3 wall hours.
**CI.** The rubric test turns from advisory to failing; the nightly deep tier must be green for 7 days before release.
**Acceptance.** The part F rubric gate; nightly probes green for 7 days; the budgets of F.1; every old save fixture migrates and runs 5 years.
**The player sees.** Nothing new in play except the optional two-pane layout; the release notes carry the depth table.
**Risks.** A failed gate: a dimension that cannot apply needs a named substitute; the 4,000-line polish reserve is the schedule's slack.
**Exit gate.** The owner signs the depth table of part F.

---

# C. Release R0 (v4.0.3): honest numbers

## C.1 Findings register: every defect, bug, exploit or leak found

Three sources: the eleven digests (F1 to F34), the repo's own `docs/FEATURE-ROADMAP.md` Priority 0 table (C-02 to C-12, a v2.9 audit that digest J records as unverified at v4.0.2; F35 to F41 are my checks of it), and the design document's defect register (section 3.9, X1 to X13; F42 and F43 are the two rows it adds beyond the digests). Disposition says where each is fixed. R0 fixes fourteen and verifies four more; the rest need the foundations and land in the named release. Nothing here is dropped.

| # | Finding (source) | Disposition |
|---|---|---|
| F1 | Bought followers pay per follower, verify and monetize (I, J) | R0-1 |
| F2 | Free Financial News analyst tip reads next year, right 3 times in 4 (H) | R0-2 |
| F3 | A 100-rated hired CEO mints "strategic trading income" (J) | R0-3; a real benefit through the engine is J.8 in R3 |
| F4 | `continueAsChild` drops `nation.policy`: a President's laws vanish in the heir (A; roadmap C-07) | R0-4; the bug class ends with A.K0 (R1) and `g.world` (R2) |
| F5 | `test/nation.test.ts:92` says laws survive heirs but never calls `continueAsChild` (A) | R0-4 |
| F6 | Non-heir siblings' firms become cash: a designated sibling gets a $12M firm as $12,000,000 of cash, no buyer, no firm left (`life.ts` 1209 to 1218; design X5) (A) | R0-13: the sibling keeps the firm as an NPC owner, probed in a throwaway copy (every other dynasty, will and nepo test stays green; one assertion, `test/nepo-year.test.ts:394`, changes). The riskiest R0 task; if a dynasty test cannot stay green it moves to R4 (A.K8) |
| F7 | Sports endorsements pay up to $53M a year in any era from no payer; Olympic medal bonuses (`GOLD_BONUS`, $740,000 for a Singapore gold) pay in 2020s dollars in every era from no committee (I; design X6) | R0-7; payers in R6 and R10 |
| F8 | Author adaptation fee up to $12M, no studio, no era (I) | R0-8; payer in R6 |
| F9 | Studio `awards` is always `[]` yet is multiplied by 30 in a sort score (F) | R0-9; the awards ledger is F.10 in R9 |
| F10 | "Avoiding me ever since I lent" printed 48 times in 10 lives (E) | R0-10; structural fix E.T3 (R2), E.T5 (R3) |
| F11 | Muted, good-tone and bad-tone text and the age heading fail contrast 4.5:1 (G) | R0-11; focus, `aria-modal`, targets in R1 (G.12) |
| F12 | Military pay and Street Hustler takes ignore era and country (I) | R0-12; rebuilt in R8 and R10 |
| F13 | The IndexedDB save backend is built and never wired; production writes a 2 MB JSON string to localStorage (K) | R1 (K.5a); chunking in R2 (K.5) |
| F14 | Year digest is 3 times its 110 cap; 127 culture lines too long (E) | R3 (E.D4) |
| F15 | Hints run the true optimiser; odds and rival numbers print exactly with no research (H, F) | R3 (H.11, H.4, H.6) |
| F16 | The Investing gut reads next year (documented exception) (H) | Fenced by the R1 scan; kept behind the talent (D12 in part G) |
| F17 | Heir hand-over sets every relationship to 55 to 95, clears notes, drops friends (D) | R4 (D.9) |
| F18 | NPC pockets minted by `randomWealth`; `NpcLife.income` pays from nowhere (A, D) | R2 (A.K1), R4 (D.5) |
| F19 | Wages, tax, rent, loan principal and sale proceeds have no counterparty (A) | R2 (A.K1), R8 (A.K4, A.K6) |
| F20 | War facts live in six places; 2026 and later are peaceful (B) | R7 (B.1) |
| F21 | The career money scan covers 4 of 12 careers; military, hustler and fame have no dedicated tests (I, J; design X12) | R0-12 tests military and hustler, R0-14 tests fame; R1 X.G1 ratchet; R6 scans every new file |
| F22 | Up to 13 popups and 19 log lines a year (E, G) | R1 (G.11), R3 (E.D2) |
| F23 | Dialogue repeats: 32 topics, 5 openers, 5 tails (E) | R2 (E.T3), R5 (E.T4) |
| F24 | CI is one 36-minute job; 137 files raise timeouts (K) | R1 (K.7a); 8 shards in R5 |
| F25 | 5 import cycles hold 147 modules; the v4.0.0 crash was one edge (K) | R1 ratchet, R2 (K.2a), R5 (K.2b) |
| F26 | World randomness shares the player's stream; one extra draw changes every digest (K) | R2 (K.3) |
| F27 | 85% of a save is `worldEconomy`; each tap costs 24 ms clone plus 25 ms stringify (K, A, G) | R2 (A.K9, K.5) |
| F28 | No chart anywhere in the UI; Profit and Loss is 24 text rows (G) | R1 |
| F29 | No search, recents or hubs; 11,800 reachable rows, 5.8 taps an action (G) | R1 (G.8, G.9) |
| F30 | Three patent systems; rival R&D is hash arithmetic; player breakthroughs never move world tech (C) | R3 (C.6), R8 (C.7) |
| F31 | Showcases live in five unlinked places (E, F) | R9 (F.7, F.8) |
| F32 | Celebrity endorsement is a fixed 15% scandal (F) | R9 (F.5) |
| F33 | `docs/FEATURE-ROADMAP.md` statuses stale since v2.9 (J) | R0-16 updates the three rows it fixes; J.10 (R9) re-verifies the rest |
| F34 | Rival products and finances show exactly with no visit or research (F, H) | R3 (H.4), R9 (F.1) |
| F35 | C-02: a tariff cut is treated as a new tariff and rolls retaliation (reproduced: 120 of 120 cuts) | R0-5 |
| F36 | C-06: divorce sells a whole asset to pay a smaller order; the ex got $5.1M on an order of at most $2.55M (reproduced) | R0-6; an obligation record for a deficiency in R4 (D.5) |
| F37 | C-04: a bond held to maturity pays the marked market price (`investments.ts:2375`), while the screen says face value (1671) | Not patched: a correct fix needs a pull-to-par track and a named payer. R2 (A.K1: the government pays par less any default haircut), with a test |
| F38 | C-03: personal gains are taxed as ordinary income and the nation's `capitalGains` law and any transaction tax never reach personal sales (`investments.ts:9, 530`) | R2 (A.K1 tax events to `gov:country`); the business sale paths already use `capitalGainsTax` |
| F39 | C-05: `loadSnapshot` applies `migrateLegacyAi` (today's only step) but not the versioned `migrateSave` chain, so the first real schema step would skip Time Machine snapshots | R2 (K.5: restores go through `migrateSave`; test with a schema-2 snapshot) |
| F40 | C-08: board approval on acquisitions and takeovers: the sale accept path (`manage.ts:2013`) and rival purchase (`conglomerate-actions.ts:998`) now call `boardAllows` | Appears fixed; J.10 (R9) re-verifies every accept path |
| F41 | C-09, C-10, C-12: bank capital state, unbounded collections, stale marks | R0-15 probes each; fixed there if one function, else `it.fails` plus J.10 (R9) |
| F42 | Design X13: promotion terms stack (`marketingFactor` x `campaignBoost` x brand, `economy.ts:400`); measured 2.56 times at the three clamps (up to 2.75 at industry growth 1.0), bounded, against the design's target cap of 1.35 on the product | R0-15 pins today's ceiling as a test; the 1.35 cap ships with R9 (F.5) because it needs the Show Circuit's `showBoost` term |
| F43 | A podcast audience compounds about 1.2 to 1.3 times a year under a cap of 1e12: 0.2 to 2.8 billion listeners and $166M to $1.25B a year after 30 years (probe, 5 seeds); `special/fame.ts` has no dedicated test (found by this plan; design X12 lists the gap only) | R0-14; era scaling of one-off fame pay in R11 |

## C.2 How every R0 task runs

- [ ] **Step 1:** write the regression test first; run it; it must fail for the stated reason (the red run is the proof the defect is real).
- [ ] **Step 2:** make the change; run the task's test files with `npx vitest run --maxWorkers=1 <files>`; then `npm run typecheck`.
- [ ] **Step 3:** run the regression set once: `export R0SET="test/social-fake.test.ts test/analyst-tip.test.ts test/nation.test.ts test/heir-world-flags.test.ts test/elite-business-v2.test.ts test/bank.test.ts test/review-v2-fixes.test.ts test/love.test.ts test/sports.test.ts test/sports-endorse-cap.test.ts test/author.test.ts test/studio-awards-clamp.test.ts test/wealth.test.ts test/ui-contrast.test.ts test/career-pay-scale.test.ts test/stocks-real.test.ts test/investments.test.ts test/voice-guards.test.ts test/save-schema.test.ts test/sibling-firm.test.ts test/fame-career.test.ts test/promotion-ceiling.test.ts test/nepo-year.test.ts test/npc-dynasty-overhaul.test.ts test/dynasty-main-character.test.ts test/will-estate.test.ts test/heavy-handoff.test.ts test/special-common-safety.test.ts"`: the 19 files of R0-1 to R0-12 and the nine R0-13 to R0-15 add (28 in all).
- [ ] **Step 4:** commit with explicit pathspecs and the trailers from Global Constraints.

R0 adds no `g.rng` draw in any existing sequence (every fix is arithmetic, a hash, a constant or a record move), so no seeded baseline may move. If one does, the change is wrong, not the baseline. The only expected test edits are the ones each task names. Probe numbers below came from throwaway vitest files run on a copy of v4.0.2 with `npx vitest run`.

## R0-1 Bought followers pay (exploit)

**Where.** `src/game/special/social.ts`: `BUY_PACKS` and `buyScript` (lines 758 to 785), `normalizedAccount` (230), `resolvePost` (386 to 419), livestream tips (553 to 556), verify action (986), monetize action (1015 to 1031), `yearlySocial` income (1140 to 1147), `totalFollowers` (338); `src/game/cv.ts:754`; `src/game/types.ts` `SocialMedia` (202).

**Behaviour.** A monetized YouTube-class account with 1,000,000 bought followers and 4 posts a year paid $3,187,791, $2,204,071 and $2,906,148 in one yearly step (seeds 1, 2, 3) for a $70,000 pack: 31 to 46 times the cost in the first year. A $8,000 pack of 100,000 passes the `acct.followers >= 100_000` verification test. Bought followers also seed organic growth (`fromFollowers`, `growth`) and feed `totalFollowers`, which game sales and model income read (`gamedev-make.ts:560`, `model-core.ts:137`).

**Change.**
- `Account` gains optional `fake` (whole, at most `followers`); `normalizedAccount` clamps it; it is written only when above 0, so a life that never bought stays byte-identical. `SocialMedia` gains optional `fake?`, mirrored by `sync()`.
- `buyScript` adds `pack.amount` to `acct.fake` beside `followers`.
- A helper `organic(a) = a.followers - a.fake`. `resolvePost`, the monetize gate, the verify gate (`fameOf >= 40 || organic >= 100_000`), livestream `viewers` and the yearly growth use `organic`. `totalFollowers(g)` returns the organic total. `cv.ts:754` reads `followers - (fake ?? 0)`.
- `yearlySocial`: first a purge with no RNG, `gone = round(fake * 0.3)`, taken from both `fake` and `followers`, with the log line "{Platform} removed {n} fake followers." (about 45 characters). Pay becomes `min(round(organic * (lo + rand * (hi - lo)) * min(1, recentPosts / 4)), 1500 * typicalIncome(g))` (US 2026: $67.5M). The `rand` call count is unchanged.

**Test** `test/social-fake.test.ts` (new): (1) 1,000,000 followers all fake, monetized, 4 posts: money unchanged after `yearlySocial`, followers fall to 700,000; (2) same with `fake: 0`: income between 1,000,000 and 5,000,000 (control: organic still pays); (3) `social.viewtube.monetize` refuses at 1,000 fake followers, verify refuses at 100,000 fake followers with fame below 40; (4) 500,000,000 organic followers pay at most `1500 * typicalIncome`; (5) running the registered script `special.social.buy` with choice `100000` and data `{ platform: 'viewtube' }` (through `runScript`) sets `fake` and `followers`, and `totalFollowers` stays at the organic count; (6) a v4.0.2 account without `fake` loads with 0 and a never-bought life is byte-identical; (7) `cvEntries(g)` (`cv.ts:819`) has no `d:social` entry when all 20,000 followers are fake.

**Expected.** Tests 1, 3, 4, 5, 7 red before, green after. The existing `test/social-delete-era.test.ts` stays green.

**Guard.** R1 X.G1 counts `earnIncome(` in `social.ts` (3 sites) so a new paying path fails; R11 moves creator pay to the ledger with an advertising pool.

## R0-2 The free analyst tip reads next year (foresight leak)

**Where.** `src/game/investments.ts`: `seededTip` (2135 to 2161, reads `exchangeYear(..., g.year + 1)` at 2139), called from `newsLines` (2104).

**Behaviour.** `right = (h >>> 8) % 3 !== 0` makes the call about next year's move correct 2 times in 3 by construction. Probe, 40 seeds by 12 years (2027 to 2060, step 3): fictional stocks 66 of 88 (75%), real-company sector calls 294 of 392 (75%). The tip needs no talent. The advisor-manager spec (2026-10-14, its decision D2) says the Investing talent's hints are the only foresight.

**Change.** `seededTip` reads only `g.year` and earlier: candidates are stocks present in `exchangeYear(f, an, info, g.year)` that existed last year (same `gen`, `event !== 'ipo'`); pick by the same key hash; the call is "strong" when the stock's return this year is above the median of that year's stocks. Text keeps the existing analyst-call prefix and shape: fictional `"{firm} rates {name} ({sym}) a buy after a {pct} year."` or `"{firm} cuts {name} ({sym}) to a sell after a {pct} year."`; real companies stay sector calls (`bullish on {label} stocks after a strong year.`, `cautious on ... after a weak year.`) and never say "strong buy" or "overvalued". Delete `right` and the `next` read. Everything in `invest/instinct.ts` is untouched.
Probe of the new rule: last year's sign agrees with next year's 54.6% of the time over 20,997 stock-years, and last year's rank against the median 50.8%: a coin flip, as it should be.

**Test** `test/analyst-tip.test.ts` (new): (1) with `vi.mock` wrapping `exchangeYear` to record the years asked, open `inv-news` for 40 seeds by 12 years with no talent: the maximum year asked is at most `g.year`; (2) hit rate of "strong" against the true next-year sign, measured directly in the test, between 0.44 and 0.60; (3) real-company years still never match `/strong buy|overvalued/` (extends `test/stocks-real.test.ts:573`); (4) with the Investing talent the instinct line still appears; (5) two calls give the same lines.

**Expected.** Tests 1 and 2 red before (max year is `g.year + 1`, hit rate 0.75), green after.

**Guard.** R1 X.G1's foresight scan fails any `exchangeYear(`, `cryptoYear(`, `goldYear(`, `fxYear(` call whose arguments contain `+ 1` outside `invest/instinct.ts`.

## R0-3 A 100-rated CEO mints money (exploit)

**Where.** `src/game/business/executive-foresight.ts` (36 lines, `settlePerfectForesight`); call and log at `src/game/business/yearly.ts:531, 532`, import at 18; the statement row at `yearly.ts:189`; help text at `src/game/business/conglomerate-management.ts:149`; `Statement.strategicIncome` (`state.ts:153`, reader 605).

**Behaviour.** For a company whose hired CEO, or whose group's hired CEO, is rated exactly 100, the function computes `needed` to lift net profit and cash to `max($1,000, 20% of net revenue, 12% of equipment value)` and books the gross-up into `s.otherIncome`, `s.pbt`, `s.net` and `b.cash`: money created every year the firm would otherwise miss the target. `test/elite-business-v2.test.ts:86` shows it: a firm with $1e9 debt at 50% has `net < 0` at skill 99 and `net > 0` at skill 100. The 2026-10-12 rework spec (principle 3; line 194, "Remove the perfect foresight financial returns") already removed it for banks and funds (`bank.ts:63`, `fund-sim.ts:196`) and left classic firms.

**Change.** Delete `executive-foresight.ts`, its import and the call and log line in `yearly.ts`. Keep `strategicIncome` in the type, the reader and the statement row so a `last` statement saved by v4.0.2 still displays; nothing sets it any more. In `conglomerate-management.ts:149` replace the clause about foresight and guaranteed profit with "No rating guarantees a profit." Decision D28 for the owner (part G): this removes a deliberate power-fantasy rule; the default is to remove it, and J.8 (R3) gives top CEOs a real, bounded benefit through the effort engine.

**Test.** Edit `test/elite-business-v2.test.ts:86-98` to "a 100-rated manager never changes cash or net": the same loss-making firm run through `yearlyBusinessImpl` keeps `b.last.net < 0` and `b.last.strategicIncome` undefined, and cash falls by the loss. Remove the import in `test/bank.test.ts:26` and `test/review-v2-fixes.test.ts:7` and restate those cases on the yearly path (bank: `strategicIncome` is 0; personally run division: cash unchanged). New `test/no-ceo-mint.test.ts`: 20 seeded firms with a skill-100 manager and 50% debt over 5 years, no log line contains "strategic trading" and `b.cash` change equals the booked net.

**Expected.** The edited elite test red before (net is positive), green after.

**Guard.** R1 X.G1's money ratchet counts `b.cash +=` per file; R2 A.K1 makes every company cash move a ledger post; rubric R3 ("no minted money") is in the R12 gate.

## R0-4 Heirs lose a President's laws (bug)

**Where.** `src/game/life.ts` `continueAsChild` (1137), the `n.flags = {` rebuild at 1509; `src/game/nation/state.ts` (`POLICY_KEY` 17, `policyState` 280); `test/nation.test.ts:92`.

**Behaviour.** Probe: a President sets `national.taxes.income = 5`, dies, the child continues: before 5, after `undefined`, and `'nation.policy' in n.flags` is false. The file comment (`nation/state.ts:2`) and `test/nation.test.ts:92` say laws survive heirs; that test bumps `g.generation` by hand and never calls `continueAsChild`, so it passes while the game is wrong.

**Change.** `nation/state.ts` exports `nationWorldFlags(g)`: it returns `{ 'nation.policy': policyState(g) }` when at least one country record exists and `{}` otherwise, passing through the validating reader as `heavyWorldFlags` does. `life.ts` imports it and spreads `...nationWorldFlags(n)` after `...benchWorldFlags(n)`. `nation.me` stays dropped (owner-stamped, the heir starts clean).

**Test.** Rewrite `test/nation.test.ts` "keeps laws for heirs" to build the parent as `test/heavy-handoff.test.ts` does (`adult`, `createPerson`, `killCharacter`, `continueAsChild`) and assert the law is 5, `meView(n).dirty` is 0 and `ME_KEY in n.flags` is false. New `test/heir-world-flags.test.ts`: a table of world flags (`nation.policy`, `worldEconomy`, `marketShocks`, `marketBreakthroughs`, `workshop.firsts`, `business.confidence`, `timelineForks`, `groupServices`, plus the `heavy.*`, wave and bench keys through their helpers) each set to a valid minimal value, handed off, and asserted present and equal; and "a damaged policy flag does not survive": `{v:1,countries:{us:{national:{taxes:{income:'x'}}}}}` comes out normalized.

**Expected.** Both red before, green after.

**Guard.** The table is the seed of A.K0 (R1), which classifies all about 190 flag keys as world or personal and fails on an unclassified new key; `g.world` (R2) carries to heirs by cloning.

## R0-5 A tariff cut draws retaliation instead of rolling it back (bug, roadmap C-02)

**Where.** `src/game/nation/govern.ts`: `resolveBill` (441) calls `applyMeasure` and `writePolicy(g, p)` (515, 516) and only then `afterTrade(g, m)` (525); `afterTrade` (561 to 600) reads `policyOf(g, country).tariffs.find(...)` at 572 as `before`. `currentOf` (60) already returns the law as it stands.

**Behaviour.** `before` is read after the new tariff is written, so `before.add` equals `m.add` and `m.add < before.add` can never be true. Only a cut to exactly 0 takes the roll-back branch; a cut from 20% to 10% is treated as a new tariff and rolls retaliation. Probe: 120 seeded Presidents (`newLeader`, US 2001) pass a bill cutting a 20% tariff on China to 10%; all 120 land in the retaliation branch ("hit back" or "Nobody retaliated. This time.") and none in "Partners started rolling back their own tariffs." The repo's own `docs/FEATURE-ROADMAP.md` lists this as C-02 (PLANNED since v2.9).

**Change.** In `resolveBill`, read `const prevTariff = m.k === 'tariff' ? currentOf(p, m) : 0` before `applyMeasure` and pass it: `afterTrade(g, m, prevTariff)`. In `afterTrade` the condition becomes `m.add === 0 || m.add < prevTariff`. `enactDeskBill` (661) never calls `afterTrade`, so it needs no change. No RNG call is added or moved.

**Test.** `test/nation.test.ts`, new block "a tariff cut rolls retaliation back": `newLeader(seed, 'us', 2001)` with a 20% tariff on `cn` and a seeded `retaliation` from `cn` (add 10, until `g.year + 3`); a bill to 10% over 60 seeds: the notice never says "hit back", the `cn` retaliation ends this year (`until === g.year`) and the text says "rolling back". Controls: a raise from 10% to 20% still rolls retaliation (at least one "hit back" over the seeds) and a cut to 0 still rolls back.

**Expected.** The cut case is red before (120 of 120 roll forward) and green after; the controls stay green.

**Guard.** B.5 (R7) takes `afterTrade` over; the test stays as a regression.

## R0-6 Divorce hands the ex far more than the judge ordered (bug, roadmap C-06)

**Where.** `src/game/love.ts` `divorce` (1625): the order at 1637 to 1642, the asset loop at 1655 to 1663 (`p.money += equity`).

**Behaviour.** The order is `round((mine - theirs) / 2 * randFloat(0.5, 1))`. The loop sells the largest-equity asset and credits the ex with its whole equity even when the remainder owed is smaller, then lets `remaining` go negative; the surplus never returns. Probe, a player with $100,000 cash and an unmortgaged $5,000,000 house, a spouse with $0, no prenup (6 seeds): net worth $5,100,000, the order between $1.275M and $2.55M, and after `divorce` the ex holds $5,100,000 while the player holds $0 and no assets.

**Change.** In the loop pay `share = Math.min(equity, remaining)` to the ex and return `equity - share` to the player as sale proceeds (`addMoney`); `remaining` never goes below 0. A deficiency after the last asset is still forgiven (the judge orders only what you hold); R4's conserved settlement (D.5) replaces that with a recorded obligation. Stepchildren leaving with their parent is by design (pinned by `test/love.test.ts`, "a spouse with kids from a previous relationship brings stepchildren"). No RNG call is added or moved.

**Test.** `test/love.test.ts`, new "divorce never takes more than the order": the probe scenario over 6 seeds: `wife.money + player.money + remaining asset value` equals $5,100,000 before and after (conservation), `wife.money` is between $1,275,000 and $2,550,000, the player ends with at least $2,550,000; a second case where the order is below the player's cash sells no asset.

**Expected.** Red before (the ex holds $5.1M), green after.

**Guard.** A.K1 (R2) books the settlement between two named accounts; D.5 (R4) adds the obligation.

## R0-7 Sports endorsements and Olympic bonuses ignore era, country and payer (exploit)

**Where.** `src/game/special/sports-core.ts`: `offerFor` (463 to 481, `base` at 476), `sponsorScript` haggle (481 to 497), `yearlySponsors` pay and renewal (547 to 578, the pay at 568). `src/game/special/sports-olympics.ts`: `GOLD_BONUS` (19), the bonus at 109 to 111 (`earnIncome(g, bonus)`), inside the `sports.olympics.final` script (design X6).

**Behaviour.** `base = 4,000 + (fame/100)^3 * 6,000,000 + buzz * 3,000`, then times appeal (up to 1.2), a 0.7 to 1.3 roll and `0.6 + wealth * 0.4` (up to 1.2): about $11.8M a deal, $17.7M after a haggle, and three deals at fame 70 or more: about $53M a year, in 1930 as in 2026, from brands that lose nothing. Nothing uses `typicalIncome`. The Olympic medal bonus is the same shape: `GOLD_BONUS` is a table of 2020s dollars (Singapore $740,000, Hong Kong $640,000, the US $38,000; other countries `20,000 * wealth`), halved for silver and a third for bronze, paid by `earnIncome` with no committee behind it and no era: a 1932 Singapore gold pays $740,000.

**Change.**
- A ceiling `dealCeiling(g, brand) = typicalIncome(g) * 40 * (brand.fame ?? 5)`: US 2026 $1.8M (fame-1 brand) to $18M (fame 10); US 1930 $0.54M to $5.4M. Apply `Math.min` in `offerFor`, after the haggle multiplier in `sponsorScript` (look the brand up with `allBrands()`, as the file already does) and in the renewal formula. Today's top US deal (about $17.7M) is under $18M, so the best modern deals do not change; the past and poorer countries shrink.
- The Olympic bonus is multiplied by `realWealthFactor(g.year)` (`history/events-people.ts:90`: 1 from 2026, 0.31 in 1932, 0.25 and below 1900): `tidy(goldBonus * medalShare * realWealthFactor(g.year))`. Nothing about history is invented; the table is simply read in the dollars of the year. Today's bonuses do not change (the factor is 1). The payer (a committee with a yearly budget) is R10, with the league pools.

**Test** `test/sports-endorse-cap.test.ts` (new): for years 1930, 1975, 2026, countries `us`, `ng`, `de`, fame 100 and buzz 100, 200 seeds through `sponsorCall(g, 'Tennis', 1.2, true)` and the sponsor script (pattern of `test/sports.test.ts:568`): every deal is at most the ceiling for that brand, year and country; the 2026 US maximum over the seeds is at least $10M; the 1930 maximum is at most $5.4M; a haggled deal is capped too; a renewal is capped. Olympic block, driven through `runScript(g, 'sports.olympics.final', 'gold', { year, entry: { sport: 'Swimming', event: 'Swimming', rating: 100, team: false, squad: 0 } }, ...)` as `test/sports.test.ts:835` does: over 60 seeds, every gold in 1932 for `us` pays at most `tidy(38,000 * realWealthFactor(1932))` ($11,800) and for `sg` at most $229,000; the same script in 2028 pays exactly $38,000 for `us`; silver is half and bronze a third; `gb`, `se` and `no` still pay 0.

**Expected.** The 1930 and `ng` cases and the 1932 bonus cases red before, green after; the 2026 US case unchanged.

**Guard.** R1 X.G1 counts `earnIncome(` in `sports-core.ts` and `sports-olympics.ts`; R6's contract ledger (I.Kit2 K1) replaces the ceiling with a brand budget; R10 puts leagues and committees on pools.

## R0-8 Author adaptation pays from nowhere (exploit)

**Where.** `src/game/special/author-career.ts`: `authorAdaptationOffer` (246 to 255), `licenseAuthorAdaptation` (257 to 272), yearly royalties (399 to 405), `originScale` (141).

**Behaviour.** `fee = (15,000 + min(5,000,000, reach) * 1.5) * originScale`: up to $7.5M, and $12M in a rich country; five yearly royalties of up to `(2,000 + 750,000) * 1.6 * 1.5` (about $1.8M each). No studio pays, reach ignores market size, and 1930 pays the same as 2026.

**Change.** `fee = min(fee, 150 * typicalIncome(g, w.countryId))` and `annual = min(annual, 15 * typicalIncome(g, w.countryId))` (US 2026 $6.75M and $675,000; US 1930 $2.0M and $202,500). The royalty line caps `adaptationBase` at read, so an old save with a larger stored base pays at most the cap.

**Test.** Extend `test/author.test.ts` (near 662 and 909) with "adaptation ceilings": reach 5,000,000 in a rich country: fee at most 150 times typical; 1930 fee at most the 1930 cap; a saved `adaptationBase: 5e7` pays at most `15 * typicalIncome` a year through the yearly step the existing test at 909 uses; five payments never exceed five caps. The exact-threshold tests (fees far below the cap) stay green.

**Expected.** The two ceiling cases red before, green after.

**Guard.** R1 ratchet (5 `earnIncome(` lines in `author-career.ts`); R6 Author on the kit pays from a studio budget.

## R0-9 Studio awards: a dead field with an unbounded weight

**Where.** `src/game/business/gamestudio-state.ts`: `trimStudioGames` (216, `x.awards.length * 30`), normalizer (158, `.slice(-6)`); `gamestudio.ts` lines 198, 520, 637, 2273 write `awards: []`.

**Behaviour.** Nothing ever pushes to `awards` (grep finds no writer), so the term is 0 in every live save. A hand-edited or future record with 6 awards adds 180 to a score whose other terms top out near 145 (critic 100 plus `log10(1 + copies) * 5`), pinning that game in the catalogue forever.

**Change.** `Math.min(2, x.awards.length) * 30` (at most 60) and a comment that the real awards ledger is F.10.

**Test** `test/studio-awards-clamp.test.ts` (new): build `MAX_GAMES + 3` live games, one with 6 awards, critic 10 and 0 copies, the rest with critic 80 and 10,000 copies: after `trimStudioGames` the award-heavy game is gone (score 70 against 100); with 2 awards it is still trimmed.

**Expected.** Red before (190 against 100 keeps it), green after.

**Guard.** F.10 (R9) replaces the field with a capped ledger, one award per category per 3 years.

## R0-10 The "avoiding me" line repeats (text defect)

**Where.** `src/game/events/wealth.ts` `collectLoans` (145 to 171, the log at 169).

**Behaviour.** Each year a debtor who does not repay has chance `min(0.5, 0.1 + years * 0.04)` of the mark, a relationship drop and the line "{My sister} has been avoiding me ever since I lent her money." Digest E counted it 48 times in 10 seeded lives, the most repeated line in the game; one debtor prints it about 8 to 10 times in 20 years.

**Change.** Keep the relationship drop and the mark. Print the line only if the previous `marks.avoid` is at least 5 years old (read it before `updateTies` writes the new year): at most one line per person per 5 years.

**Test.** Add to `test/wealth.test.ts`: a child who owes money and has `money 0`, `yearlyWealth(g)` for 20 years over seeds 1 to 10: at most 4 matching lines per person; the relationship still ends lower than it started; the first line still appears in at least 8 of the 10 seeds.

**Expected.** The count assertion red before (8 to 10 lines), green after.

**Guard.** E.T3's `stateLine` (R2) and E.T5's family pacing (R3) apply the same rule to every state line.

## R0-11 Text colours fail contrast 4.5:1 (accessibility)

**Where.** `src/ui/styles/global.css`: light tokens `--muted` (line 35), `--tone-good` (55), `--tone-bad` (56), `--age-heading` (58).

**Behaviour.** Measured WCAG ratios: `--muted #6a7486` is 4.19 on `--bg`, 4.43 on `--card-2`, 4.05 on `--chip-bg`, 3.58 on `--page-bg`; `--tone-good #1d8a45` is 4.40 on white, 3.91 on `--bg`, 4.13 on `--card-2`; `--tone-bad #c8352f` is 4.499 on `--chip-bg`; `--age-heading #1d6fd8` is 4.33 on `--bg`. Dark tokens pass (muted 7.48 on `--bg`). The header text on the gradient start (3.64) passes only as large text and is left to G.12.

**Change.** `--muted: #566072` (4.81 to 6.34 on every surface), `--tone-good: #17703a` (4.66 to 6.15), `--tone-bad: #c2312b` (4.78 to 5.57), `--age-heading: #195fbd` (4.67 to 6.15). Dark values unchanged.

**Test** `test/ui-contrast.test.ts` (new, pure, no DOM): parse `global.css` into the light map and the dark map (light overlaid with the `prefers-color-scheme: dark` `:root` block), compute the WCAG ratio, and assert at least 4.5 for `text`, `muted`, `tone-good`, `tone-bad`, `tone-event` and `age-heading` on `bg`, `card`, `card-2`, `chip-bg`, `page-bg` (`page-bg` only for `text` and `muted`), and `hint-text` on `hint-bg`, in both themes; plus `contrastRatio('#000000','#ffffff') === 21`. R1 adds `--chart-1..6` at least 3:1 to the same test.

**Expected.** Red before for the four tokens, green after.

**Guard.** The test is the permanent guard; any new text token pair is added to its list.

## R0-12 Military pay and Street Hustler takes ignore era and country (balance)

**Where.** `src/game/special/military.ts`: `ENLISTED_PAY`, `OFFICER_PAY` (31, 32), `payFor` (87), enlist salary (203), menu subtitles (863, 873), yearly pay (560); `src/game/special/hustler.ts:576`.

**Behaviour.** The tables are US 2020s dollars in every year and country: a private earns $21,000 in 1930 where `typicalIncome` is $13,500, and a top officer $207,000. Hustler acts pay $5 to $1,200 an outing anywhere. Neither career has a test (digest I, J).

**Change.** `payScale(g) = typicalIncome(g) / US_TYPICAL_INCOME`, exported from `special/common.ts` (R0-14 reuses it): exactly 1 for the US from 2026, because `PRESENT_YEAR` is 2026 and US wealth is 1. `payFor(g, track, level)` multiplies and rounds to 100; the conscript salary and both subtitles use it; hustler `take = round(take * payScale(g))` before `addMoney`. Pay is fixed at hire and at each promotion, so a living job and an old save keep their saved salary.

**Test** `test/career-pay-scale.test.ts` (new): US 2026 `payFor` equals the tables exactly; US 1930 at most 0.31 times the table; Nigeria 2026 at most 0.2 times the table (its wealth is 0.2); the menu subtitle shows the scaled amount; a saved job's `salary` is unchanged after load; hustler `monte` in 1930 pays at most 0.31 times what the same seed and state pay in 2026, over 200 seeds. The five existing files that touch these careers (`era-early-rules`, `localize-names`, `history`, `career-menu`, `main-character-sports`) pin no salary and run unchanged.

**Expected.** The 1930 and Nigeria cases red before, green after.

**Guard.** R8 (Military) and R10 (Underworld) rebuild both on the kit with payers; the R1 ratchet counts their `earnIncome(` and `addMoney(` lines (2 and 6 today).

## R0-13 Siblings keep the family firm (bug, design X5)

**Where.** `src/game/life.ts` `continueAsChild`: the loop over `allocatedUnits` at 1209 to 1218 (`unit.recipient.money = ... + inheritedEquity` at 1215, `occupation = 'Business Owner'` at 1217); `src/game/business/nepo-inheritance.ts` `successionEstateUnits` (29); `src/game/npc-lives.ts` `storeCompany` (113, private), `startNpcCompany` (124), `npcBusinessYear`; the pure reader `npcCompany` in `src/game/npc-company-state.ts`; `test/nepo-year.test.ts:394`.

**Behaviour.** When a parent designates a successor and the player continues as a different child, the designated sibling receives the company as `round(value - mortgage)` of liquid cash: the asset record is dropped, no buyer pays, no firm is left. Probe on seeds 135, 140 and 150 (the scenario of `test/nepo-year.test.ts` "gives a designated company only to its successor when a different sole will heir is selected", a $12,000,000 firm): the sibling's cash rises by exactly $12,000,000 in all three, `npcCompany(sibling)` is null, and six years later the cash has been spent down to $6.3M with no company in the world. The existing test pins the cash (`expect(npcSuccessor?.money).toBe(successorMoney + companyEquity)`), which is why digest A ranks this the riskiest edit in `continueAsChild`; it is also why design 4.2.7 says holdings are "kept as holdings, no liquidation".

**Change.**
- `npc-lives.ts` exports `adoptNpcCompany(g, p, a, b): boolean`, beside `startNpcCompany` (about 16 lines; it needs `initializeNpc` and `storeCompany`, both private there). It refuses when the person is dead, under 21 or already owns a company (`npcCompany(p, g.year)`); otherwise it sets `b.npcOwnerId = p.id`, `b.ceo = 'manager'`, `b.manager = { firstName, lastName, gender, skill: l.skill, salary: 0, since: g.year }` exactly as `startNpcCompany` does, `refreshValue`, stores the asset, sets `occupation = 'Business Owner'` and `l.employer`. It draws nothing from `g.rng` (the NPC life is seeded from the person id).
- In the loop, a unit that is one business asset, has no mortgage balance and no `familyShares` goes to `adoptNpcCompany` first and `continue`s after `delete recipient.data.nepo`. Every other case keeps today's cash conversion unchanged: a conglomerate member (handled earlier by `inheritConglomerates`), a mortgaged firm (the `max(0, equity)` rule that never creates personal debt), a firm with family co-owners, and a sibling who already owns a company.
- The yearly NPC pass already simulates any person with `data.npcCompany` (`yearlyNpcLife`, `npcBusinessYear`), so nothing else changes. The firm then competes in its market as an NPC company, which is what the player's own firm did.

**Probe of the change** (applied in a throwaway copy): the sibling's cash change is $0 in all three seeds and the company is held (value $9.76M, $10.61M and $6.96M after six simulated years; the record is 375 to 378 JSON nodes); the player-side `JSON.parse(JSON.stringify(n))` round-trips; the 10 files that cover heirs, wills, dynasties, heavy handoff and conglomerates (175 tests) pass except the one assertion at `test/nepo-year.test.ts:394`.

**Test.** Edit `test/nepo-year.test.ts:392-394` to "the designated sibling keeps the company": `npcCompany(npcSuccessor, n.year)?.a.id` equals the asset id, the sibling's money is unchanged, occupation 'Business Owner', `data.nepo` removed. New `test/sibling-firm.test.ts`: (1) seeds 135, 140, 150: money unchanged, company held, still present after 6 `ageUp` years or failed with the existing "failed; the business was liquidated" line, JSON round-trip; (2) fallback to cash when the sibling already owns a company, when the asset has a mortgage and when it has `familyShares`; (3) the continuing child path (`ownedBeforeInheritance`) is unchanged: the sibling who later becomes the player claims the company back; (4) a hostile `npcCompany` on the sibling (a garbage `details`) does not throw and falls back to cash.

**Expected.** Test 1 and the edited assertion red before (cash up $12,000,000), green after; every other dynasty, nepo and will test stays green.

**Fallback.** If any of those tests cannot stay green without moving a seeded number, X5 leaves R0 and lands in R4 with A.K8, where holdings stay holdings by construction (design 4.2.7); F6 then says so.

**Guard.** The R4 carryover table (D.9) replaces this with holdings in the registry; A.K1 (R2) books the holding's value change as a transfer.

## R0-14 A podcast audience compounds without a ceiling (exploit, found while probing X12)

**Where.** `src/game/special/fame.ts`: `MAX_FAME_LEDGER = 1e12` (68), the normalizer (102, `fameWhole(pod.listeners, 0)`), `fame.podcast.record` (the controversy at 670 and the growth at 676 and 677), `yearlyFame` (983, drift at 999 and 1000, income at 1001).

**Behaviour.** The action runs 3 times a year. Each episode adds `listeners * (0.03 to 0.18) + fame * 20`, a controversy (15% of episodes) removes only 5 to 20%, and a famous host drifts another 2 to 10% a year; yearly ad income is `listeners * (0.4 to 0.9)`. The only cap is 1e12. Probe, 5 seeds, fame held at 100, 3 episodes a year: listeners 8 to 40 million after 15 years, 0.2 to 2.8 billion after 30, 7.6 to 226 billion after 45, 0.3 to 1.0 trillion after 60; ad income $4M to $24M in year 15, $166M to $1.25B in year 30, $6.7B to $137B in year 45, $245B to $746B in year 60. The largest real shows reach 20 to 40 million listeners. `special/fame.ts` (1,016 lines) has no dedicated test (design X12); only `test/special-common-safety.test.ts` calls `yearlyFame`.

**Change.** `const MAX_AUDIENCE = 30_000_000`; the three write sites and the normalizer take `Math.min(MAX_AUDIENCE, ...)`; yearly ad income is multiplied by `payScale(g)` (the R0-12 helper, exported from `special/common.ts`). No `rand` call is added or moved, so the early years are byte-identical. Probe of the change: the same 5 seeds show identical numbers through year 15 where the cap does not bind, then listeners of 30,000,000 or just under and ad income of $12.9M to $26.7M a year at most (0.9 per listener). One-off pay (book, commercial, merchandise) is one action a year and stays as is; era scaling for it is R11 (influencer and fame).

**Test** `test/fame-career.test.ts` (new, the first dedicated test of the file): (1) the probe above on 5 seeds by 60 years: listeners never exceed 30,000,000, a year's podcast income never exceeds $27,000,000 in the US in 2026 and `0.31 * $27,000,000` in 1930 (`payScale`); (2) a saved `listeners: 5e11` loads at 30,000,000; (3) a 40-year famous life with every fame action offered: money and fame stay finite and whole, no negative listeners; (4) `fame.podcast.record` stays throttled to 3 a year.

**Expected.** Test 1 and 2 red before (billions of listeners), green after.

**Guard.** R1 X.G1's ceiling list names every growth term with a cap; R11 moves creator pay to a platform advertising pool (I.Influencer); this task is not in design 3.9, which lists X12 as a gap only.

## R0-15 Re-verify the other P0 items of the repo's own roadmap (C-09, C-10, C-12) and probe the promotion ceiling (X13)

**Why.** `docs/FEATURE-ROADMAP.md` (a v2.9 audit, 2026-10-17) says its Priority 0 defects "take precedence over broad feature expansion", and digest J records their v4.0.2 status as unverified. This plan checked C-02 to C-08 (F4, F35 to F40). Three are left. Design X13 asks whether the stacked promotion terms need a ceiling before the Show Circuit.

**Method (about 3.5 agent-hours, finance code in `src/game/business/`).** Write each probe from the item's own text and run it on v4.0.2:
- C-09, "bank long-horizon capital state is not consistently rolled; repeated manager calls can duplicate work": call `financeManagerTurn(g, b)` (`finance-firm.ts:29`) twice in one fiscal year on a bank and on a fund; assert identical JSON, and that each capital phase marker advances once.
- C-10, "rival, modifier and live venture-company collections can grow without bounds": run 200 simulated years and assert every list in `RivalMod` (`competition-state.ts:29, 114, 252`), the fund ventures and the rival lists stays under its documented cap (the bounds of `test/fuzz-kit.ts` `checkInvariants`).
- C-12, "finance macro decisions rely on stale booked marks": assert the manager's observation year is `g.year - 1` and not older across the phase order.
- X13, "stacked promotion terms have no ceiling" (`test/promotion-ceiling.test.ts`, new): `appealOf` (`business/economy.ts:400`) multiplies `marketingFactor(b.marketingLevel)` (`economy.ts:289`, level clamped 0 to 3, so at most 1.321 times level 0) by `(1 + b.campaignBoost)` (written with `clampN(..., 0, 0.6)` at `manage.ts:291`, reset to 0 each year at `economy.ts:911`, so at most 1.6) by the brand term `1 + ((brand - 50) / 100) * (0.25 + 0.35 * growth)` (brand 0 to 100, industry `growth` up to 1.0, so at most 1.30). Probe on three restaurants: the same firm at marketing 3, campaign 0.6 and brand 100 against level 0, no campaign and brand 50 gives a ratio of 2.562 (`appealOf` 0.864 to 0.886 against 2.213 to 2.270). The test asserts the ratio is at most 2.8 (the algebra at growth 1.0 is 2.75) for 3 industries including the highest `growth`, and that a hostile record (`marketingLevel: 300`, `campaignBoost: 60`, `brand: 10000`) loaded through `normalizeBiz` gives the same bound (the 100 times probe). The 160-year run with a campaign every year joins the nightly tier from R2 (K.7b).

**Rule.** A finding that reproduces and has a one-function fix is fixed in R0 with its test. A finding that needs design stays out: its probe is committed as `it.fails(...)` (a failing-by-design test, so it cannot be forgotten) and the item joins J.10 (R9). The outcome of each is written into register rows F41 and F42 before release. For X13 the result today is "bounded by three clamps at 2.56 to 2.75 times"; the design's lower cap of 1.35 on the product (design 10.6) is a balance change that needs the Show Circuit's `showBoost` term to exist, so it ships with R9 (F.5), and this test is the baseline it starts from.

**Expected.** Four probes written; C-09, C-10 and C-12 each end as fixed, `it.fails`, or closed as already fixed with the commit that fixed it; X13 passes as a ceiling test.

## R0-16 Release v4.0.3

- [ ] Version bump in `package.json` to 4.0.3; `docs/RELEASE-v4.0.3.md` in the format of `docs/RELEASE-v4.0.2.md`: "Saves from v4.0.2 load unchanged", one bullet per fix in player words (a 100-rated CEO no longer guarantees a profit; deal ceilings and Olympic bonuses that fit the year; bought followers; heirs keep a President's laws; a sibling who inherits the family firm keeps the firm; a tariff cut no longer draws retaliation; a divorce order is what the judge set; a podcast audience stops at the size of the biggest real shows).
- [ ] A one-line pointer at the top of `docs/FEATURE-ROADMAP.md` to this roadmap, and the C-02, C-06 and C-07 rows set to IMPLEMENTED.
- [ ] One full unsharded CI run (about 36 minutes) green; typecheck; the build.
- [ ] Ask the owner before tagging, as v4.0.1 and v4.0.2 did.

**R0 exit gate.** All R0 tests red-then-green; the regression set green; full CI green; no seeded test moved; the owner has read the release notes.

---

# D. Release R1 (v4.1.0): See it

R1 answers three owner phrases directly ("better profit and loss graphics", "better player navigation", "text showing your year isn't cluttered") and lays the ground R2 needs. Nothing in R1 changes a simulation result: it reads settled years, adds optional saved series, and moves presentation. Design sections 12 (charts and navigation), 9 (text) and 13 (engineering) carry the why; this part carries the what and the tests.

## D.1 Order inside the release

| Wave | Hours | What lands | Why first |
|---|---|---|---|
| 0 | 0 to 6 | K.1 cycle ratchet, K.7a shards, K.11 previews, K.5a IndexedDB wiring, A.K0 flag classification, X.G1 guards, E.T1 text kit, the `types.ts` optional fields (`MenuBase.keywords`, `section`, `badge`, `conf`, `MenuInfo.chart`, `NoticeModal.weight`) | R2 starts from this commit; one agent edits `types.ts` once so the Charts and Navigation tracks do not collide |
| 1 | 6 to 14 | G.12 accessibility, G.1 spec and geometry, G.8 navigation core, G.3 series writers | Charts must not inherit the focus and contrast debt; series start accumulating history for every life that plays R1 |
| 2 | 10 to 20 | G.2 components, G.9 palette, G.11 digest, G.4 Annual Report 2.0 | The visible core |
| 3 | 16 to 26 | G.5 cockpits, G.6 ladders, G.7 net-worth line, G.14, E.T2, E.T7, J.1 | Uses the kit and the series |

## D.2 The chart kit (G.1, G.2)

**Files.** Pure, `src/game/charts/` (new): `spec.ts` (types and `readChartSpec`), `money.ts` (labels), `pl.ts`, `books.ts`, `market.ts`, `networth.ts`, `ranks.ts`, `index.ts`. Components, `src/ui/charts/` (new): `geometry.ts`, `Frame.tsx`, `Sparkline.tsx`, `LineChart.tsx`, `BarChart.tsx`, `Waterfall.tsx`, `RankLadder.tsx`, `Timeline.tsx`, `Meter.tsx`, `KpiTile.tsx`, `BulletRow.tsx`, `useScrub.ts`, `charts.css`. The kit is inline SVG, no dependency; it loads lazily (G.14), about 30 KB minified (10 KB gzipped, 0.4% of the 8.3 MB bundle).

**Spec (JSON, so a builder can hand it to a report modal and a test can read it).**

```ts
type ChartTone = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'good' | 'bad' | 'muted'
interface ChartSpec {
  v: 1
  kind: 'line' | 'bars' | 'stack' | 'waterfall' | 'ladder' | 'timeline' | 'meter' | 'kpi'
  title: string                       // at most 60 characters
  unit: 'money' | 'pct' | 'count' | 'rank' | 'years'
  x: (number | string)[]              // at most 64 points
  series: { id: string; label: string; tone: ChartTone; values: (number | null)[] }[]   // at most 6
  steps?: { label: string; value: number; kind: 'total' | 'delta' }[]                    // waterfall, at most 20
  marks?: { at: number; label: string }[]                                                // at most 8
  summary: string                     // the accessible text; also what a text-only test reads
}
```

`readChartSpec(json)` validates (finite numbers, caps above, strings at most 120 characters) and returns null on any damage; a null spec renders the old text rows. `MenuInfo.chart?: (g) => ChartSpec | null` sits beside `text`, which stays the accessible summary and the surface every existing string test reads.

**Components.** Digest sizes: geometry 450, Frame 220, Sparkline 70, LineChart 200, BarChart 240, Waterfall 200, RankLadder 220, Timeline 280, Meter 90, KpiTile 90, BulletRow 60, `useScrub` 120, CSS 220 (2,460); R1 plans 2,300 because Timeline covers only the net-worth case now.

| Component | Props | Notes |
|---|---|---|
| `Frame` | `spec`, `children`, `height?` | `<figure role="img" aria-labelledby aria-describedby>`; title; legend with a marker shape per series; a readout row; "Show as table" toggle that renders a real `<table>` |
| `Sparkline` | `values`, `tone`, `label` | 24 px, no axes; `aria-label` states first, last, minimum, maximum |
| `LineChart` | `spec`, `scrub?` | up to 6 series, 64 points, nice ticks, end labels instead of a colour-only legend |
| `BarChart` | `spec`, `stacked?` | cost structure by year; shares of sales |
| `Waterfall` | `spec` | rows, not columns (D.4); sign glyph and amount on every row |
| `RankLadder` | `rows`, `youId` | rank, delta (text plus glyph), sparkline; "you" pinned with two neighbours |
| `Timeline` | `spec` | net worth by age with marks (R1); the CV lanes of digest G's G.7 join the person profile (D.10, R4) |
| `Meter`, `KpiTile`, `BulletRow` | value, band, delta | the cockpit tiles |
| `useScrub` | `n`, `onMove` | pure `scrubReducer(state, key)` (arrows, Home, End) plus a thin hook |

**Themes.** Tokens in `global.css`, light and dark. Measured contrast of each mark against `--card` and `--bg` (graphics need 3:1; these are all above 4.4):

| Token | Light | on card / on bg | Dark | on card / on bg |
|---|---|---|---|---|
| `--chart-1` blue | #0072B2 | 5.19 / 4.61 | #56B4E9 | 7.17 / 8.08 |
| `--chart-2` vermillion | #C0480A | 5.03 / 4.48 | #F08A4B | 6.65 / 7.49 |
| `--chart-3` green | #007A5A | 5.34 / 4.75 | #2FC79A | 7.69 / 8.66 |
| `--chart-4` purple | #9B4F86 | 5.45 / 4.84 | #E39AC8 | 7.66 / 8.63 |
| `--chart-5` amber | #8A6A00 | 5.07 / 4.51 | #E6B422 | 8.60 / 9.69 |
| `--chart-6` slate | #4C5A6E | 7.01 / 6.24 | #A9B6C8 | 8.05 / 9.06 |

The hues follow the Okabe-Ito set, darkened for light mode. Good and bad bars reuse `--action-green #177638` (5.70) and `--action-red #c5302b` (5.48) and always carry a sign glyph, so colour is never the only code. The brand colours (2.2 to 2.4 on white) are never used for marks.

**Accessibility bar for every chart.** `role="img"` with title and description; a readout row that shows the value under the scrub cursor or the last point (no hover-only data); arrow-key scrub with Home and End; "Show as table"; 44 px targets; a marker shape per series; no colour-only encoding; `prefers-reduced-motion` honoured; usable at 360 px width; at most 150 SVG nodes per chart (a test counts them in `renderToStaticMarkup` output).

**Purity and information.** Builders read settled years only: no forecast, no RNG, no write. A frozen-state test runs every builder under `deepFreeze` over `fuzz-kit` states. Money stays in internal dollars; labels use `shortMoney` under `withMoneyContext(moneyContextOf(g))`, so a multi-year axis is in one price basis with the chip "prices of {year}" (D24: constant basis by default). Every builder passes its output through `reveal(spec)`, an identity function in R1 that R3's knowledge system replaces, so a hidden rival strength is never plotted (design section 6). R1 charts show only what the existing screens already print exactly.

## D.3 The book series (G.3)

**S1, company books.** `YearRecord` (`business/state.ts:120`) gains 14 optional whole-dollar numbers: `cash`, `debt`, `salesTax`, `cogs`, `wages`, `keyStaff`, `rent`, `marketing`, `interest`, `upkeep`, `other`, `otherIncome`, `ownerPay`, `draws`. The existing 9 stay (`year`, `revenue`, `profit`, `tax`, `units`, `price`, `staff`, `valuation`, `outlets`).
- Writer: `recordYear` (`business/economy.ts:996`) fills them from the `Statement`, `b.cash`, `b.debt` and `b.ownerDraws`, and becomes idempotent: `[...b.history.filter(h => h.year !== rec.year), rec].slice(-30)`.
- Reader: `readRecord` (`state.ts:581`) takes each new field only if finite and clamps to plus or minus 1e15; the normalizer's `slice(-12)` becomes `slice(-30)`.
- Bounds: 30 rows by 23 numbers is 690 a company, about 620 more than today. At 12 companies +7,400 nodes; at 30 companies +18,600 (3.7% of the 500,000 cap). Digest G proposed 20 rows; 30 is digest J's rubric R9 (a 30-year series of 6 numbers).
- Old saves: rows without the new fields show "history starts {year}" on the breakdown charts; the cash walk uses an honest residual row ("everything else") until the ledger (A.K1, R2) makes it zero, and a test then pins it to 0.
- Left for later: dividends, injections, capex and inventory value, because no single field names them today (the ledger names them).
- Difference from design 12.6, which names another 14: `inventory`, `dividends`, `injections` and `capex` where the list above has `salesTax`, `keyStaff`, `otherIncome` and `ownerPay`. Both are 14 new fields (23 numbers a row), so the node budget is the same. This list is what the cost-structure history needs to stack the same lines as the waterfall (key staff, other income and owner pay are waterfall steps in design 12.6 itself); the design's four have no source field in v4.0.2, so they join the row in R2 with the ledger: 4 numbers a row, 120 nodes a company, about 1,440 at 12 companies, inside R2's net saving. The R1 spec settles the final list.

**S2, market ladder history.** `MarketHistory` rows gain `top?: [string, number][]` (rival id and share rounded to 1e-6, at most 8) written where the row is built (`business/competition.ts:90`) and read in `competition-state.ts:264`. 20 years by (8 pairs by 2 plus 1) is 340 nodes a company market; 12 companies +4,100, 30 companies +10,200. Design 12.6 puts S2 at about 320 nodes and all series at about 22,000 nodes with 30 companies; counted as built (`MarketHistory` holds one row list per company market and `.slice(-20)` keeps 20 rows, `competition.ts:90`), S1 18,600 plus S2 10,200 plus S3 1,100 is about 29,900 at 30 companies, 6.0% of the node cap. R1's budgets use 29,900 and the design figure reads as a lower bound.

**S3, the life series.** `flags.lifeSeries` v1: `{ v: 1, id: lifeId, rows: [age, year, netWorth, cash, debt, income, happiness, health][] }`, at most 120 rows (about 1,100 nodes), written at the end of `ageUp` (`aging.ts`) by age (replace the row of the same age), so a replay or a Time Machine fork writes its own. An heir starts a new series; the parent's series condenses to 40 points on the graveyard entry (`spark?: number[]`).

**Tests** (`test/series.test.ts`, new): hostile rows (NaN, 1e300, strings, 500 rows) clamp and cap; `recordYear` twice for one year leaves one row; 31 years leave 30; the v4.0.2 fixture loads and a company without the new fields renders; S1 growth at 30 companies is at most 20,000 and S1 plus S2 plus S3 at most 32,000; S3 is idempotent by age; `lifeSeries` of another life is ignored.

## D.4 Profit and Loss waterfall and the phone layout (G.1, G.4)

**Steps** (from `Statement`, `business/state.ts:133`; the identity matches `economic-report.ts` and `economy.ts:772`):

1. Sales after sales tax (`netRevenue`), a total.
2. Deltas, each its own row: materials and direct costs (`cogs`), wages, key staff and managers (only if above 0), premises (`rent`), marketing, debt interest, upkeep and investment budgets, one-off costs (`other`), other income (`otherIncome`, split into franchise and lab lines by the helpers `statementLines` already uses), owner salary (`ownerPay`).
3. Profit before tax (`pbt`), a total; corporate tax (`corpTax`), a delta; net profit (`net`), a total.

Any rounding residual is drawn as its own "Rounding" row, never hidden, so the plotted steps always sum to net.

**Screen layout (360 to 480 px wide).** Five tabs in a row that scrolls sideways, each 44 px tall. Rows, not columns, because 14 steps do not fit across a phone.

```
+--------------------------------------+
| 2031 Annual Report      Acme Foods   |  sticky, 48 px
| [Summary] [P&L] [Cash] [Market] [Plan]|  tab row
+--------------------------------------+
| Net profit  $1.2M   up $310K (35%)   |  two KPI tiles a row
| Sales       $9.8M   up 4%            |
| Cash        $2.1M   Debt $0.4M       |
| Value       $14M    #3 of 9          |
+--------------------------------------+
| Where the sales went                 |
|  Sales after tax      ##########9.6M |  one row per step, 32 px
|  Materials         -  ####     3.9M  |
|  Wages             -  ##       2.2M  |
|  ... (Summary shows the top 5 and    |
|       "everything else")             |
|  Profit before tax  =  $1.6M         |
|  Tax                -  $0.4M         |
|  Net profit         =  $1.2M         |
|  [Show as table]                     |
+--------------------------------------+
| [Approve plan]       [Keep last year]|  sticky bottom bar, 48 px
+--------------------------------------+
```

- **Summary:** tiles, the top 5 drivers, the one-line verdict from `economicReportSummary(b)`.
- **P&L:** the full waterfall; "Why profit changed" as a second waterfall from `economicReportOf(b)` (an exact, validated bridge: free data); profit and cost-structure history (30 years).
- **Cash:** opening cash, net profit, owner draws, "everything else", closing cash; cash and debt lines (30 years).
- **Market:** share against the leader (20 years from `MarketHistory`), the rank ladder with the top 8 rivals (S2), market size sparkline. The header label "Estimate" stays where it is today.
- **Plan:** the existing price and production sliders and projection, logic untouched (`AnnualReportResult`, `SKIP_RESULT`).

The builder adds `data.chart` to the report data, read defensively like `readReportData`; a missing or damaged chart shows today's text rows. The other five report variants (classic and deep-tech minigames, Lab, Studio, Financial Institution, Nation) keep their text this release and gain the same frame when their owning release touches them (Lab in R3 with C.11, Nation in R7 with B.13, Studio and Financial Institution in R9 with J.9). **Year-End Desk:** when two or more `annualReport` modals queue for one year, one frame with a stepper ("2 of 6"), a company strip with net profit and a delta, and "Approve every suggested plan", which calls the existing `finishMinigame(id, 'skip')` for each, so no plan logic is touched.

## D.5 Ranking ladders and sparklines (G.6)

`RankLadder` rows: rank, name, value, change since last year (text "up 2" or "down 1" plus a glyph), and a 10-year sparkline of rank or share. Top 5, then "you" with two neighbours above and below, 44 px rows, an `aria-label` that reads the whole ladder. R1 wires the sources that already hold data: the market Leaderboard and History (`business/market-menu.ts:125`, `market-view.ts`, S2), AI lab and device scorecards (`business/scorecard.ts`), the music rival chart (`special/music-market.ts`), nation approval (12 yearly reports) and the careers kit standing rows (`YearRow.rank` and `of`). Stock lists get sparklines from `invest/engine.ts` `exchangeYear` (pure, no storage). The text bars (`spark()`, `bar()` in `market-view.ts:30, 37`) stay as the accessible fallback.

## D.6 Search, palette, pins, recents, breadcrumbs (G.8, G.9)

- `src/ui/nav/searchIndex.ts` (new, pure) walks `MenuGroup.children(g)` only, never `hint` or `subtitle` (a hint can run the optimiser), into `{idPath, label, breadcrumb, keywords, lockReason, entity}`. People, companies and stocks are entities (`peopleMenu` adapter makes each person a group `person.<id>`). Ranking: prefix, word start, substring, subsequence, then pins and recents; locked rows last with their reason; a final row "Do Anything: {query}". Time-sliced idle walk, cached by `(lifeId, year, age, assets.length, job, office)`.
- Pins (12) and recents (8) live in `localStorage` key `anotherlife.ui.v1` (a per-viewer convenience, wrapped in try and catch), never in `GameState`: `act()` clones the state every tap and the Time Machine would rewind them. The "Back to" chip (`ReturnChip.tsx`) becomes the newest recent. Breadcrumbs under the sheet header (`popTo(n)`); deep links reuse `MenuSheet`'s `initial`.
- Header gains a search button and an inbox bell; desktop gets Ctrl or Cmd plus K and "/" for the palette, 1 to 4 for tabs, A to age. Four tab names and "+ Age" stay (D23).
- Regrouping (G.8): Activities becomes 8 sections (Health and Mind, Love and Social, Money and Games, Law and Crime, Travel, Fame and Media, Home and Shopping, World and Politics) with Do Anything on top and Surrender last; roots get "Needs you" badge rows from `badge?: (g) => string | number | null`; groups over 12 rows need headings and one-row groups inline (lint test). Ids never change.
- Effect: any action in 3 to 4 taps (open, type, tap, input) instead of 6 to 8 (buy a stock is 6 to 7 today; start a product 5 plus popups).

## D.7 Notice digest and Quiet Mode (G.11)

- **Step 1, UI only.** `ModalHost` merges consecutive `notice` items at the head of the queue into one digest card, one OK, through a new `dismissNotices(ids)` in `ui/store.ts`. `g.queue` is untouched, so the 256 test files that read it stay green. A `choice` card is never merged and never preceded by a merged card that hides it; any bad tone makes the card bad-toned.
- **Step 2, weights.** Optional `NoticeModal.weight?: 'minor'`, set through the `notice()` options in `core.ts` on the 20 most frequent emitters (chosen by a counting probe over the 13 lives digest E measured). `store.processQueue` routes `minor` items to `g.flags.inbox` (60 items, 160 characters, optional deep link id) when Quiet Mode is on (Settings, `src/settings.ts`, default on). Bad-tone, health, legal and large-money notices never route.
- **Year-End Desk** (D.4), and `LifeLog.tsx` shows the last 3 years open and older years collapsed, which bounds the DOM (G.14).
- Measured baseline to beat (digest G): a plain life 2 popups and 4.5 log lines a year; one company 3 to 8 and 9 to 14; six companies 5 to 8 and 20 to 31.

## D.8 Accessibility pass (G.12)

`Sheet.tsx` and `PopupFrame` (in `Dialogs.tsx`): `aria-modal`, a focus trap (pure `trapFocus(nodes, key)` reducer), focus restore on close, `inert` on the background root; roving tabindex in `MenuList.tsx`; header icon targets from 32 px to 44 px; header text on the gradient start (3.64:1) fixed by darkening `--header-from`; the R0-11 contrast test extended with the chart tokens. The repo's roadmap lists "UI and accessibility" as PLANNED (focus traps, keyboard navigation, labels); this delivers it.

## D.9 The text picker (E.T1, E.T2, E.T7)

- `src/game/text/` (new): `pick.ts` (`pickLine(g, lines, fam?)`), `memory.ts`, `hash.ts` (`hpick(lifeId, year, key, lines)`), `registry.ts` (`defineLines(id, lines)`), `index.ts`.
- `pickLine` draws exactly one `rand(g)` like `pick`, so no seeded run shifts until memory excludes a line. Pools of 12 lines or fewer are shuffle-bags; larger pools exclude the last half, at most 8. The family key defaults to a hash of the pool, so the later codemod (E.T3, R2) over 785 inline and 168 constant pools needs no names.
- Memory `g.flags.textMem` (optional, validated): at most 300 pools by 6 indexes and 120 families, reset per generation, about 8 KB; per-person `p.data.said` (8 topics) arrives in R5.
- Presentation text (news, digest) uses `hpick`, a hash like the CEO coda (`business/career.ts:399`), never `g.rng`.
- First client: `events/flavor.ts` (341 base plus 4,418 era lines, the only line memory in the game today, 60 keys) moves onto the shared memory; a test proves the draw count is unchanged.
- E.T2 harness `test/text-kit.test.ts`: 4 seeded lives to 90 (about 25 s; the nightly job plays 20), measuring repeated lines, same line within 10 years, any line more than 3 times, popup family counts, shared 3-word openers, popups a year. R1 records the baseline; R2, R3 and R5 turn thresholds on.
- E.T7: voice roles `headline` (cap 70, aim 55) and `deck` (cap 110, aim 90) in `scripts/voice/rules.mjs`; old keys untouched; the em-dash guard stays at 24.

## D.10 Platform: CI, cycles, guards, saves (K.1, K.7a, K.11, K.5a, A.K0, X.G1, J.1)

- **K.7a sharding.** `scripts/ci-shard.mjs` (new) reads `scripts/test-timings.json` (new, regenerated by `node scripts/ci-shard.mjs --update` from a CI log) and prints the files of shard i of n. `.github/workflows/ci.yml` becomes a matrix of 4 shards by 2 workers plus a gate job; typecheck, voice report and the build run once. The five files over 200 seconds (simulate 494 s, era-features 401, main-character-life 340, sector-story 278, anachronism 214) split by seed range through a helper `test/shard-kit.ts` (`seedSlice(all, key)`, env `SLICE=i/n`, default the full range). Target wall 9 to 10 minutes against 36, the same billed minutes. A test asserts the shards' union is all 389 test files. Public repo for free minutes is D8 (part G).
- **K.1 cycle ratchet.** `test/architecture.test.ts` (new, about 1 second) builds the runtime import graph with the esbuild metafile (made an explicit devDependency) and compares the modules inside cycles with `test/architecture-baseline.json` (the 147 modules in 5 components: 85, 30, 19, 7, 6). It fails on a new module in a cycle and on a baseline module that left the cycle, so the list can only shrink. Layer rules (b) to (e) of digest K arrive with the registry in R2.
- **K.11.** Per-track preview deploys and a `FLAGS` object (`src/game/flags.ts`, new) for features that ship dark.
- **K.5a.** Wire `idbSaveBackend` (`save-backends.ts:101`, with its 3,000 ms timeout) and `setSaveBackend` (`save-store.ts:96`), neither of which has a production caller today: boot picks IndexedDB, falls back to localStorage on timeout, reads the legacy `anotherlife.save.v1` key once and migrates it. `src/main.tsx` renders after the backend is chosen. R1 adds about 14,000 nodes to every save, so the quota risk grows with it.
- **A.K0.** `src/game/world-flags.ts` (new) classifies every `flags` key as `world`, `personal` or `cache`; `test/world-flags.test.ts` scans `src/game` for `flags.<key>` and `flags['<key>']` and fails on an unclassified key; the heir-survival table of R0-4 covers every `world` key.
- **X.G1 guards.** `test/foresight-scan.test.ts`: any call of `exchangeYear(`, `cryptoYear(`, `goldYear(` or `fxYear(` whose arguments contain `+ 1` fails outside `invest/instinct.ts`. `test/money-ratchet.test.ts` with `test/money-ratchet.json`: per file counts of `earnIncome(`, `addMoney(`, `spend(`, `b.cash +=` and `p.money +=`; a count above its baseline, or a call in a new file, fails. R2 replaces it with the reasoned-call ratchet.
- **J.1.** `test/depth-rubric.test.ts` with a `DEPTH` registry (rungs, rows, rules per module) for business and the 11 careers; advisory: it prints the 17-dimension table and fails only on a malformed entry. Seeded with digest J's scores (business 43, actor 34, astronaut 31, model 32, musician 36, author 17, influencer 14, politician 34, sports 30, game industry 32, hustler 8, military 18).

## D.11 Acceptance criteria

1. Waterfall steps sum exactly to net for 168 seeded statements (3 seeds by 56 trades); the "Rounding" row is under $5 in 99% of them.
2. Every chart component renders under `renderToStaticMarkup` with role, title, description, readout, a table toggle and at most 150 SVG nodes; geometry has no NaN for empty, one-point and constant series; `scrubReducer` handles arrows, Home and End.
3. All chart tokens meet 3:1 as marks and the text pairs of R0-11 meet 4.5:1 in both themes.
4. A hostile `data.chart` and a hostile `lifeSeries`, `textMem` or `inbox` flag render, load and stay bounded.
5. Series tests of D.3 pass, including the v4.0.2 fixture and a 30-company node budget.
6. The tree snapshot test: the set of reachable action id paths before and after regrouping is identical (11,822 nodes, 0 duplicate id paths today); lint: no group over 12 rows without headings (28 today) and no one-row group (146 today); the search index over `fuzz-kit` states writes nothing and calls no `g.rng`.
7. "stock" finds Buy a Stock and opens it in at most 4 taps; pins (12) and recents (8) round-trip through `anotherlife.ui.v1` and never enter `GameState`.
8. Digest merge leaves `g.queue` unchanged; a table of bad-tone, health, legal and large-money notices never routes to the inbox; Quiet Mode toggles.
9. `pickLine` leaves the RNG in the same state as `pick` for the same pool; shuffle-bags never repeat before exhaustion; memory caps hold; `hpick` draws nothing.
10. Shards cover all 389 test files; sharded wall at most 12 minutes; the cycle ratchet fails on a synthetic new cycle; the money ratchet fails on a synthetic new `earnIncome(` call; the foresight scan fails on a synthetic `exchangeYear(f, a, i, y + 1)`.
11. IndexedDB: a v4.0.2 localStorage save loads, migrates and round-trips; a hung database falls back after 3,000 ms; `test/save-store.test.ts` and `test/save-schema.test.ts` green.
12. Per-tap cost within 5% of v4.0.2 (the kit is lazy and reads cached series); bundle grows at most 60 KB gzipped.
13. v4.0.2 saves load unchanged; sharded CI green.

**Balance and exploit probes.** None change money. The probe is "R1 changes no simulation output": a 30-life, 40-year run with the same seeds before and after R1 gives identical `JSON.stringify` of everything except the new optional keys (`lifeSeries`, `textMem`, `inbox`, new `YearRecord` fields, `MarketHistory.top`).

**Risks.** Regrouping can strand ids in return points and tests: ids never change, hubs are new roots, the snapshot test guards reachability. Search walks every `children()`: one slow or impure builder hurts, so the index test runs over `fuzz-kit` states. Charts can leak knowledge: settled years only, and `reveal`. The residual cash row ships labelled until R2. State growth of 14,000 nodes lands before the diet of R2: saves are about 3% to 5% bigger for one release. Inbox could hide something urgent: only `minor` routes, enforced by test.

**User-visible changes (release notes).** A Profit and Loss waterfall, history and cash charts for every company; rank ladders; a cockpit per company; a net-worth line; search with pins and recents; breadcrumbs; "Needs you" badges; one OK for a run of notices; a quiet inbox; a Year-End Desk; keyboard and screen-reader fixes; saves in IndexedDB; repeated lines in the life log start to thin.

**Exit gate.** D.11 green on sharded CI; the owner opens the Annual Report on a phone-width window and finds the waterfall, history and cash walk; the 30-life identical-output probe passes.

---

# E. Per-release plans: what each needs first

R0 and R1 are detailed above. Every later release gets, when it starts, what past releases had: a spec at `docs/superpowers/specs/<date>-<name>-design.md` (cut from the matching design sections) and a plan at `docs/superpowers/plans/<date>-<name>.md` in the format of this file's header (Goal, Architecture, Tech Stack, Spec, Global Constraints, Review Focus, then tasks with Files, Interfaces and steps), written against the code as it stands after the previous release, because line numbers move. A release's plan is not started until its inputs below exist.

| Release | Design sections | Needs first (inputs, baselines, decisions) |
|---|---|---|
| R2 | 4, 13 | The 460-site money call inventory by file (the ratchet baseline); the list of 119 pinned `seed: N` tests; digest A's size probe (1.78 MB, 103,728 nodes) and digest K's year-step table (83, 108, 134 ms) re-run on R1; a Time Machine fixture and an IndexedDB fixture; decisions D1, D2, D3, D5, D7 (closed money, touched-only strangers, NPC firms indexed in place, mobile speed, one rebaseline; D6 was settled in R1 and D4 waits for R4) |
| R3 | 5, 6, 9 | A golden file of today's `rdCost`, `launchP`, `heavy`, `ops`, deep-tech, AI-cap, studio and workshop functions over an input grid, captured before any migration (the parity oracle); the omniscient-mode switch in `vite.config.ts` `setupFiles`; the E.T2 clutter baseline from R1; decisions D11, D13, D14, D15, D16, D20 (hints as estimates, Exact mode, illegal intel and leaks, ambition, focus weeks and banked knowledge, digest placement) |
| R4 | 7 | Golden tests of relationships, love, wealth, will and nepo (numbers before the `addRelationship` shim); an inventory of the 8 parallel "named person" shapes (dating `Candidate`, `strangerName`, election opponent, `Me.rivals`, `Director`, `KeyStaff`, `Manager`, nepo `Outsider`); the `sid` scheme; A.K2's registry interface; decisions D4, D17, with D2 and D15 re-read (heirs and debts, the NPC web, unprompted family acts, inferred personality, notables) |
| R5 | 9, 13 | The outlet and template catalogue sizes (about 60 fact kinds by 3 classes), detector thresholds (recession, inflation over 8%, unemployment plus 2 points, rate plus 100 bp, currency minus 10%, housing minus 8%); the data-pack split map (era packs 0.66 MB, history 0.28, locales 0.22, brands 0.38); the cycle baseline after R2; decision D19 (fictional outlets, future events in the Paper), plus D18 and D20 re-read for digest placement and weight 0 to 1 log-only |
| R6 | 11 | The kit interface freeze note (first 8 hours); `DEPTH` registry entries for Author and Game Employee; the payer catalogue (brands, studios, publishers, leagues) with yearly budgets; decisions D26, D27 (automation, rivals as Persons at 32 a life, kit first), plus D4 for heir inheritance of career assets and D25 for "as deep as business" |
| R7 | 8 | The 67-row `WarDef` parity table (every scripted war, side, date, draft rule); a "life without foreign policy is byte-identical" fixture; divergence-budget numbers; decisions D9, D10 (divergence in historical years, 2026 conflicts, content level, fictional leaders), plus D11 for fog against honest odds |
| R8 | 8, 11 | R7's conflict ledger interface; the defense-family spec (sector-families recipe); Military and Politician `DEPTH` baselines; the property promotion API from A.K2; no section 15 decision; the wartime budget cap on contractor exits is a rule (design 8) |
| R9 | 10, 11 | The 90-row show series catalogue in a data file reviewed against the brand rules (`data/brands.ts`: no invented scandals for real brands, no real living people); the organiser payee interface; the table of the 17 classic-only trades (`docs/superpowers/specs/2026-10-19-sector-families-design.md`, section 5); decisions D21, D22 (names, year-step resolution, real-brand crashes, hired-CEO attendance, hosting) |
| R10 | 4, 11 | The pools interface (A.K5) and LOD budget meter; league data by country and era; Underworld safety notes (stays abstract, as `underworld.ts` states); decisions D26, D2 (franchises as a trade, 56 to 57; the Special Careers entry; touched-only persistence) |
| R11 | 11 | The advertising-pool entity from A; the Work Plan family list (`workplace/`, 1,389 lines); rubric baselines; decisions D14, D26 (illegal intel careers; Journalist and Scientist) |
| R12 | 11, 13 | The nightly job's 7-day history; the p95 year-step measurement on a 2022 mid-range phone (K.10 trigger); decision D25 (advisory against failing gate) |

Each plan also reuses what R0 to R2 built: `findSeed(pred)` instead of pinned seeds, the golden digests, the ratchets, the preview deploys and the `DEPTH` registry.

---

# F. Programme-level strategy, gate, risks and totals

## F.1 Test strategy

| Tier | Runs | What it holds |
|---|---|---|
| Fast (PR) | every push, under 5 minutes | typecheck, architecture and cycle ratchet, money ratchet, foresight scan, flag classification, voice guard, affected tests (a median change reaches 67% of files, so the tier is the ratchets plus 3 seeds by 20 years) |
| Full, sharded | every PR, 9 to 13 minutes (4 shards, 8 from R5) | all 389 test files (about 6,800 tests today), the five slow files split by seed range |
| Nightly deep | every night, about 90 minutes | `FUZZ=1` 40 seeds by 160 years, 200-seed balance probes (net-worth percentiles), 100 times ceiling probes, anachronism over 400 lives, every old save fixture migrated and run 5 years, metric diff against the previous night |
| Release | each release | five integration runs, the human playthroughs named in each exit gate, the preview deploy |

Cross-cutting tests, each with an owner release:
- **Conservation** (R2 on): money (accounts sum to previous plus mint minus burn, within $1, flows net zero per reason), people (births minus deaths plus migration), property (holdings sum to 1, owned plus rented plus vacant equals stock), jobs (`jobId` equals filled slots, one full-time job, wage bill equals pay flows), goods (opening plus output plus imports minus sales minus spoilage minus exports equals closing, per basket). Per-domain money scans for bonds, reparations, contracts, aid, frozen assets (R8), show fees (R9), pools (R10), creators (R11).
- **Ceilings** (every release): scale each input by 100 and assert a real-world cap. The caps in force: effort `k` at most 4, knowledge at most 100, quality at most frontier plus headroom, royalties at most 1.5 times plan, one wave per origin, promotion terms at most 1.35 together, `showBoost` at most 0.15, stock mood at most 4%, reparations at most 3% of GDP a year, debt cap 2.5, war inflation shock at most 0.15, mentorship at most x1.15, favor reach, deal ceilings, Olympic bonuses and the 30,000,000-listener podcast cap of R0, the advertising pool of R11.
- **Determinism and purity**: replay, reload and Time Machine fork give identical JSON; every menu, hint, chart builder and estimate reads under `deepFreeze`; no `g.rng` in a read; yearly steps idempotent by year stamp.
- **Information**: stated bands hold the truth about 80%; same source, same year, same number; no read after `g.year` (R1 scan, R3 harness).
- **Old saves**: the v4.0.2 fixture plus one new fixture per release run 5 years in CI; a hostile-record fuzz per new flag (garbage, NaN, 500 rows, another owner).
- **Text**: the E.T2 harness thresholds (design section 9); the voice report; the static era gate over the whole corpus from K.9 replaces the 214-second sampled lint.
- **Performance and size budgets**, checked by a 50-year probe per release: core chunk at most 400 KB, world at most 1 MB, 600 KB gzipped; per tap at most 8 ms for the core chunk; light-life `ageUp` at most 160 ms desktop and 250 ms mobile; world step at most 60 ms; initial bundle at most 5.5 MB after R5.
- **Pinned seeds**: replaced by `findSeed(pred)` wherever a file is touched; no new `seed: N` pin.

## F.2 The depth gate

Rubric (digest J, 17 dimensions, 0 to 3, the bar for 3 is the acceptance test): R1 Ladder, R2 Living field, R3 Money and books, R4 Assets, R5 Team, R6 Law, R7 Crises, R8 Research and craft, R9 Reports, R10 Fog, R11 Exit and legacy, R12 Automation, R13 History and country, R14 World hooks and news, R15 Showcase, R16 Text and clutter, R17 Tests. Gate, from R12: every module (business and the 11 careers) has no dimension under 2, at least 14 dimensions at 3 and a total of at least 45 of 51. Business must itself reach 3 on R8, R9, R10, R14, R15 and R16. A dimension that cannot apply gets a named substitute (the hustler's R12 becomes a crew). `test/depth-rubric.test.ts` is advisory from R1 (it prints) and failing from R12.

Today (digest J): business 43; actor 34, astronaut 31, model 32, musician 36, author 17, influencer 14, politician 34, sports 30, game industry 32, hustler 8, military 18. To reach 45 the 11 careers need 209 more dimension points in total (actor 11, astronaut 14, model 13, musician 9, author 28, influencer 31, politician 11, sports 15, game industry 13, hustler 37, military 27); business needs 8.

Which release lifts which dimension (R means the release, not the rubric row):

| Rubric dimension | Business today | Careers mean today | Lifted by |
|---|---|---|---|
| R3 Money and books | 3 | 2.0 | R0-3 (no mint); R2 A.K1; careers R6 (I.Kit2 K1 ledger) |
| R4 Assets | 3 | 1.4 | careers: R6 K6 legacy, then each career |
| R5 Team | 3 | 1.3 | careers: R6 K2 team, R4 D.4 loyalty |
| R6 Law | 3 | 1.8 | R7 B.5, B.6; each career's own rules |
| R8 Research and craft | 2 | 1.3 | R3 C.3 (business to 3), R6 C.5, R9 C.8 |
| R9 Reports | 2 | 1.5 | R1 G.3, G.4 (business to 3); careers R6 K11 and the report card |
| R10 Fog | 1 | 0.7 | R3 H.1 to H.11 (business to 3); careers R6 K8 |
| R11 Exit and legacy | 3 | 1.7 | R6 K5, K6; R8, R10, R11 per career |
| R12 Automation | 3 | 0.1 | R6 `auto` in I.Kit2; each career opts in |
| R14 World hooks, news | 2 | 1.3 | R5 E.N1; R6 K7; R7 war-year tests; business to 3 by R9 J.9 |
| R15 Showcase | 1 | 1.5 | R9 F.1 to F.10 (business to 3); careers F.8 |
| R16 Text and clutter | 2 | 1.5 | R2 E.T3, R3 E.T6, R5 E.T4; business to 3 |
| R2 Living field | 3 | 1.7 | careers: R6 K3 peers; R8 opponents and units; R10 rosters and crews |
| R1 Ladder, R7 Crises, R13 History, R17 Tests | 3 | 2.1, 2.0, 2.4, 1.8 | each career's own release |

## F.3 Risk register (top 15)

| # | Risk | Where | Mitigation | When |
|---|---|---|---|---|
| 1 | Seeded tests churn when the stream layout changes (119 pinned seeds; one extra draw shifts every digest today) | K, E | One rebaseline in R2, named streams, golden digests per slice, `findSeed`, a written list of moved tests | R2 |
| 2 | Save size and per-tap cost grow with every optional record | A, G, K | Node budgets per release, `previous` dropped, core and world chunks, per-tap probe in CI | R1, R2, all |
| 3 | Cross-track CI failures on hot files (v4.0.0: 4 found, 3 of 5 runs red) | K | Cycle ratchet, sorted registry, per-track docs, daily rebase, previews, sharded CI, track caps | R1 on |
| 4 | Exploit loops from new money terms (the trillion-dollar studio loop) | J, B, F, I | A ceiling per growth term, 100 times probes, 160-year ceiling tests, payers with budgets | all |
| 5 | Migrating about 460 money call sites to the ledger | A | Wrappers with optional reason, ratchet that cannot rise, idempotence tokens | R2 |
| 6 | Fog feels like pixel-hunting | H | Defaults are words, research pays visibly, Exact mode, a human playthrough in the R3 gate | R3 |
| 7 | Foresight creeping back in through new estimates, tips and previews | H | R1 scan, R3 harness, `quote` never takes `u` | R1, R3 |
| 8 | Promotion and demotion order changes results | A, D | Seeded keys, sorted ids, replay equals reload equals fork test | R2, R4, R10 |
| 9 | Test time: 250,000 new test lines add about 47 minutes unsharded | K | 8 shards from R5, nightly deep tier, fast tier, timing file | R1, R5 |
| 10 | Bundle growth against 8.3 MB | K | Data packs and lazy domains in R5, bundle-budget test | R5 |
| 11 | Content taste and safety for war and Underworld | B, I | Aggregates only, no nuclear use, fictional leaders, no real living people, detail toggle, abstract schemes | R7, R10 |
| 12 | Scope and a failing gate at the end | I, J | Advisory rubric from R1, named substitutes, careers in three trains, high-case budget | R12 |
| 13 | Year-step time: elite firms cost 80 ms each against 2 ms for light ones | A, K | 20 full firms cap, `FirmLite`, world step at most 60 ms, budget meter, worker trigger K.10 | R2, R10 |
| 14 | Heirs and the Time Machine disagree about `g.world` | A, D | World by cloning, personal by owner stamp, heir and fork tests | R2, R4 |
| 15 | Merge capacity: 9 agents on 4 CPUs contend; 8-track R9 is the stress point | K | Track caps, sharded CI, R9 only after R6 and R7 prove 6 tracks | R9 |

## F.4 Totals: low, expected, high

Expected case: the planned lines above, 4.1 agent-hours per 1,000 source lines, 15% integration tax. Low: items land at 75% of plan (the sector-family and kit recipes repeat, so later releases are cheaper than v4.0.0's first of a kind), 3.5 agent-hours per 1,000 lines, 10% tax, K.10 out. High: items at 130% (digest I's per-career figures sum to 70,000, not 60,000; class sizes at their top), 5.0 agent-hours (hot-file collisions get worse as the tree grows), 25% tax, K.10 in.

| | Low | Expected | High |
|---|---|---|---|
| Source lines | 174,350 | 232,490 | 305,470 |
| Test lines | 188,907 | 251,696 | 330,689 |
| Docs lines | 21,750 | 21,750 | 21,750 |
| Total lines added | 385,007 | 505,936 | 657,909 |
| Agent-hours | 619 | 964 | 1,541 |
| Wall-clock hours, serial, continuous | 154 | 245 | 426 |
| Wall-clock hours, dependency critical path | about 130 | about 206 | about 359 |
| Calendar days at 16 agent-hours a day plus one owner-review day per release (13 gates) | 23 | 28 (26 on the critical path) | 40 |
| Full CI, unsharded, at the end | 72 minutes | 84 minutes | 99 minutes |
| Full CI, sharded (8) | 12 minutes | 13 minutes | 16 minutes |
| Billed CI minutes for the programme (41 runs a release at that release's unsharded time, plus a 90-minute nightly) | about 29,700 | about 33,200 | about 38,100 |

What the numbers rest on: one data point (v4.0.0: 72,081 lines, 143 commits, 12.5 to 14 hours, 9 tracks, 3 of 5 integration runs red). Treat the low case as a floor. Not in the estimate: owner design changes after a playthrough, a failed gate in R12, K.10 in the expected case, and any release that waits on a decision (part G). Billed minutes assume a public repository: at 2,000 free minutes a month a private repository cannot carry this programme (digest K, decision "public repo"). State at the end of the programme: about 180,000 saved nodes at 12 companies (36% of the cap); initial bundle about 5.5 MB before the new careers' lazy chunks, which load on first open.

---

# G. Decisions that block each release

Design section 15 holds the 28 open decisions as D1 to D28, each with options, a recommended default and the first release it blocks. This part files each decision once, under that first release, with the items it blocks here. Every default is the design's recommendation. A release starts on its default if the owner does not answer, except where marked **ask**.

| Release | Decision (design section 15) | Default | Blocks here |
|---|---|---|---|
| R0 | **D28** The perfect-foresight income: keep it, or remove it and give top CEOs a real, non-monetary benefit | Remove (the owner's follow-up already points at removal); the benefit is J.8 in R3. **ask**, because it deletes a deliberate power-fantasy rule | R0-3 (merge it last in its track) |
| R1 | **D6** Save compatibility horizon | Every old save keeps loading | K.5a, every release |
| R1 | **D8** Repo, CI and dark flags | Public repository for free minutes, 4 shards, features dark behind flags with preview deploys | K.7a, K.11 |
| R1 | **D12** The Investing gut | Keep it as the one documented foresight exception, fenced from every purchasable source (F16) | X.G1 scan wording; R3 H.13 |
| R1 | **D18** Popups and Quiet Mode | Demote only in the store flow; Quiet Mode on by default; weight 0 to 1 outcomes log-only; bad-tone, health, legal and large-money notices stay modal | G.11 |
| R1 | **D23** Navigation shape and what "better system" means | Keep the four tabs plus "+ Age", open each on a cockpit, search and inbox in the header, no desktop two-pane now | G.8, G.9 |
| R1 | **D24** Chart money basis and depth | Constant dollars with a "prices of {year}" chip; 30 years of company books and a whole-life series | G.3, G.5, D.3 |
| R1 | **D25** The depth gate | The 17-dimension rubric for business and all 11 careers, advisory until the programme ends, then failing (no dimension under 2, 14 or more at 3, 45 of 51) | J.1 now; X.G12 in R12 |
| R2 | **D1** Is money a closed system | Every flow has a named counterparty, pools may run negative, only declared mints and burns | A.K1 |
| R2 | **D2** Who gets a persistent record | Only strangers the player touches, promoted on contact (400 named people and 32 career peers a life) | A.K2, K.6 |
| R2 | **D3** Old saves' NPC firms | Index in place, do not rewrite | A.K2, K.6 |
| R2 | **D5** Performance target | A 2022 mid-range Android at most 400 ms a year step, desktop light life under 160 ms, a world-detail setting | K.5, K.10 |
| R2 | **D7** Global seed rebaseline | Once, in R2; pinned seeds move to `findSeed` | K.3, E.T3 |
| R3 | **D11** Honest odds under fog, and what hints are | Odds from what you know, labelled estimate, rolled from the truth; hints become honest, fallible estimates | H.1 to H.11 |
| R3 | **D13** Exact mode, and fog at the start | Settings offers Realistic (default) or Exact; numbers for own-industry markets, words elsewhere | H.3, H.5 |
| R3 | **D14** Illegal intel and secrecy | Allowed, abstract, with real prison and scandal risk; leaks are a yearly hazard, no spy minigame | H.4, C.5 |
| R3 | **D15** Player personality and ambition | Inferred persona, ambition shown from age 18 with a visible yearly posture | C.1, C.2 |
| R3 | **D16** Effort bookkeeping | A pool of about 12 focus weeks; failed research banks knowledge, at most +15 odds points | C.1, C.2 |
| R3 | **D20** Digest placement | The last popup for 10 years, then an inline card | E.D2 |
| R4 | **D4** Heirs and debts or career assets | Kin debts pass through holdings, career assets pass, standing and memory do not | A.K8, D.9 |
| R4 | **D17** NPC web and family initiative | Player-centred web plus kin, feuds and company links, showing only what is known; family may act unprompted inside 3 popups a year | D.1 to D.5 |
| R5 | **D19** News outlets and future events | Fictional outlets only; scheduled events (fairs, Olympics) appear, never their outcomes | E.N2 |
| R6 | **D26** Careers: automation, franchises, Underworld, new jobs | Optional capped automation with a yearly letter; Journalist and Scientist built, the other six Work Plan jobs wait | I.Kit2 |
| R6 | **D27** Order of kit and families | Kit and careers first, the sector families in parallel as table work | the order of R6 and R9 |
| R7 | **D9** History versus freedom | Pre-2026 stays on script for NPCs; a President may diverge in his own country inside the divergence budget; 2026 conflicts stay open | B.1 to B.6 |
| R7 | **D10** Content level | No nuclear use, aggregate casualties, a detail toggle, fictional leaders, no violence against NPCs. **ask** | B.3, B.5 |
| R9 | **D21** Show Circuit names and resolution | Real organiser names where the registry has them, invented elsewhere; resolve at the year step with one stance choice; real-brand rivals cannot crash a demo; hired-CEO firms attend by policy | F.1 to F.4 |
| R9 | **D22** Hosting an organiser | Build the payee interface now, hosting after the trade and career adapters | F.5 |

That is 28 decisions: 1 for R0, 7 for R1, 5 for R2, 6 for R3, 2 for R4, 1 for R5, 2 for R6, 2 for R7 and 2 for R9. R8, R10, R11 and R12 have none of their own.

Decisions that also shape a later release (the design's Blocks column and its own later uses):

| Release | Decision | What it settles there |
|---|---|---|
| R3 | D12 | The fence and signal-based tips for the Investing gut (H.13) |
| R4 | D2, D15 | The 400 named people and the registry's promotion rule (D.1); inferred persona feedback (D.2) |
| R6 | D4 | Heirs inherit career assets, not standing (I.Kit2 K6) |
| R8 | none | A contractor exit needs a wartime budget cap: a rule in design 8 and 11.7, not a choice |
| R9 | D27 | The sector families run as table work beside the careers (F.1 to F.9) |
| R10 | D2, D26 | Pools hold touched strangers only (A.K5); sports franchises become trade 57 after the sports world; the Underworld gets a Special Careers entry and stays abstract |
| R11 | D14, D26 | Illegal intel careers with real prison and scandal risk (H.12); Journalist and Scientist as built careers |
| R12 | D25 | The gate flips from advisory to failing; the worker (K.10) only if the p95 trigger fires; desktop two-pane stays out (section 16) |

Owner decisions are cheapest early: R0 to R2 need 13 answers (D28, D6, D8, D12, D18, D23, D24, D25, D1, D2, D3, D5, D7) before their specs are cut; R3 and R4 need the eight fog, ambition, digest and people choices (D11, D13, D14, D15, D16, D20, D4, D17) before theirs.
