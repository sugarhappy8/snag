# R5 plan, Bundle and pipeline track (track bundle)

> Status: planning pass 1, 2026-10-31. Base: `release/v5.4.0` = `main` at v5.3.0 (1c73b31). Code read in `/home/user/snag` on that commit and every anchor below re-read now; section 6 lists the grep or command behind each. Nothing under `src/`, `test/`, `scripts/` or `.github/` was edited, nothing was added to git. Scratch builds and probes are in the session scratchpad. Prefix of the tasks: B (R5-B1 to R5-B11). House rules bind every task: no U+2014 or U+2013, contractions in player text, saves untouched, no `g.rng` draw, fixtures re-recorded only in a named flip task (this track has none and says so).

## 1. Track summary

**Items.** K.8 (bundle split) and K.9 (build-time text validation). Roadmap size 2,000 + 2,000 = 4,000 source lines. This plan: 4,260 source (3,440 without the conditional B7), about 6,200 test, about 700 docs, 11 tasks. B7 is the only task with an Opus fallback mark.

**What the measurement says (own build of v5.3.0, section 6 rows 4 to 7).** The initial bundle is 3,023,099 gzip bytes (JS 3,005,319 in 8 files, CSS 17,780), which is +54,001 over the v5.2.0 baseline 2,969,098; raw it is 8,844,450 bytes of JS. The roadmap's map holds today: era packs 665 KB raw, history 267, locales 219, brands 383. I took each group out of the entry graph with an esbuild stub plugin and gzipped what is left (level 9, ratio to the vite build 0.9675, so the vite figure is the esbuild delta times 0.9675):

| Cut (all static edges into the group go async) | gzip bytes out of the initial bundle | Initial after | vs 3,023,099 |
|---|---|---|---|
| Era packs, 4 (one importer: `events/era-life.ts`) | 213,000 | | |
| Locales, 4 region files (one importer: `data/locales.ts`) | 64,000 | | |
| Brands with the stock rows and market rows they own (one importer: `data/brands.ts`) | 159,800 | | |
| History headline tables, 6 files (one importer: `history/events.ts`) | 34,200 | | |
| History market tables, 4 files (one importer: `history/markets.ts`) | 21,200 | | |
| **Stage 1, all five, measured together** | **493,100** | **2,530,000** | **-16.3%** |
| Stage 1 less 8,000 for gate, stubs and chunk wrappers (planned) | | **2,538,000** | **-16.0%** (-18% raw, 7.26 MB) |
| Stage 1 + the 10 special careers (B7) | 833,600 | 2,189,500; planned 2,203,000 | -27.1% |
| + deep tech, lab, silicon | 926,400 | 2,096,700; planned 2,117,000 | -30.0% (6.04 MB raw) |
| + luxury shops + computer (25 importers between them) | 1,092,900 | 1,930,200; planned 1,955,000 | -35.3% (5.58 MB raw; not planned) |

**Is "35% smaller" reachable? Not in R5 as the roadmap staged it.** Stages 1 and 2 as the roadmap names them (data packs, careers, deep tech, silicon and lab) reach -30% in gzip bytes and -32% raw (6.04 MB); the "5.5 MB raw" target needs the luxury shops and the computer domain too (5.58 MB), which have 5 and 20 outside importers and are not in this track's hot files. The honest targets, all in gzip bytes: **certain (B1 to B6): initial at most 2,560,000 (-15.3%); with B7 (careers lazy): at most 2,230,000 (-26.2%); with the deep-tech cut: at most 2,140,000 (-29.2%)**. These are ceilings with about 1% margin over the plan above. The 35% line is not claimed. Raw MB is also reported (8.84 to 7.26 to 6.30 to 6.04) because the roadmap used it, but the gate is gzip. A life does not download every pack: a life born in 1990 loads two of the four era packs (about 110,000 gzip bytes never leave the server).

**What the player sees.** A first download 16% smaller (27% with B7), and nothing else in the normal case: the packs start loading at idle right after the first paint, and a player who taps Continue or Begin before they land sees a small loading card ("Loading the 1980s.") with Try again and Reload if it fails. No popup, no log line, no saved field.

**Reads from earlier releases, by exact name.** R1: `lazyView`, `LazyFailure`, `reloadAfterSave` (`src/ui/lazy/lazyView.tsx`), `scripts/bundle-budget.mjs` (`initialAssets`, `checkBudget`), `test/lazy-kit.ts` (`closure`, `dynamicImports`). R2: the layer ratchet (`test/layer-kit.ts` `layerOf`, `UPDATE_LAYER_BASELINE`), `registerModules`, `yearlyEntries`, `collectMenu` (B7 only), `docs/KERNEL.md` section 9. R3: `setInfoOverride` (unchanged), `findSeed` (`test/seed-kit.ts:108`). R4: `readRecord` of `save-store.ts` (cheap "is there a save" check), the baseline 2,969,098 and X48 (`lazyView` as the relief ladder). Nothing from `Edge`, `personKey` or the registry shards.

**State and bundle it adds.** State: no saved field, schema stays 3, no node added (packs live in memory only). Bundle: the gate, needs and loaders add about 8,000 gzip bytes to the entry; B7 adds about 14,000. Text: this track adds no log line and no popup family; the only player text is the loading card (UI chrome, two strings under 120 characters, two labels of two words), written under the voice gate of B8. text-repeat (42 of 42), quiet-acceptance (7.32% of 8%) and text-kit (4.7% of 5%) are not touched: nothing here calls `notice()`, `pick` or a log writer.

**K.9 in one paragraph.** The voice tooling already lexes 227,570 literals in 1.3 seconds and extracts 9,240 flagged units in 2.2 seconds, with the house caps in `LIMITS` (log 90, scene 140, outcome 120, tooltip 120, digest 110). Today it is a warning-only report in CI. B8 turns the caps into a ratchet (1,709 units are over cap in 157 files; no file may get worse, a new file must be clean). B9 adds a static era gate: the same `ERA_RULES` of `events/era.ts` run over every flavor line, headline row, digest line and literal, at the first year the text can appear. I measured it: 5,904 literals trip a rule at 1900, of which 1,815 carry an `@` tag and 4,089 do not (349 files); inside the four era-pack file sets only 70 of 6,474 untagged strings trip at the pack's first year. A purely static pass cannot see a guard written in code (`when`, an `if (g.year >= ...)`), so the gate is a ratchet with hard failure only where the span is known (section 5, Q5). It replaces the sampling as the coverage mechanism and lets the 157-second lived test shrink; it does not remove the lived test. B10 shares one corpus walk between the three gates and adds the CLI and CI step. K.9 does not emit TypeScript (roadmap: "K.9 is only build-time validation").

**Acceptance for this track (all in gzip bytes unless said).**
- Initial bundle after B1 to B6: at most 2,560,000 (from 3,023,099); with B7 at most 2,230,000; every pack chunk under its ceiling; `chunkSizeWarningLimit: 8000` gone from `vite.config.ts`.
- The golden digests, `kernel-parity.json`, `r2-parity.json`, `social-parity-*.json` and `life-pins.json` are byte-identical to v5.3.0; a lazily loaded life and a preloaded life end on the same digest in every slice.
- No module reads pack data while it loads (B1 sweep, green with no pack installed); the layers, domains, architecture and lazy-zone ratchets did not grow.
- A pack that fails to load never loses a save, never leaves a dead button, and offers Try again and Reload; the Time Machine says what failed.
- Every text gate in `docs/CI.md` that is a ratchet (caps, era) fails on a planted over-cap line and a planted anachronism, passes on the real tree in under 10 seconds, and the lived anachronism test shrinks by about 100 seconds.
- Old saves (`save-v4.0.2`, `save-v5.2.0-social`, `save-v5.3.0-heavy`, `save-v5.3.0-stamped`) resume and play 5 years with no pack preloaded.

## 2. Contracts

**Frozen at the merge of R5-B1 (an interface that moves after this makes the Paper, composer and R6 tracks rework).**

