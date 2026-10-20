# AREA K: engineering, performance and test strategy (digest)

Measured on a scratch copy of v4.0.2 (Node 22, 4 vCPU); CI figures from GitHub run 39420764187; scripts in `scratchpad/k-work/`.

## 1. WHAT EXISTS TODAY

**Size.** src 259k lines (business 63k, special 40k, events 31k), tests 132k, UI 8k: menus are closure trees (`MenuGroup.children(g)`, `MenuAction.run(g)`).

**Imports** (esbuild metafile, runtime): 623 modules, 4,488 edges, **5 cycle components holding 147 modules (24%)**: sizes 85 (business, computer), 30, 19, 7, 6. About 37 cross-directory edges hold the 85-module one together. The v4.0.0 crash was one edge (wave-insider to special/politics) growing a 60-module cycle to 177: a module-level `const UNIT_YEARS = LASTING_YEARS` read undefined (franchise values NaN). Fixed with a leaf `insider-ledger.ts` plus a register seam. The kernel is already a clean leaf (types, rng, core, world, scripts, talents, assetHooks: about 900 inbound edges, none outward). Of 2,081 cross-directory imports, 329 point upward. Ad hoc seams exist (YEARLY_HOOKS, registerFamily). **Hot files** in v4.0.0 (commits touching): ARCHITECTURE.md 16, deeptech-sim 13, tech-waves 12, manage.ts 6.

**Yearly step** (probe life): 0 companies **83 ms/yr** (50 years = 4.1 s); 12 companies **108 ms/yr** (5.4 s, p95 142); 30 companies 134. Business costs about 2.0 ms per company-year, linear. Fixed cost is the world economy (102 countries): 57 ms/yr. Per click: `structuredClone` 24 ms + `JSON.stringify` 25 ms + a 2.1 MB localStorage write. Phones are likely 3 to 5x slower (assumption).