```ts
// src/game/kernel/packs.ts (L0, imports nothing; one line in docs/KERNEL.md section 9)
export type PackId = 'era.1900' | 'era.1946' | 'era.1980' | 'era.2000' | 'locales' | 'brands' | 'history.headlines' | 'history.markets' // append-only; B7 appends `career.<name>`
export const PACK_IDS: readonly PackId[]                      // the order every list is sorted in
export class PackNotLoaded extends Error { readonly pack: PackId }
export type PackState = 'idle' | 'loading' | 'ready' | 'failed'
export function definePack(id: PackId, load: () => Promise<unknown>): void   // once per id; the same loader again is a no-op, another loader throws
export function installPack(id: PackId, value: unknown): void                // idempotent; fires onPackInstalled once per id
export function packReady(id: PackId): boolean
export function readPack<T>(id: PackId): T                    // O(1), never loads, throws PackNotLoaded
export function loadPack(id: PackId): Promise<boolean>        // joins an in-flight load; never rejects; false = failed (state 'failed', attempts + 1)
export function ensurePacks(ids: readonly PackId[]): Promise<{ ok: boolean; failed: PackId[] }>   // never rejects
export function packStatus(): Readonly<Record<PackId, { state: PackState; attempts: number }>>    // attempts clamped 0..99
export function onPackInstalled(fn: (id: PackId) => void): () => void   // at most 8 listeners; the ninth throws
export function resetPacksForTest(): void
// src/game/data/pack-needs.ts (L1, pure, no pack data read)
export const PACK_LOOKAHEAD_YEARS = 1    // must be loaded before g.year + this is played (a loading hint, not a read of game data)
export const PACK_PREFETCH_YEARS = 5     // warmed at idle
export const BASE_PACKS: readonly PackId[]            // locales, brands, history.headlines, history.markets
export function erasForYears(from: number, to: number): PackId[]       // era.* ids whose span meets [from, to]; NaN or 1e300 clamp to 1900..2200
export function packsFor(g: { year: number }, horizon?: number): PackId[]   // BASE_PACKS + erasForYears(g.year, g.year + horizon), in PACK_IDS order; same input, same output; never throws
export function packsForNewLife(year: number): PackId[]
// src/game/data/pack-loaders.ts (L1; dynamic imports only, so no static edge into a pack)
export const PACK_LOADERS: Partial<Record<PackId, () => Promise<unknown>>>   // a row per pack, added by the pack's task
export function registerPackLoaders(): void   // idempotent definePack over the table
export function preloadAllPacks(): Promise<void>   // register, load every pack, resolve; throws an Error naming the failed ids (scripts want it loud)
```

**The source shim convention (frozen).** Each pack has a data-only entry module and a consumer that reads it with `readPack`. The consumer imports a one-line shim for its side effects: production body `export {}`; in vitest only, `test.alias` in `vite.config.ts` maps `/-source$/` to `test/pack-eager/<name>.ts`, which statically imports the entry and calls `installPack`. This keeps the module graph a test sees equal to today's (so a `vi.mock` in a test file still lands, which a global setup preload would break: measured, section 6 row 27). Names: `events/era-source.ts`, `data/locales-source.ts`, `data/brands-source.ts`, `history/headlines-source.ts`, `history/markets-source.ts`; entries: `events/era-pack-{1900,1946,1980,2000}.ts` (exist), `data/locales-pack.ts` (`LOCALE_TABLE`), `data/brands-pack.ts` (`BRAND_ROWS`), `history/headlines-pack.ts` (`HEADLINE_ROWS`), `history/markets-pack.ts` (`MARKET_TABLES`). Pack chunk names come from the entry file name, so the budget script finds them by `-pack`.

**Adding a pack (for the Paper and composer tracks).** Four edits: one `PackId`, one entry module, one row in `PACK_LOADERS` and `packsFor` (or `BASE_PACKS`), one shim plus its `test/pack-eager` file. Rule for new files, enforced by B1's sweep: no module reads pack data while it loads; read inside a function. A track may add a pack only after B1 merges; until then it adds none.

**Stable names kept (no test or caller edit).** `ERA_PACKS` and `ERA_LIFE_EVENTS` (era-life.ts) and `EVENT_LIBRARY` (events.ts) stay exported arrays with the same identity, filled in canonical pack order by `onPackInstalled`. In vitest the shims fill them before any test body runs, so the 10 test files that read `EVENT_LIBRARY` (38 uses) and the 5 that read `ERA_PACKS` do not change. Do not read them at module load in new code. `localeOf`, `locale`, `hasLocaleData`, `allBrands`, `brandById`, `brandsFor`, `allHeadlines`, `headlinesFor` keep their signatures.

**Store (frozen at the merge of R5-B2).** `AppState.packWait: PackWait | null`, `interface PackWait { reason: 'boot' | 'resume' | 'new' | 'continue' | 'age' | 'travel'; ids: readonly PackId[]; failed: boolean; attempts: number }`; `whenPacksReady(ids, then, reason): void` (runs `then` now when every pack is ready, else sets `packWait`, awaits `ensurePacks` and runs it); `retryPackWait(): void`; `warmPacks(g, horizon?): void` (fire and forget, idle). `resumeSavedGame(): boolean`, `startNewLife(opts): void`, `continueAs(id): void`, `ageUpAction(): void` and `travelBack(age): Promise<boolean>` keep their signatures.

**Budget file (B6).** `scripts/bundle-baseline.json` gains optional `initialMaxGzBytes` and `packMaxGzBytes` (`{ "<chunk prefix>": bytes }`), each read by its own checker (a whole number, bounded to 1..50,000,000; a bad value fails with the file name). Existing three fields stay.

**Voice (B8, B9, B10).** `scripts/voice/gate.mjs`: `GATE_FLAGS` (`over-cap`, `long`, `no-contraction`, `em-dash`, `chatbot`, `disclaimer`, `label-words`), `gateCounts(corpus)`, `compareGate`, `shrinkGate`, `rebaseGate`; baseline `test/voice-gate-baseline.json` `{ v: 1, files: { "<path>": { "<flag>": n } } }`. `scripts/voice/era-gate.mjs`: `eraFindings(input)` with the rule table, the tag-window function and the span function injected (the test passes `anachronismsIn` and a probe of `gateHolds`); baseline `test/era-gate-baseline.json` `{ v: 1, files: { "<path>": { "<rule id>": n } } }`. `scripts/voice/corpus.mjs` gains `buildCorpusOnce(root)`. Modes of both baselines mirror `test/layers.test.ts`: `UPDATE_VOICE_BASELINE=1` only shrinks, `=rebase` accepts growth once and prints it. CLI `scripts/voice-gate.mjs`, script `npm run voice:gate`.

**Fixtures.** None re-recorded by this track. `test/fixtures/golden-digests.json`, `kernel-parity.json`, `r2-parity.json`, `social-parity-*.json` and `life-pins.json` do not move: with the shims, the eager library and pool order equal today's (B3 proves it by an equality test against a lazy-built library). Files that move are listed per task and again in section 5.

## 3. Tasks

Waves: A = B1. B = B2, B8, B9 (independent). C = B3, B4, B5. D = B6, B10. E = B7. F = B11. Merge order (set by the cross-check, `00-crosscheck.md` section 1.5): B8, B9, B10 early and before any task that writes player text (new text must be born under the gate); B1, B2, **B3 first of the packs** (it frees 213,000 gzip bytes; the allowance has 5,999 bytes of room today, and no Paper, composer or other eager-source task merges before B3), B4, B5, B6, B7, B11 last (after the flip task N11). Process: one worktree per task, `npx vitest run --maxWorkers=1 <named files>`, explicit pathspecs, no fixture edits, no full suite.

| Task | Title | Needs | Source | Test | Hot files |
|---|---|---|---|---|---|
| R5-B1 | Pack gate, needs table, test seam | P1 | 480 | 820 | `kernel/packs.ts`, `vite.config.ts` (test block), `docs/KERNEL.md` |
| R5-B2 | Store seam, loading card, boot prefetch, scripts | B1 | 560 | 780 | `ui/store.ts`, `main.tsx`, `boot.ts`, `HomeScreen.tsx` |
| R5-B3 | Era packs | B1, B2 | 300 | 560 | `events/era-life.ts`, `events.ts` |
| R5-B4 | Locales and brands packs | B1, B2 | 340 | 520 | `data/locales.ts`, `data/brands.ts` |
| R5-B5 | History headline and market packs | B1, B2 | 220 | 380 | `history/events.ts`, `history/markets.ts` |
| R5-B6 | Chunk names, budget script v2, end of the 8000 limit | B3, B4, B5 | 280 | 520 | `vite.config.ts` (build block), `scripts/bundle-budget.mjs` |
| R5-B7 | Careers as lazy domains (conditional, Opus fallback) | B1, B2, B6, Q1 | 820 | 900 | `special.ts`, `menus.ts`, `types.ts` (`MenuGroup.needs`) |
| R5-B8 | Voice cap gate | none | 360 | 560 | `scripts/voice/*`, `test/voice-gate-baseline.json` |
| R5-B9 | Static era gate | P4 | 520 | 640 | `scripts/voice/*`, `test/anachronism.test.ts` |
| R5-B10 | One corpus walk, CLI, CI step | B8, B9 | 260 | 360 | `scripts/voice/corpus.mjs`, `.github/workflows/ci.yml` |
| R5-B11 | Re-capture and release checks (lead) | B3 to B7, N11 | 120 | 160 | `scripts/bundle-baseline.json`, `docs/` |

### R5-B1 The pack gate, the needs table and the test seam
**Goal.** The mechanism, with no pack in it yet; nothing in the game changes. **Needs.** Nothing. **Size.** 480 source, 820 test. **Model.** Sonnet.
**Files.** Create `src/game/kernel/packs.ts` (about 190), `src/game/data/pack-needs.ts` (110), `src/game/data/pack-loaders.ts` (70, empty table), `docs/PACKS.md` (the table of packs, the recipe, the failure rules, the measurements of section 1). Modify `vite.config.ts:22` (add `alias: [{ find: /^.*\/([a-z]+)-source$/, replacement: <abs>/test/pack-eager/$1.ts }]` inside `test`, never in `resolve`, so `vite build` is not aliased), `docs/KERNEL.md:134` section 9 (one line for `kernel/packs.ts`; `test/kernel-acceptance.test.ts` requires it).
**Steps.**
  1. Red: `test/packs-gate.test.ts` (fast): state machine idle, loading, ready, failed; `loadPack` twice in flight is one loader call; a loader that rejects or throws sync gives false and `attempts` 1, a retry that works gives ready and keeps the count; `installPack` twice fires one event; `readPack` before install throws `PackNotLoaded` naming the id and never calls a loader; ninth listener throws; `definePack` with another loader throws; hostile id (`'__proto__'`, 40-char text, a number) is refused by every entry and never creates a key; `resetPacksForTest` clears all.
  2. Red: `test/packs-needs.test.ts` (fast): table for years 1899, 1900, 1945, 1946, 1979, 1980, 1999, 2000, 2026, 2027, 2100, NaN, Infinity, 1e300, -1e300 at horizon 0, 1, 5; at 1945 horizon 1 the list holds `era.1946`; output sorted by `PACK_IDS`, no repeat, same value twice, equal under `deepFreeze`; each era span in the table equals the real `ERA_PACKS` `from`/`to` (read from the four entry modules with a direct import).
  3. Red: `test/pack-zones.test.ts` (fast, built on `test/lazy-kit.ts`): the only file that imports an entry module is `data/pack-loaders.ts`, and only dynamically; every `*-source.ts` body is `export {}`; the static closure of `src/main.tsx` holds no entry module once a pack exists (table-driven, rows added per pack, empty rows skipped with the reason printed). Each rule also runs once on a synthetic tree in `os.tmpdir()`.
  4. Red: `test/pack-load-isolation.test.ts` (fast, about 3 s): esbuild-bundle an entry that imports every `src/game/**` module (splitting on, platform node, a temp dir), run it in a child process with no pack installed and the production shims; exit 0 means no module reads pack data while it loads; a failure prints the first `PackNotLoaded` stack. Rows added by B3 to B5 turn it from a no-op into the real oracle; it also runs once with a synthetic module that reads a pack at load to prove it can fail.
  5. Implement.
  6. Docs.
**Tests that move.** `test/kernel-acceptance.test.ts` needs the KERNEL.md line (no edit to the test). `test/layers.test.ts`, `layers-domains.test.ts`, `architecture.test.ts` must stay green with no baseline change (the new files import nothing upward; dynamic imports are not edges per `test/arch-kit.ts` header). No fixture.
**Ceilings.** No growth term: eight ids, eight listeners, attempts clamped; no `ceiling-list.json` row (reason written in `docs/PACKS.md`).
**Purity.** `packsFor` and `erasForYears` pure under `deepFreeze`, no `g.rng`. The foresight scan (`test/foresight-scan.test.ts`) watches market readers only; `PACK_LOOKAHEAD_YEARS` is named so a reader sees it is a loading hint.

### R5-B2 The store seam: ensurePacks, the loading card, boot prefetch, scripts
**Goal.** Every place a life can start or change year waits for its packs, with a synchronous fast path so nothing changes when they are ready. **Needs.** B1. **Size.** 560 source, 780 test. **Model.** Sonnet.
**Files.** Modify `src/ui/store.ts`: `AppState` (`:82`) and the initial `state` (`:99`) gain `packWait`; `resumeSavedGame` (`:208`), `startNewLife` (`:222`), `continueAs` (`:231`), `travelBack` (`:274`, after `loadSnapshot` returns and before `arriveInPast`; a failure sets `timeTravel.error` "The Time Machine couldn't load the {decade}. Check your connection and try again."), `ageUpAction` (`:494`, before `expectSnapshot`) each run `whenPacksReady(packsFor(...), ..., reason)`; add `whenPacksReady`, `retryPackWait`, `warmPacks`, and a `warmPacks(state.game)` call at the end of `commit` (`:381`), which does nothing unless `g.year` differs from the last year warmed (commit runs on every tap). Create `src/ui/components/PackGate.tsx` (about 110: busy card with `role="status"`, failure card with `role="alert"`, `LazyFailure` and `reloadAfterSave` reused, Try again first, Reload from the second failure) mounted in `src/App.tsx` next to `SaveNotices`; CSS in `src/ui/styles/global.css` (about 30). Modify `src/main.tsx:14` and `src/boot.ts:19`: `hydrate` runs in parallel with loading `BASE_PACKS` when `readRecord()` shows a saved game (new players render at once and the idle warm starts after render); export a cheap `hasSaveRecord()` from `src/game/save.ts` (uses `readRecord` of `save-store.ts`). Modify `src/ui/screens/HomeScreen.tsx:58-61` (the `loadGame()` in the render path runs only when `BASE_PACKS` are ready, otherwise the Continue row shows its loading state) and `NewLifeScreen.tsx` (the year picker calls `warmPacks` for the picked year; no change to `begin` at `:619`, `:807`). Modify the node entries so they call `await preloadAllPacks()` first: `test/golden-cli.ts`, `test/fuzz-kit.ts` entry used by `scripts/fuzz-engine.ts`, `test/nightly-probes.ts` (`probeCli`), `scripts/save-size.ts`, `scripts/text-probe.ts`, `scripts/r3-playthrough.ts`, `scripts/r1-screenshot-state.ts`, `scripts/save-fixtures.ts` (esbuild builds them for node with no alias; the nightly workflow bundles two of them with the CLI at `nightly.yml:52,98`, so a source edit is the only way). Add `--drop-pack <name>` to `scripts/e2e-play.mjs` (Playwright `page.route` aborts a pack chunk) for the release walk.
**Steps.**
  1. Red: `test/packs-store.test.ts` with fake packs (`definePack` of test ids is not allowed by the union, so the test registers real ids with fake loaders after `resetPacksForTest`): ready means `startNewLife`, `resumeSavedGame`, `ageUpAction` run synchronously and `packWait` stays null (this is what keeps the 30 test and kit files that drive the store unchanged); not ready sets `packWait` with the missing ids, leaves `state.game` and the save untouched, queues no notice, and runs the action once when the load finishes; a failing load sets `failed` and `attempts`, `retryPackWait` retries, a second tap while waiting is ignored; `ageUpAction` at 1945 with `era.1946` missing waits, at 1944 with the lookahead already warmed does not; `travelBack` to a snapshot of an unloaded era loads first, and on failure leaves the game, the stops and the save as they were.
  2. Red: `test/packs-boot.test.ts` (extends the `bootApp` fake env of `test/save-boot.test.ts`): base packs start with hydrate only when a save record exists; render never waits on a failed pack; the idle warm runs after render and never throws.
  3. Red: `test/pack-gate-ui.test.ts`: `renderToStaticMarkup` of the busy and failed cards; both strings at most 120 characters, labels at most 5 words, no dash, contractions.
  4. Red: `test/scripts-preload.test.ts` (fast): every `scripts/*.ts` and `test/golden-cli.ts` that imports from `src/game/` mentions `preloadAllPacks(`.
  5. Red: loading a saved game with no pack installed (`save-v4.0.2.json.gz`, `save-v5.2.0-social.json.gz`, `save-v5.3.0-heavy.json.gz` and `save-v5.3.0-stamped.json.gz` of `test/fixtures`, through the real gate in a child process like B1 step 4): `loadGame()` and `summarizeLife` must not throw. If one does (`save.ts:94` `refreshRoyalCareers` reaches `data/locales`, `data/brands` and `history/markets` by static import; whether it reads them is not known), the fix is to make that reader pack-free or to hold `loadGame()` behind `BASE_PACKS`, which this task already does for the UI.
  6. Implement, then docs (`docs/PACKS.md` failure table, `docs/CI.md` one paragraph).