**Saved state** (12 companies, age 80): **2.14 MB raw, 371 KB gzip** (1.65 MB by year 10, then +12 KB/yr). **85% is `flags.worldEconomy`** (1.82 MB: countries 562 KB, `previous` 562 KB = copy of last year, history 456 KB, rivals 239 KB); log 10%; assets 4% (7.3 KB a company). 125k JSON nodes of the 500k cap; 53% of bytes are key names (columnar numbers cut those fields 56%, rounding only 3%). Bounds: SAVE_SCHEMA 2 with one migration, a 500k node cap, 17 normalizers, 13 `*_VERSION`s, about 290 caps. **The IndexedDB + gzip main save (save-backends.ts, v2.5 spec) is built but unwired** (no caller of `setSaveBackend`, no `hydrateSaves`): production writes plain JSON to localStorage. Economy tiering (spec Part C #4) never built; one old-save fixture.

**Bundle**: one chunk, 8,324,567 B (gzip 2.81 MB, brotli 2.18 MB); React 2.7%; **46% of bytes are string literals**. By area: business 1.69 MB, events 1.34, special 0.98, data 0.87.

**Tests**: 389 files, 6,807 tests (6,775 pass, 32 skip). One CI job: typecheck 5 s, **tests 36.0 min** (91% tests, 8% import), build 2 s. File times sum to 3,869 worker-seconds: top 10 files 58%, top 35 85% (simulate 494 s, era-features 401, main-character-life 340, sector-story 278, anachronism 214). **At least 80% (146 files) runs createNewLife or the yearly loop: seeded multi-year sims.** 137 files raise timeouts to 100 to 300 s (contention flakes). CI grew 28 to 36 min (v2.8 to v4.0; 0.19 min per 1,000 test lines); v4.0.0 integration used 5 runs (157 min), 3 red. **Affected-test selection is useless**: a median src change reaches 259 of 389 test files (67%), p90 89%, business/economy.ts 82%.

**Determinism**: one mulberry32 stream `g.rng`, 5,383 draw sites, about 80 hash-seeded uses; no Math.random or Date. Digest prototype: reruns identical, but **one extra `rand()` at year 10 changes every digest, the world economy included** (company feedback). 119 pinned `seed: N`; v4.0.0 broke probe-life seed 8 and the sampled anachronism lint.

**Tooling**: fuzz-kit (deep-frozen state, menu walk, invariants; opt-in), probe-life, voice-report (64,530 strings), career-money-scan (careers only). **Missing**: world money ledger (`addMoney` just mutates `g.character.money`), dependency test, golden digests, property tests, balance harness, size budgets, nightly job, sharding, content pipeline.

## 2. GAPS
1. No enforced boundary; cross-track edges are a load-order lottery.
2. Tracks collide on hot files.
3. World randomness is welded to the player stream.
4. Monolithic save, 85% world state, no LOD.
5. No world-level conservation check or long-run balance harness.
6. CI 36 min, unsharded; no selective runs.
7. 8 MB single chunk.
8. 64k strings, no pipeline (repetition, era, voice are post-hoc lints).

## 3. DESIGN: THE ENGINEERING FOUNDATION

**D1 Layers and dependency rule** (`test/architecture.test.ts`, about 1 s via esbuild metafile; TypeScript 7 has no JS compiler API). L0 kernel (types, rng and streams, ids, clock, ledger, bus, registry, scripts, talents) imports nothing; L1 data; L2 world (economy, nation state, entity stores); L3 domains (business, special, careers, computer, shops, relationships, crime...), each with a `contract.ts` (types, ports, `register*`); L4 assembly (aging, menus, save, life); L5 UI. Rules: (a) no runtime cycles, by **ratchet**: a baseline lists today's 147 modules, any new cycle fails, the list shrinks to 0; (b) Lk imports below only; (c) domains cross only via contracts; (d) no module-level `const X = importedValue` from above L1 (the real v4 failure); (e) track tests import only their domain (affected tests 67% toward 15%).

**D2 Registry and bus.** `registerModule({id, layer, slices, yearly:[{phase, order, run}], menus:[{path, order, build}], handles, lod, budget})`. aging, special, menus and manage iterate phases sorted by (phase, order, id); a track adds one line to a sorted `modules/index.ts`. A synchronous typed bus (`emit('company.failed', ...)`), handlers writing only their own slice; events land in a bounded `worldLog` that feeds news (E). Per-track docs replace ARCHITECTURE.md appends.

**D3 RNG streams.** `stream(g, 'war', year, entityId)` hashes (world seed, tag), never touching `g.rng`; lint forbids `g.rng` in new world modules. Tracks stop shifting each other's rolls; world history stops depending on click count.

**D4 Ledger.** Kernel `post(from, to, amount, memo)` over accounts (person, company, state, bank, named `mint`/`burn` sinks). `addMoney`, `earnIncome`, `spend` and company-cash helpers become wrappers; tests record postings; yearly invariant `sum(accounts) = previous + mint - burn`.

**D5 Save v3.** Slices declare `{key, version, normalize, caps, chunk}`. Chunks: `core` (player side, **320 KB: clone 3.8 ms vs 24, stringify 2.3 vs 25: -88% per click**), `world` (1.8 MB, written yearly, columnar, `previous` cut to the readers' focus set), `entities/<kind>/<shard>` dirty-tracked, `log`. Wire the existing IndexedDB backend and `gz2` codec. Per-slice `migrate(from, json)`, a chunk manifest, one fixture per release run 5 years in CI. A 50-year probe asserts budgets (core 400 KB, world 1 MB, 600 KB gzip).

**D6 Level of detail.** T0 full (player-linked; at most 150; 5 to 10 KB, 2 ms/yr each); T1 light (named, at most 3,000, 300 B); T2 statistical pools. Entity = `base(worldSeed, id)` + stored delta; demotion folds money back into the pool through the ledger. Measured: 100k light entities cost 3 to 9 ms/yr (1M: 70), but 100k at 150 B is 15 MB: **storage, not CPU, is the limit**.

**D7 Web Worker: later.** Closure menus pin the engine to the main thread: engine-in-worker needs a menu RPC (L); a year-step worker doubles engine memory (M). Trigger: p95 year step above 400 ms on a mid-range phone, after D5 and D6.

**D8 Test strategy.** (a) PR fast tier: architecture, conservation scan, affected tests, 3 seeds x 20 years. (b) Full suite sharded 4 x 2 workers from a timing file; split the five files over 200 s by seed range: **wall 9 to 10 min vs 36, same billed minutes**. (c) Nightly deep: `FUZZ=1` 40 seeds x 160 years, 200-seed balance probes (net-worth percentiles; ceiling probe: scale each input x100, assert a real-world cap), anachronism 400 lives, all fixtures migrated, metrics diffed nightly. (d) Golden digests per slice (canonical-JSON FNV; the prototype names the slice that moved); trustworthy only with D3. (e) Property tests: conservation, idempotence, bounds, purity. (f) `findSeed(pred)` replaces pinned seeds. (g) Persist vitest transforms (cold start 12 s, 83% transform).

**D9 Build and release.** Stage 1: dynamic-import data packs (era packs 0.66 MB, history 0.28, locales 0.22, brands 0.38) behind `await ensurePacks(g)` in the store; tests preload. Stage 2: lazy domains (special careers 0.98, deep tech/silicon/lab 0.41) on first open. Stages 1 and 2 cut 2.9 MB (-35%, initial about 5.5 MB); lazy shops, computer, activities and the rest of business reach 3.5 to 4.5 MB. Data chunks stay cached across releases; a bundle-budget test replaces `chunkSizeWarningLimit: 8000`. Release: per-track flags (dark until probes pass), preview deploys, CI on every track branch.

**D10 Content pipeline.** `content/` entries carry `{id, era range, country gate, tags, voice class, cooldown}`. The build validates voice (scripts/voice lexer), checks era gates statically over the whole corpus (replacing the 214 s sampled lint) and emits typed TS. A bounded per-life `seen` ring plus cooldowns gives non-repeating dialogue (E).

## 4. WORK BREAKDOWN (tests 1.0 to 1.5x source)
| Id | Item | Size | Needs |
|---|---|---|---|
| K1 | Architecture test, ratchet baseline | S | first |
| K2 | Cut the 5 cycles (about 40 cross-directory edges, then 90 inner modules) | L | K1 |
| K3 | Kernel: streams, ids, registry, bus; convert aging, special, menus, manage | L | A |
| K4 | Ledger, conservation scanners, property helpers | L | A, all |
| K5 | Save v3: chunks, IDB wiring, migrations, fixtures, budgets | XL | A, K3 |
| K6 | LOD framework, budget meter | M | A, B, D |
| K7 | Test platform (shards, goldens, findSeed, nightly) + balance harness | M+M | K3 |
| K8 | Bundle split, stages 1 and 2 | M+M | K3 |
| K9 | Content pipeline, repetition index | L | E, H |
| K10 | Worker (conditional) | L | K5, K6 |
| K11 | Preview deploys, flags | S | none |

About 22k source lines (all but K10) + 25k tests + 5k docs. Wave 0: K1, K3, K5 skeleton, K7 sharding, K11; tracks then run while K2, K4, K6, K8, K9 land under the ratchets.

**Cost model** from v4.0.0: 72,081 lines added (src 24,175, tests 36,464, docs 11,352), 143 commits, 12.5 to 14 h wall, 9 tracks, 3 of 5 CI runs red. Derived: about 100 agent-hours, **4.1 agent-hours per 1,000 source lines all-in**, integration tax about 15% of wall time, CI +0.19 min per 1,000 test lines.

| Source lines | Total lines | Agent-hours | Wall, 9 tracks +15% | Full CI unsharded / x4 |
|---|---|---|---|---|
| Foundation 22k | 52k | 90 | 1 to 2 days, 4 agents | 39 / 11 min |
| Programme 40k | 118k | 165 | 21 h | 47 / 13 min |
| 60k | 177k | 245 | 31 h | 53 / 15 min |
| 90k | 265k | 370 | 47 h | 62 / 17 min |

Billed CI per release train: about 41 runs x 36 min = 1,480 min (5 integration + 9 tracks x 4 pushes), plus nightly 1,350 min a month. Nine agents on 4 CPUs contend: verify in sharded CI.

## 5. RISKS
- Cycle cutting changes load order: keep enter-through-each-hub tests, nightly fresh-import sweep.
- Save v3: dual-read for one release; fixtures.
- LOD: promote/demote needs a conservation property test.
- Async data packs break sync assumptions (tests, Time Machine).
- A private repo exceeds free CI minutes.

## 6. OPEN QUESTIONS
1. Public repo (free CI) and 4 shards? Default: yes.
2. One global seed rebaseline to land named RNG streams? Default: yes, Wave 0.
3. Lowest device to support? Default: 2022 mid-range Android (year step at most 400 ms).
4. Save compatibility horizon? Default: every old save keeps loading.
5. May tracks ship dark behind flags and preview URLs? Default: yes.