**Failure rules.** Offline or a stale tab after a deploy (`wrangler.jsonc` answers a missing hashed file with `index.html`, so the import rejects): the game keeps what is already loaded; a new era shows the card at the birthday; nothing is retried behind the player's back; Reload flushes the save first.
**Tests that move.** None edited; the seam is synchronous when ready.
**Fixtures.** None.
**Old saves.** A save holds no pack data, so any old save resumes; the packs it needs come from `g.year`.

### R5-B3 Pack: the four era packs
**Goal.** -213,000 gzip bytes. **Needs.** B1, B2. **Size.** 300 source, 560 test. **Model.** Sonnet.
**Files.** Create `src/game/events/era-source.ts` (empty body), `test/pack-eager/era.ts`. Modify `src/game/events/era-life.ts`: remove the four static imports (`:15-18`); `ERA_PACKS` (`:46`) and `ERA_LIFE_EVENTS` (`:49`) become arrays kept by an `onPackInstalled` hook in canonical order (1900, 1946, 1980, 2000), `eraFlavorPools` (`:52`) unchanged in behaviour; `src/game/events.ts`: `EVENT_LIBRARY` (`:40`) keeps its identity, base events first, then the loaded packs' events in canonical order (wrapped once per pack by `withVariants`, `variants.ts:118`, a pure map), `EVENTS_BY_ID` (`:57`) and `getEventDef` (`:59`) updated on install; `src/game/data/pack-loaders.ts` four rows; `pack-needs.ts` era table. `events/flavor.ts:581` unchanged. `test/layers-baseline.json`: the name `ERA_PACKS` leaves the eager list of `era-life.ts` (shrink only, `UPDATE_LAYER_BASELINE=1`).
**Steps.**
  1. Red: `test/pack-era-parity.test.ts`. (a) With all four installed by the shim, `EVENT_LIBRARY.map(id)` equals a list built the pre-R5 way from the entry modules (base list, then pack events in order). (b) Install in reverse order with the real gate in a fresh module graph (`vi.resetModules`): same ids, same order, same `EVENTS_BY_ID` keys. (c) Pool lists from `eraFlavorPools` for the same `g` are equal with only the needed pack loaded and with all four. (d) A lived parity run through the real chunk boundary: esbuild with splitting, child process, `findSeed(pred)` for a 1990 birth, 15 years with `ensurePacks(packsFor(g))` before each `ageUp`, digest equal to the same life with all packs preloaded (digest by `test/golden-kit.ts` slices, so a failure names the slice). The only seeds are `findSeed` calls.
  2. Red: the sweep rows of B1 for the four entries, `pack-zones` rows.
  3. Implement, update `docs/PACKS.md` row.
  4. Check `npx vitest run --maxWorkers=1 test/pack-era-parity.test.ts test/events.test.ts test/era-early.test.ts test/era-late-events.test.ts test/era-late-packs.test.ts test/era-early-lives.test.ts test/flavor-memory.test.ts test/layers.test.ts test/layers-domains.test.ts test/golden-digest.test.ts test/kernel-parity.test.ts`.
**Fixtures.** `golden-digests.json` and `kernel-parity.json` must not move; if one moves, the task is wrong.
**Old saves.** An era popup in a saved queue has its id in `getEventDef` after the pack for `g.year` is loaded (`packsFor` loads it before the save is shown).
**Gate protection.** No text added or changed, so text-repeat, quiet-acceptance and text-kit see the same lines in the same order; the equality test (a) is what proves it.

### R5-B4 Packs: locales and brands
**Goal.** -64,000 and -159,800 gzip bytes. **Needs.** B1, B2. **Size.** 340 source, 520 test. **Model.** Sonnet.
**Files.** Create `src/game/data/locales-pack.ts` (the merged table, `LOCALE_TABLE`), `locales-source.ts`, `brands-pack.ts` (`BRAND_ROWS`: luxury, rivals, consumer, stocks), `brands-source.ts`, `test/pack-eager/locales.ts`, `brands.ts`. Modify `src/game/data/locales.ts`: `ALL` (`:86`, a load-time spread of the four region files) becomes a read through `readPack('locales')` memoized by identity inside `localeOf` (`:134`), `locale` (`:139`), `hasLocaleData` (`:144`); the 38 importing modules do not change. `src/game/data/brands.ts`: `BY_ID` (`:67`) and `ALL` (`:73`), built at load by a loop over four arrays, become an index built on first read after install; `allBrands` (`:76`), `brandById` (`:80`), `brandName` (`:85`), `brandsFor` (`:106`), `brandsInCategory` (`:113`) keep their signatures (18 importers unchanged). The brand pack also carries `invest/stocks-*.ts`, `business/market-data-*.ts` and `market-rows.ts` (13 modules, 199,353 raw bytes that only the brand rows reach); `data/brands-rivals.ts` and `brands-stocks.ts` keep their own eager reads inside the pack (stay in the layer baseline). `pack-needs.ts` and `pack-loaders.ts` rows.
**Steps.**
  1. Red: the B1 sweep rows; `test/pack-data-parity.test.ts`: `localeOf` for every country id of `world.ts` and `allBrands()` ids and order equal the entry modules' direct values; `brandsFor` results for 20 `(year, country)` pairs equal under shim and under a lazily installed pack; reading before install throws `PackNotLoaded` for both.
  2. Red: the neutral profile path (`neutralProfile`, a country with no data) is unchanged and does not need the pack for the neutral case beyond `getCountry`.
  3. Implement.
  4. Check the B3 command plus `test/consumer-brands.test.ts test/luxury-brands.test.ts test/localize-names.test.ts`.
**Decision recorded.** One locale pack, not four regional ones: a life reads other countries' locales (`hasLocaleData`, vacations, emigration), and a region split would add a country-change hook for about 50,000 gzip bytes a life; see Q3.
**Fixtures.** None.

### R5-B5 Packs: history headline tables and market tables
**Goal.** -34,200 and -21,200 gzip bytes. **Needs.** B1, B2. (The first draft also waited for the Paper track's first merge of `history/events.ts`. The Paper plan edits no file of `history/`, so that edge is gone; cross-check C5.) This task edits only the import lines and the index of `history/events.ts`. **Size.** 220 source, 380 test. **Model.** Sonnet.
**Files.** Create `history/headlines-pack.ts` (`HEADLINE_ROWS`, the five merged tables), `headlines-source.ts`, `markets-pack.ts` (`MARKET_TABLES`: the four `markets-*.ts` objects), `markets-source.ts`, `test/pack-eager/headlines.ts`, `markets.ts`. Modify `src/game/history/events.ts`: the six imports (`:18-23`) leave, `BY_YEAR` (`:85`, an immediately invoked build at load) becomes a lazy index over `readPack('history.headlines')`; `allHeadlines` (`:98`) and every export keep their signatures. `src/game/history/markets.ts`: imports at `:18-20` become reads through `readPack('history.markets')` inside the functions that use them (call-time already: `:193`, `:231`, `:281`, `:473`, `:499`, `:628`, `:650`).
**Steps.**
  1. Red: sweep rows; headline parity (`allHeadlines(y)` for every year 1900 to 2026 equal under shim and lazy install, byte for byte); market parity (`marketOf`-driven reads for 30 `(country, year)` pairs).
  2. Implement.
  3. Check `test/history.test.ts test/economy*.test.ts` named by the builder from `grep -l "history/markets\|history/events" test/*.ts` (20 files read history events and tables). **If the lead decides the markets pack is not worth 21 KB, drop its half (Q8).**
**Fixtures.** None.

### R5-B6 Build and budget: chunk names, the budget script v2, the end of `chunkSizeWarningLimit: 8000`
**Goal.** The size is measured in gzip bytes by the repo, not by a Vite warning. **Needs.** B3, B4, B5 (all stage 1 packs, so the absolute ceiling below holds on the tree B6 is merged into; cross-check C6). **Size.** 280 source, 520 test. **Model.** Sonnet.
**Files.** Modify `vite.config.ts:12`: delete `chunkSizeWarningLimit: 8000` and its comment (`:9-11`), set `build.chunkSizeWarningLimit` to the entry's raw size after stage 1 plus 10% (about 6,300 KB; the test below reads the number); no `manualChunks`. `scripts/bundle-budget.mjs`: `readBaseline` (`:115`) accepts the two optional fields, a new section "Packs" lists lazy chunks whose name contains `-pack` with a subtotal, `checkBudget` (`:74`) gains the absolute ceiling `initialMaxGzBytes` and the per-pack ceiling `packMaxGzBytes`, and `--update` writes the ceilings as 1.25 times the measured pack size and `initialMaxGzBytes` as the measured initial plus the allowance; update `scripts/bundle-budget.d.mts`. `test/bundle-budget.test.ts` (398 lines): cases for the new fields on the fake dist, a missing ceiling file still works, a pack over its ceiling fails with its name, a bad value fails with the file name. New `test/build-config.test.ts` (fast): `vite.config.ts` has no `8000`, its limit is at most `initialMaxRawKb` documented in `docs/PACKS.md`, and `test.alias` holds the shim rule but `resolve.alias` does not. `docs/CI.md`: the budget section.
**Steps.**
  1. Red tests.
  2. Implement.
  3. Real build to a scratch dir (`npx vite build --outDir <scratch> --emptyOutDir`) and `node scripts/bundle-budget.mjs --dist <scratch>`: the report must show the packs as lazy and the initial total at or under the B3 plan.
**Hash stability (claim to measure, not assume).** A Rollup-family chunk's hash includes its dependencies' hashes, and an era pack imports `events/helpers` from the entry chunk, so "data chunks stay cached across releases" (K digest D9) holds only for packs with no import into the entry: `locales-pack`, `headlines-pack`, `markets-pack`, probably the brand rows. B11 builds twice with a one-line change in an unrelated file and records which pack file names stayed equal; the docs claim only what it shows.

### R5-B7 Careers as lazy domains (conditional, Opus fallback)
**Goal.** -340,700 gzip bytes (the 10 special careers; the influencer career is `special/social`, which stays in the entry with fame and the kit), plus a contract for R6's new careers. **Needs.** B1, B2, B6, and the decision in Q1 (default: build it in R5, last, merged before R6's Kit v2 stacks). **Size.** 820 source, 900 test. **Model.** Sonnet with an Opus fallback (heavy: menus, registry, UI and 10 career modules).
**Why a task of its own.** The cut is clean (section 6 row 8: each career subtree has 1 to 6 outside importers, `special.ts` the main one), but a career is code that registers a yearly hook and menu rows, not data.
**Design.** `PackId` gains `career.actor`, `career.astronaut`, `career.author`, `career.gamedev`, `career.military`, `career.model`, `career.music`, `career.politics`, `career.sports`, `career.hustler`; the sports pack holds `athlete.ts` too. The `registerModules` rows of `special.ts` (`:80-130`) keep their ids, phases and orders; each hook becomes `(g) => careerActive(g, 'actor') && readPack<ActorApi>('career.actor').yearlyActor(g)` where `careerActive` is a pure state test (the career's saved slice exists) so a life without the career never loads it; each `careerRow` returns a stub `MenuGroup` with the label, emoji and `visible` of the real one, `children` that returns one "Loading" row until the pack is ready, and a new optional `needs?: PackId` on `MenuGroup`; the menu sheet calls `warmPacks` for `needs` when the group opens and re-renders on install. `packsFor` adds `career.*` for every career slice present in `g`. The `*JobNodes` rows read the pack only when `careerActive`. Importers outside the subtree (`cv.ts`, `computer/dev-cv.ts`, `business/gamestudio*.ts`, `shops/luxury-pamper.ts`, `business/hedge-model.ts`) move to `import type` or a port (`definePort`, `kernel/ports.ts`) one by one; the layer and domain ratchets must not grow.
**Steps.**
  1. Red: for each career, a life without it never installs its pack over 60 years; a life with it installs before the first yearly hook; a save with an active career resumes through `whenPacksReady`; menu purity under `deepFreeze` with and without the pack; the order of yearly hooks equals `kernel-parity.json`'s list with all packs installed.
  2. The B1 sweep for the 10 entries.
  3. Implement in two commits (hooks, then menus).
  4. Check `test/kernel-special.test.ts test/kernel-menus.test.ts test/kernel-parity.test.ts test/career-money-scan.test.ts test/layers-domains.test.ts` and the actor, music, sports, politics, astronaut, model, author, gamedev, hustler, military test files.
**Conflicts.** R6 hot files: `special.ts` yearly tuple, `special/kit/*`, `menus.ts`, `special/athlete.ts`, `author*`, `gamedev*`. This task edits only the rows of `special.ts` and the importers listed.
**Fixtures.** `kernel-parity.json` must not move (the aging list and the `special` seam list are unchanged). If Q1 says R6, this task moves to R6 as its task zero unchanged.

### R5-B8 The voice cap gate (K.9a)
**Goal.** The house caps are a test, not a warning. **Needs.** Nothing. **Size.** 360 source, 560 test. **Model.** Sonnet.
**Files.** Create `scripts/voice/gate.mjs` (counts per file per flag from `extractWithStats` units, `LIMITS` of `rules.mjs:48`, `unitFlags`; `label-words` counts label units over `LABEL_WORDS`), `scripts/voice/gate.d.mts`, `test/voice-gate.test.ts` (fast), `test/voice-gate-baseline.json` (captured once, by the lead, at the merge), `scripts/voice-gate.mjs` (CLI), `package.json` script `voice:gate`.
**Behaviour.** `compareGate` fails on: a file whose count for a flag rose, a file not in the baseline with any count above 0 ("new text must be clean"), and a baseline entry that fell without the baseline being shrunk (the layers pattern); each failure names file, flag, old and new count and the first three units (id `file:line:col`, role, length, limit). A unit that a test pins or the code looks up is left out the way `voice-batch` leaves it. `--era` is B9's.
**Steps.**
  1. Red on synthetic trees built under `os.tmpdir()` (the fixtures of `test/fixtures/voice` are .txt): growth fails, new clean file passes, new dirty file fails, shrink demands the update, `rebase` prints and accepts, hostile text (empty, 10,000 characters, lone surrogates, NaN lengths) never throws.
  2. Real tree: the gate is green against the captured baseline and runs in under 6 seconds (measured pieces: corpus 0.9 s, units 2.2 s).
  3. Implement.
  4. Docs: `docs/VOICE.md` gets a "The gate" section (five lines).
**Numbers at capture.** 9,240 flagged units; over-cap 1,709 in 157 files; long 385; no-contraction 689; em-dash 20; chatbot 20; disclaimer 34. The em-dash count also keeps `test/voice-guards.test.ts` (at most 24) and `test/r3-no-dash-literals.test.ts` as they are.
**Protection of the thin gates.** The gate lowers risk for them: it forces other tracks' new lines under the caps (the Paper and composer tracks write thousands).
**Hot-file note.** New text in other tracks fails this test from the day it merges; it merges early (sixth) and the lead announces it; `=rebase` is the lead's tool for a train that merged text while it was open.

### R5-B9 The static era gate (K.9b)
**Goal.** Anachronisms are found over the whole corpus in seconds. **Needs.** Nothing (reads the four existing era entry modules directly, so it does not wait for B3). **Size.** 520 source, 640 test. **Model.** Sonnet.
**Files.** Create `scripts/voice/era-gate.mjs`, `era-gate.d.mts`, `test/era-gate.test.ts` (fast; imports `ERA_RULES` and `anachronismsIn` from `src/game/events/era.ts:361,438`, builds the tag window by probing `gateHolds` (`era.ts:73`) with a minimal state stub for each distinct tag, once), `test/era-gate-baseline.json`. Modify `test/anachronism.test.ts:245` (`LIVES` default 48 to 16; the nightly keeps `ANACHRONISM_LIVES=400`; the detector, vocabulary and political blocks stay) and the cross-check below.
**Spans, in order of authority.**
  1. A literal with an `@` tag: judged at the first year the tag allows (probe, years 1900 to 2100, country `us`).
  2. Data read from the modules: flavor-pool `lines` at `max(pool.from, pack.from)`, every `HEADLINE_ROWS` row at its own year column, `digest-early.ts` and `digest-late.ts` lines at their year; these are exact and fail the test outright.
  3. A literal in an `era-pack-YYYY-*.ts` file: judged at the pack's `from`.
  4. Any other literal: judged at 1900, then counted per file and rule against the baseline (shrink-only, new files must be zero), because the guard may sit in code. Country is `['us']` (the earliest adopter); world headlines get the same.
**Steps.**
  1. Red on synthetic corpora: each rule fires at its year and not after, a tagged line is judged by its tag, a pool with `from` is judged at `from`, growth fails, shrink demands the update.
  2. Cross-check on the real tree: run the lived test once at `ANACHRONISM_LIVES=400` on the base commit and on a branch with one planted anachronism per rule family; every finding of the lived run must also be a finding here or sit in a file with a known code guard, and the builder lists the misses in `docs/VOICE.md`.
  3. Run on the real tree: capture the baseline (measured at 1900: 4,089 untagged hits in 349 files; era-pack untagged 70 in 10 files) and the time (corpus 0.9 s + scan 0.8 s).
  4. Implement and docs.
**What it does not do.** It does not see a guard written in code, so it cannot clear the 4,089; it stops growth and pins new text. The lived test stays for composed text (template plus token) at 16 lives, saving about 100 seconds of the 157.2 seconds the file takes now (`scripts/test-timings.json`; the lead refreshes the timing in B11). Q5 asks whether to cut further.

### R5-B10 One corpus walk, one CLI, the CI step (K.9c)
**Goal.** The three text tools share one walk and one command. **Needs.** B8, B9. **Size.** 260 source, 360 test. **Model.** Sonnet.
**Files.** Modify `scripts/voice/corpus.mjs` (`buildCorpusOnce(root)`: one memo per process, keyed by root, invalidated by the source SHA the corpus already computes; `voice-report`, the cap gate and the era gate share it), `scripts/voice-report.mjs` (use it), `scripts/voice-gate.mjs` (modes `--caps`, `--era`, both by default, `--update`, `--rebase`, `--ci` markdown summary to `$GITHUB_STEP_SUMMARY`), `.github/workflows/ci.yml:35-37` (a step after the voice report: `node scripts/voice-gate.mjs --ci`, a failing step, in the `checks` job, 8 seconds), `docs/CI.md` and `docs/VOICE.md`. Tests: `test/voice-report.test.ts` stays green unedited; new `test/voice-gate-cli.test.ts` (exit codes 0, 1, 2; summary text; the memo returns the same object for the same root and a new one after a file changes).
**Protection.** None of the three tools writes into `src/`. Exit codes follow the existing scripts (0 ok, 1 violation, 2 usage).

### R5-B11 Re-capture, release checks and the numbers (lead)
**Goal.** The budget file says what the diet achieved. **Needs.** B3, B4, B5, B6, B7 if built. **Size.** 120 source, 160 test. **Model.** The lead.
**Steps.**
  1. At the R5 head, `vite build` to a scratch dir and `node scripts/bundle-budget.mjs --update`: baseline `initialGzBytes` becomes the measured total, `measuredAt` names the head, `allowGrowthBytes` becomes 30,000 (R4 cross-check section 9), the ceilings of B6 are written.
  2. Note for R6: 30,000 bytes is below what R6 would add at the R4 rate of 4.06 gzip bytes a line (23,200 lines is about 94,000); R6's new careers must be lazy domains (B7's contract) or the owner raises the allowance, which is Q6.
  3. Build twice for the hash check of B6; write the result into `docs/PACKS.md`.
  4. Refresh `scripts/test-timings.json` after a green CI run (anachronism, the new heavy files).
  5. Release walk on the preview with a new life and a Continue, once with `--drop-pack era.1980` (the failure card, Try again, Reload) and once offline after the first load.
  6. `docs/RELEASE-v5.4.0.md` bundle section: before and after in gzip and raw, which stage shipped, what 35% would still need.
  7. Rows for R5's `moved-tests.md`.

## 4. Risks

1. **Hidden load-time reads.** `data/brands.ts:67-73` and `data/locales.ts:86` read their data while they load; `history/events.ts:85` builds an index while it loads. Others may exist (the eager baseline lists 96 files, 132 names, most inside the pack files themselves). Mitigation: B1's sweep runs every `src/game` module with no pack installed and fails on the first read; each pack task adds its rows before the code.
2. **Order and determinism.** The library and the pool list must not depend on the order packs load. Mitigation: canonical-order install hook, B3 tests (a) to (d), golden digests unchanged. A pack that loads late cannot change a draw: the engine only ever sees installed data and `ensurePacks` is outside the engine.
3. **The Home screen reads a save at first render** (`HomeScreen.tsx:58-61`) and `loadGame` statically reaches the pack consumers through `save.ts:94-95`. Mitigation: B2 step 5 and the `BASE_PACKS` hold.
4. **Headroom.** The allowance has 5,999 bytes of room; the other R5 tracks add code at about 4.06 bytes a line (the other R5 tracks plan 12,900 source lines, about 52,000 gzip bytes). Mitigation: merge B3 first; if it slips, the lead uses the pre-approved raise (+120,000 in `RELEASE-v5.3.0.md`).
5. **Cache claim.** See B6: only pure-data packs keep their hash across releases; the docs say what B11 measured.
6. **Conflicts.** `history/events.ts` (no other track edits it), `special.ts`, `menus.ts`, `special/kit/*` (R6), `vite.config.ts` (B1 test block, B6 build block: B6 after B1), `docs/KERNEL.md`, `docs/PACKS.md` (one row per pack task), the baselines of B8 and B9 (new text from other tracks).
7. **Text gates become hard.** B8 and B9 fail other tracks' branches on over-cap and anachronistic new text. That is the purpose, and the reason for early merge, an announcement, and `=rebase`.
8. **Memory.** Packs never unload; a life through four eras holds what today's bundle holds. No new risk.
9. **Vitest aliasing.** The alias rule matches any import ending in `-source`. A future file with that name outside the convention would be rerouted; `pack-zones.test.ts` fails on a `*-source.ts` file that is not listed.
10. **Dev server.** `vite dev` is not aliased, so it runs the lazy path; that is the intent (the dev server exercises what ships), but a developer needs the base packs after the first idle.

## 5. Questions the plan raised and how each is settled

| # | Question | Default taken | Who decides |
|---|---|---|---|
| Q1 | Do the careers go lazy in R5 (B7) or in R6 as its task zero? | In R5, last, so R6's Kit v2 and its new careers build on the lazy contract. B7 stands alone: dropping it loses 27% to 16%, nothing else. | The lead at the first checkpoint; the owner if it changes the R6 order |
| Q2 | The roadmap says 35% and 5.5 MB raw. This plan measures -16% (stage 1) to -30% (with careers and deep tech). Replace the target? | Yes: the gate is gzip bytes: initial at most 2,560,000 certain, 2,230,000 with B7, 2,140,000 with the deep-tech cut (a follow-up, not a task here). 35% is stated as needing luxury shops and the computer domain. | The owner (it changes an acceptance line of the roadmap) |
| Q3 | Split locales by region for about 50,000 more gzip bytes saved per life? | No: other countries' locales are read in a life (vacations, emigration, `hasLocaleData`). | The lead |
| Q4 | Prefetch policy. | Base packs at idle after first paint (only when a save exists, in parallel with hydrate); era packs for `[year, year + 5]` after each commit; the New Life year picker warms the picked year. No blanket download of all four eras. | The lead |
| Q5 | How much of the lived anachronism test to retire, given the static gate cannot see code guards? | 48 lives to 16 by default, 400 nightly; the detector and political blocks stay. | The lead (the owner if the nightly misses a case the static gate does not) |
| Q6 | Allowance after the diet: 30,000 (R4 preflight) is below what R6 would add. | 30,000 now; R6 uses lazy domains or asks for a raise with the measured rate. | The owner |
| Q7 | Gate flags: which are hard? | `over-cap`, `long`, `em-dash`, `chatbot`, `disclaimer`, `label-words`, `no-contraction` as a ratchet; `over-aim` and the style flags (punchline, tell, list-of-three) stay report-only. | The lead; the owner owns VOICE.md |
| Q8 | Is the market-table pack (21,200 bytes, 0.7%) worth a task half? | Yes if B5 is small; drop it first if B5 runs long (the Paper conflict is gone). | The lead |
| Q9 | Does K.9 emit typed TypeScript from `content/` entries as the design sketch says? | No. The roadmap says "build-time validation only"; the picker already exists (E.T1). | Settled by the roadmap (line 110) |
| Q10 | `window.requestIdleCallback` is absent in some browsers. | Fall back to `setTimeout(fn, 200)`; tested in B2. | The builder |

**Tests and fixtures that move, in one list.** Edited: `test/layers-baseline.json` (shrinks by `ERA_PACKS`), `test/bundle-budget.test.ts` (B6, added cases), `test/anachronism.test.ts:245` (B9, `LIVES`), `scripts/test-timings.json` (B11), `docs/KERNEL.md` (a line). Unedited because the seam is synchronous when ready and the shims keep today's graph: the 30 test and kit files that drive the store, the 10 files that read `EVENT_LIBRARY`, the 5 that read `ERA_PACKS`, the 17 that read brands, the 8 that read locales, the 20 that read history events. Fixtures re-recorded: none (`golden-digests.json`, `kernel-parity.json`, `r2-parity.json`, `social-parity-*.json`, `life-pins.json`). New ratchet files: `test/voice-gate-baseline.json`, `test/era-gate-baseline.json`. Seeds: every seeded test uses `findSeed`; `test/seed-pins.test.ts` sees no new `seed: N` line.

## 6. Plan against code

Commands run in `/home/user/snag` at 1c73b31 unless noted. "Scratch" is `/tmp/claude-0/-home-user-snag/6c431472-dc02-517c-872c-436596f3a0de/scratchpad`.

| # | Claim | Evidence (file:line or number) | Command |
|---|---|---|---|
| 1 | Branch and head | `release/v5.4.0`, 1c73b31 | `git branch --show-current; git rev-parse --short HEAD` |
| 2 | Vite config | `chunkSizeWarningLimit: 8000` at `vite.config.ts:12`; `setupFiles` `:22`; `maxWorkers: 2` `:24`; sequencer `:26` | `grep -n "chunkSizeWarningLimit\|setupFiles\|maxWorkers" vite.config.ts` |
| 3 | Budget script | `DEFAULT_ALLOW_GROWTH_BYTES = 60_000` `scripts/bundle-budget.mjs:29`; `initialAssets` `:57`; `checkBudget` `:74`; `readBaseline` `:115`; baseline `{2969098, 60000, "v5.2.0 (main at a45d3a1)"}` | `grep -n` as listed; `cat scripts/bundle-baseline.json` |
| 4 | Real initial size | Initial JS 3,005,319 (8 files), CSS 17,780, total 3,023,099, delta +54,001 of 60,000; 14 lazy files, 46,408 bytes | `npx vite build --outDir $SCRATCH/dist-bundle --emptyOutDir; node scripts/bundle-budget.mjs --dist $SCRATCH/dist-bundle` |
| 5 | Raw sizes of the initial files | index 7,371,743; family-share-state 1,195,927; timeline 118,482; era 57,689; state 52,363; core 34,606; common 9,776; spec 3,864 (JS 8,844,450); CSS 91,920 | `stat -c %s` on `dist-bundle/assets/*` |
| 6 | The roadmap's map | era-pack* 665,098 raw (27 files); history 266,527 (27); data/locales 219,322 (5); data/brands* 382,710 (12); in the design 0.66, 0.28, 0.22, 0.38 | `node $SCRATCH/meta.mjs` (esbuild metafile, `bytesInOutput` per input) then a group sum |
| 7 | Gzip deltas of each cut | era 220,402; locales 66,312; brands 165,120; headlines 35,354; markets 21,916; stage 1 together 509,644 (esbuild baseline 3,124,679; vite/esbuild ratio 3,023,099 / 3,124,679 = 0.9675) ; + careers 861,641; + deep tech, lab, silicon 957,528; + luxury shops + computer 1,129,569 | `node $SCRATCH/stub.mjs '<json of regexes>'` (stubs the modules with `module.exports = {}`, rebuilds, gzips level 9) |
| 8 | Cut sets, importers into each group | era: 1 importer (`events/era-life.ts`), 4 edges; locales: 1 (`data/locales.ts`), 4; brands: 1 (`data/brands.ts`), 4, drops 24 files / 580,262 raw; headlines: 1 (`history/events.ts`), 6; markets tables: 1 (`history/markets.ts`), 4. Careers: 65 files / 959,901 raw, 10 outside importers, 29 edges; per career actor 3, astronaut 3, model 2, music 3, author 3, gamedev 6, sports 1, military 1, politics 2, hustler 1; deep tech 34 importers | `node $SCRATCH/cut.mjs graph.json v <group>` and `cut2.mjs` (reachability from `src/main.tsx` with the group removed) |
| 9 | Importers of the consumers | `data/locales.ts` 38; `data/brands.ts` 18; `events/era-life.ts` 2 (`events.ts`, `flavor.ts`); `history/events.ts` 3 (`history/index.ts`, `life.ts`, `NewLifeScreen.tsx`); `history/markets.ts` 13 | graph script, static edges only |
| 10 | Era pack spans | 1900 to 1945, 1946 to 1979, 1980 to 1999, 2000 to 2026 | `grep -n "from:\|to:" src/game/events/era-pack-{1900,1946,1980,2000}.ts` |
| 11 | Era wiring | `ERA_PACKS` `era-life.ts:46`, `ERA_LIFE_EVENTS` `:49`, `eraFlavorPools` `:52`; `events.ts:18` import, `:40` `EVENT_LIBRARY` via `withVariants`, `:53` spread (last in the list), `:57` `EVENTS_BY_ID`, `:59` `getEventDef`, `:295` `eligibleEvents`; `flavor.ts:17,581`; `variants.ts:118` pure map | `grep -n` |
| 12 | Load-time builds | `data/brands.ts:67` `BY_ID`, loop `:68`, `ALL` `:73`; `data/locales.ts:86` `ALL`; `history/events.ts:85` `BY_YEAR` IIFE; `history/markets.ts` reads its tables inside functions only (`:193,231,281,473,499,628,650`) | `sed -n` on each |
| 13 | Eager baseline | 96 files, 132 names; `era-life.ts: ["ERA_PACKS"]`, `events.ts: ["EVENT_LIBRARY"]`, `data/brands-rivals.ts: ["RIVAL_BRANDS"]`, `data/brands-stocks.ts: ["STOCK_BRANDS"]` | `python3` over `test/layers-baseline.json` |
| 14 | Layers | `layerOf` `test/layer-kit.ts:80`; `KERNEL_DIRS` kernel; `DATA_DIRS` data, history, text; an unlisted dir is layer 3 (so the gate is in `kernel/`, loaders and needs in `data/`); dynamic imports are not edges (`test/arch-kit.ts` header) | `sed -n 40,95p test/layer-kit.ts` |
| 15 | Kernel doc rule | every file of `src/game/kernel` needs a line in `docs/KERNEL.md` section 9 (`:134`), checked by `test/kernel-acceptance.test.ts` | `sed -n 134,140p docs/KERNEL.md` |
| 16 | Store anchors | `AppState` `store.ts:82`; `hasSavedGame` `:204`; `resumeSavedGame` `:208`; `startNewLife` `:222`; `continueAs` `:231`; `travelBack` `:274`; `commit` `:381`; `act` `:432`; `ageUpAction` `:494`; `processQueue` `:641`; engine and store are synchronous except `travelBack` | `grep -n "^export \|^function " src/ui/store.ts` |
| 17 | UI callers | `HomeScreen.tsx:58-61` (`loadGame()` at render), `:76` `resumeSavedGame()`; `NewLifeScreen.tsx:619,807` `startNewLife`; `DeathScreen.tsx:348,447`; `GameScreen.tsx:133,207` `ageUpAction`; `TimeMachine.tsx:117` `travelBack` | `grep -rn` |
| 18 | Boot | `main.tsx:14` `bootApp({hydrate, render, flush, spill, ...})`; `boot.ts:19` | `sed -n` |
| 19 | Save load path | `save.ts:72` `loadGame`, `:94-95` `refreshRoyalCareers`, `refreshFamilyTalents`; `save.ts` statically reaches `data/locales`, `data/brands`, `history/markets`; `save-schema.ts` and `save-hydrate.ts` reach none | graph reachability from each entry |
| 20 | Failure behaviour of a missing chunk | `wrangler.jsonc` `not_found_handling: single-page-application`; `lazyView.tsx:71` `LazyFailure`, `:96` `reloadAfterSave`; `lazyStep` | `cat wrangler.jsonc; grep -n` |
| 21 | Lazy zone guard to copy | `test/lazy-zones.test.ts`, `test/lazy-kit.ts` (`closure`, `dynamicImports`, `staticImports`) | `grep -n "export function" test/lazy-kit.ts` |
| 22 | Voice tooling | `scripts/voice/{contexts 156, corpus 88, lexer 433, metrics 352, rules 292, units 632}`, `voice-report.mjs` 202, `voice-batch.mjs` 145; `LIMITS` `rules.mjs:48`; report 1.26 s: 895 files, 227,570 literals, 66,673 text strings; units 2.2 s: 9,240 flagged, over-cap 1,709 in 157 files, 1,087 with an era tag | `time node scripts/voice-report.mjs`; `node $SCRATCH/units-count.mjs` |
| 23 | Era rules | `EraRule` `events/era.ts:352`; `ERA_RULES` (66 rules) `:361`; `gateHolds` `:73`; `anachronismsIn` `:438` | `grep -n`; `node $SCRATCH/era-static.mjs $SCRATCH` printed `rules 66` |
| 24 | Static era probe | corpus 0.9 s, scan 0.8 s; 5,904 hits at 1900 (1,815 tagged, 4,089 untagged, 349 files); era-pack untagged 6,474, 70 bad at the pack start year in 10 files; other untagged hits 3,775 in 331 files | `node $SCRATCH/era-static.mjs $SCRATCH` |
| 25 | The lived lint | `LIVES = ... || 48` at `anachronism.test.ts:245`; 157.2 s in `scripts/test-timings.json` (the audit's 214 s is older); one of six sliced files | `grep -n LIVES test/anachronism.test.ts` |
| 26 | CI | `checks` job runs `vite build` then `node scripts/bundle-budget.mjs` (`ci.yml:38-39`) and the voice report as warning only (`:35-37`); 8 shards; `nightly.yml:52,98` bundle `fuzz-engine.ts` and `nightly-probes.ts` with the esbuild CLI | `sed -n` |
| 27 | A global preload is wrong | 12 trivial test files: 0.8 s without a game-importing setup file, 22.3 s with one (about 0.8 s a file warm, 12 s cold transform); a setup file that imports the game caches modules before a test's `vi.mock` registers; `expect.getState().testPath` is readable in a setup file (vitest 5.0.3) but not enough to fix this | scratch vitest configs `vt/` and `vt2/` |
| 27b | The test-only alias works | in a scratch vitest 5.0.3 config, `test.alias: [{ find: /^.*\/([a-z]+)-source$/, replacement: '<abs>/eager/$1.ts' }]` rerouted `./era-source` to the eager file and a plain build is untouched (`resolve.alias` is not used) | scratch `vt3/` |
| 28 | Test usage | `EVENT_LIBRARY` in 10 test files (38 uses); `ERA_PACKS` in 5; brands 17; locales 8; history events 20; files naming `resumeSavedGame`, `startNewLife`, `ageUpAction` or `travelBack` 30 | `grep -rln` |
| 29 | Node entries that play lives | `test/golden-cli.ts` (bundled by `scripts/golden.mjs`), `test/fuzz-kit.ts` (via `scripts/fuzz-engine.ts`), `test/nightly-probes.ts`, `scripts/save-size.ts` (`test/probe-life`), `scripts/text-probe.ts`, `scripts/r3-playthrough.ts`, `scripts/r1-screenshot-state.ts`, `scripts/save-fixtures.ts` | `grep -ln "createNewLife\|playLife\|probeLife"` |
| 30 | Seeds and e2e | `findSeed` `test/seed-kit.ts:108`; `scripts/e2e-play.mjs` is a Playwright playthrough that fails on off-origin requests | `grep -n` |

## Cross-check amendments (2026-10-31, `00-crosscheck.md` wins over any line above)

1. **B5 needs no Paper merge.** The Paper plan edits no file of `history/`; the edge in the first draft is removed (lines for B5 above).
2. **Merge order.** B8, B9, B10 merge early, before any task that writes player text (N5, N6, O4, O6 and what follows them), so the baselines of `test/voice-gate-baseline.json` and `test/era-gate-baseline.json` are captured before new text exists and new text must be clean. B1, B2, B3 come before any other track's eager source (headroom, section 1.5 of the cross-check). B11 is last, after the flip task N11, so the baseline is captured on the release head.
3. **Ceilings on the integrated tree.** The 2,560,000 figure is this track alone (stage 1 at 2,538,000 plus 1% margin). The Paper (up to 13,000 gzip bytes eager), the composer (up to 29,000) and the cycles (up to +1,500) land on the same tree, so the absolute ceiling `initialMaxGzBytes` that B6 writes is **2,600,000**, and B11 re-sets it to the measured head plus 30,000. With B7 the head is expected near 2,255,000 and B11 writes about 2,285,000. The per-chunk ceilings apply to any lazy chunk by name prefix (not only names that contain `-pack`), so the Paper's `PaperSheet` chunk gets its row (26,000) from B11; the "Packs" section of the report still lists the `-pack` chunks with a subtotal.
4. **Two pins in `test/bundle-budget.test.ts` move.** `:365-366` pins the baseline keys as exactly `['measuredAt','initialGzBytes','allowGrowthBytes']`: B6 changes it to the five keys, in the order the script writes them (a deliberate edit, one row in `moved-tests.md`). `:372` pins `allowGrowthBytes` to 60_000: B11 changes it to 30_000 in the same commit as the baseline, with the lead's reason in a comment (plain hyphens; the file scans itself for U+2013 and U+2014).
5. **B9 and era words in other tracks' new files.** A new file is judged by the same rules, so the Paper's outlet and template files tag every era-ruled word with the `@` grammar of `events/era.ts` (for example `@+crypto`, `@tv`, `@radio`), and the Paper's renderer strips the tag with its own one-line regex of the same grammar (`/^@[\w!+,-]+\s+/`), because `news/` may not import `events/era.ts` (a new L3 domain pair). B9's test adds a case with a tagged line in a synthetic new file (passes) and an untagged one (fails).
6. **B7 and kernel-parity.** `MenuGroup.needs` must not enter the hash that `test/fixtures/kernel-parity.json` records for a menu group (`menus` holds `{n, h}` per group); if one `h` changes, B7 is wrong, not the fixture.
7. **Node entries added by other tracks** call `await preloadAllPacks()` first; `test/scripts-preload.test.ts` (B2) is the guard. The R5 save fixture script mode (P6) is covered by the same rule.
8. **Voice baselines are regenerated, never merged by hand.** After each merge that changes text the integrator runs `UPDATE_VOICE_BASELINE=1` (shrink only); growth is `=rebase`, the lead's tool, with the reason in the commit.
9. **Stale anchor.** `ERA_RULES` is at `events/era.ts:361` and the tag regex at `:87` at `1c73b31` (the first draft said `:359`); the builder re-greps anyway.
