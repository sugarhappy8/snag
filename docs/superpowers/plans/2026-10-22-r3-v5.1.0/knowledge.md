# R3 plan, Knowledge track: estimates, fog and the Intelligence Briefing (track `knowledge`)

> Cross-check (2026-10-22): read `00-crosscheck.md` first, then the section "Cross-check amendments" at the end of this file. Where they disagree with the text below, they win. Task ids, lanes and dependencies are the ones in `00-crosscheck.md` section 1.

Base: `release/v5.1.0`, cut from `main` 85e147b (v5.0.0). Code read in `/Users/saeed/projects/anotherlife/wt/r3-release` on 2026-10-22; only this file was written. "Modify" paths exist today (line numbers verified by grep); "create" paths do not. Plain hyphens only (no U+2014, no U+2013).

## 1. Track summary

**Tasks (9), four lanes, all lanes start at once.**

| Task | Item | Lane | Depends | Source | Tests |
|---|---|---|---|---|---|
| R3-H1 mode, Settings, Exact in the suite | H.3 | main | none | 300 | 260 |
| R3-H2 the estimate core: rules, units, words, `know`, `estimate` | H.1 | main | H1 | 810 | 700 |
| R3-H3 the `flags.know` record | H.1 | main | H2 | 360 | 420 |
| R3-H4 sources, prices, buying, illegal heat | H.2 | main | H3 | 800 | 650 |
| R3-H5 Look closer, Briefing hub, standing orders, module | H.2 | main | H4 | 650 | 500 |
| R3-H6 acceptance sweep, probes, docs | H.1 H.2 H.3 H.13 | main | H5 | 130 | 650 |
| R3-H7 confidence chip in `MenuList` | H.2 | ui | none | 170 | 200 |
| R3-H8 signals and the market read | H.13 | tips | none | 230 | 320 |
| R3-H9 the foresight fence for knowledge | H.13 | fence | none | 0 | 220 |
| Total | | | | 3,450 | 3,920 |

Source is 1,650 under the roadmap's 5,100 on purpose. Wiring screens (market, competition, rivals, scorecards, odds, hints, the 207 sites) is the Fog migration track (H.4, H.6, H.8, H.11) and calls this track's API. R0-2 (the analyst tip) and the R1 foresight scan already paid most of H.13. The audit's "H13 test harness" (coverage, fuzz, long-run probe) is folded into R3-H2 and R3-H6; it is not the lead's H.13.

**Not in this track.** H.5 hiring, H.7 people, H.9 politics, H.10 `rivalSees`, H.12 careers (later releases). `MarketNews.sig` (news items carrying a structured signal) is left to the Fog track; this track provides `ingestSignal`. The yearly-leak hazard of secrets is C.5 (Frontier or Effort).

**Measured facts the plan rests on.**

| Fact | Where |
|---|---|
| `conf?: 0 \| 1 \| 2 \| 3` is already on `MenuBase` and `MenuInfo`; nothing in `src/` reads it | `src/game/types.ts:788`, `:821` |
| `Settings` is pinned by 9 `toEqual` checks on its exact keys; `info` must therefore be optional and absent by default | `test/store.test.ts:120-126`, `test/offline.test.ts:290,299,320` |
| `vite.config.ts` has no `setupFiles`; the test block is lines 17-24 | `vite.config.ts:17` |
| The money-display switch pattern to copy | `src/game/core.ts:201` (`setMoneyDisplay`), `src/settings.ts:77` |
| `flags` is one core slice, so `flags.know` needs no table row, only a class in `world-flags.ts` | `src/game/save-slices.ts:67-75`, `src/game/world-flags.ts:87` |
| Reasons are pinned at 63 and every reason needs a docs row and a Books label | `test/ledger.test.ts:796-797`, `test/world-acceptance.test.ts:459`, `src/game/charts/books.ts:71` |
| `assets.money` orders are pinned `[10,20,30,40,50,60]` | `test/kernel-menus.test.ts:89-93` |
| Adding a yearly entry changes the hook-name list in the parity fixture | `test/fixtures/kernel-parity.json`, `test/kernel-parity.test.ts:193` |
| The gut's `hasTalent` gate is line 177 and the foresight test pins that number | `src/game/invest/instinct.ts:177`, `test/foresight-scan.test.ts` `GATE_LINE` |
| The tip text is pinned by regexes; do not touch `seededTip` | `test/analyst-tip.test.ts:144-186`, `src/game/investments.ts:2247` |
| A stream tag needs a row; a tag with a caller in `src/` cannot be `idle` | `test/stream-tap.ts:149`, `test/stream-isolation.test.ts:405-427` |
| Unknown crime names rate severity 2 and `wantedLevel` drives a yearly arrest roll | `src/game/crime.ts:152`, `:3872` |
| Cross-domain imports go through `contract.ts` (rule c); imports of a contract are not counted | `test/layer-kit.ts` `contractPath`, `domainOf` |

**Acceptance owned (roadmap R3 block, RF2, RF4, RF5, RF7), and the test that proves each.**

| Criterion | Proven by | Task |
|---|---|---|
| A shown band holds the truth about 80% of 10,000 draws (passive, per source, merged and decayed) | `test/knowledge-estimate.test.ts`, `test/knowledge-acceptance.test.ts` | H2, H6 |
| Same source twice in a year returns the same number; a repeat buy is refused and costs nothing | `test/knowledge-intel.test.ts`, acceptance | H4, H6 |
| No `g.rng` in any read; menus rendered under `deepFreeze` in fog mode | acceptance (`renderAll` over a frozen fog life), a token scan of `knowledge/**` | H2, H6 |
| `know` never sees a roll: truths are arguments, `knowledge/**` draws nothing and imports no market reader | scan in `test/knowledge-fence.test.ts` and acceptance | H9, H6 |
| Intel floors (press 20%, report 12%, analyst 8%, audit 3%); 100x spend or 100x wealth changes nothing | ceiling rows `intel-floors`, `intel-price`; `test/knowledge-sources.test.ts` | H4 |
| Exact mode through `setupFiles`; the hint-text files pass unchanged | `test/info-mode.test.ts` plus a sample of 12 hint files | H1 |
| Settings shows Realistic or Exact | `test/info-settings.test.ts` | H1 |
| Chip and "as of" on rows; Look closer row; Briefing hub | `test/conf-chip.test.ts`, `test/knowledge-hub.test.ts` | H7, H5 |
| Hostile, old and heir saves (RF4) | `test/knowledge-record.test.ts`, `test/old-saves.test.ts` | H3, H6 |
| No foresight (RF2): a row from a future year is dropped; sources read no future year; the gut stays behind the talent | `test/knowledge-record.test.ts`, `test/knowledge-fence.test.ts`, acceptance spy | H3, H9, H6 |
| Knowledge state is bounded: at most 120 keys, 400 nodes, flat fees | acceptance long-run probe | H6 |

Not owned: popups a year, the digest, repeated-line rates (Quiet years); parity grids (Effort migration); the 200-year effort probe (Effort core).

**Hot files and who touches them** (every edit is additive and in its own hunk).

| File | Task | Edit |
|---|---|---|
| `vite.config.ts:17-24` | H1 | add `setupFiles` |
| `src/settings.ts:19-35, 60-68, 77-79, 100-103, 121` | H1 | optional `info`, `applyInfoSettings` |
| `src/ui/screens/SettingsScreen.tsx:4-5, 221` | H1 | one import, one element |
| `src/game/types.ts:788, 821` | H7 | `asOf?: number` on both |
| `src/ui/components/MenuList.tsx:359-377, 429-480`, `menuModel.ts:78` | H7 | chip |
| `src/game/world-flags.ts:87` | H3 | `'know'` in `PERSONAL` |
| `src/game/kernel/reasons.ts:151-161`, `charts/books.ts:71-90`, `docs/LEDGER.md`, `test/ledger.test.ts:796-797` | H4 | reason `intel` (63 to 64) |
| `src/game/modules/index.ts:14-20` | H5 | one line, first in `MODULES` |
| `src/game/investments.ts:84, 2203` | H8 | one import, one call |
| `test/ceiling-list.json`, `test/ceiling-kit.ts` | H4 | 3 entries, 3 rows |
| `test/stream-tap.ts:149`, `test/stream-isolation.test.ts:71` | H4 | one row, one driver |
| `test/hub-entry.test.ts:22`, `test/kernel-menus.test.ts:89-93`, `test/fixtures/kernel-parity.json` | H5 | HUBS line, moved orders, re-record |

**Lanes and merge.** `main` is the spine (H1 to H6). `ui`, `tips` and `fence` touch files no other lane touches, and none needs code from another lane (the fence test scans whatever files exist, so it is meaningful after the merge; H6 asserts the scan saw files). Expected merge conflicts, all one-liners, keep both sides: head of `MODULES` in `modules/index.ts`, the `PERSONAL` list, the reasons count 63, the `moved-tests.md` file (append rows). Lead actions: after all tracks merge, re-record `kernel-parity.json` once more with `RECORD_KERNEL_PARITY=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/kernel-parity.test.ts`; resolve the reasons count and NAMES list of `ledger.test.ts` with the other tracks' reasons.

**Rules every task follows.** Layer: `src/game/knowledge/` is a layer-3 domain with the door `knowledge/contract.ts`; it imports only L0 to L2 (`core`, `talents`, `types`, `kernel/*`, `world.ts`, `data/*`). Presentation only: nothing in `aging.ts`, `life.ts`, `economy/**`, `world/**`, `kernel/**` reads the info mode (H1 scans it). No `g.rng` in `knowledge/**` (a hashed draw, or `outcomeStream` in one place). Fees only through `spend(..., { reason })`. Log lines at most 90 characters, notices at most 120, from pools of 3 or more through `pickLine`. Tests never pin `seed: <digits>`; they use `makeTestGame(n)` or `findSeed`. Floats in any digest round to 9 significant digits; every recording runs under `/Users/saeed/projects/anotherlife/wt/bin/vt22`. The first task that moves a pinned test creates `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md` (`| file | test | before | after | why |`) or appends to it.

## 2. Contracts

**Provided** (the Fog track, Effort migration and later releases may rely on these exact names).

```ts
// src/game/knowledge/mode.ts (imports nothing; state kept on globalThis under Symbol.for('anotherlife.infoMode') so vi.resetModules() cannot lose it)
export type InfoMode = 'realistic' | 'exact'
export function infoMode(): InfoMode               // override ?? the player's setting ?? 'realistic'
export function isExact(): boolean
export function setInfoMode(m: InfoMode): void     // the Settings value (settings.ts applyInfoSettings)
export function setInfoOverride(m: InfoMode | null): void   // tests only; beats the setting
export function withInfoMode<T>(m: InfoMode, fn: () => T): T  // override for the call, restored in finally, nests
```
```ts
// src/game/knowledge/contract.ts  (the one door; re-exports. UI may import it too)
export type Unit = 'money' | 'count' | 'pct' | 'score' | 'odds'   // money, count, pct: log scale; score: 0-100, additive; odds: 0-1, additive, clipped
export interface Estimate {
  key: string; mid: number; lo: number; hi: number   // lo..hi is the 80% band, same unit as the truth
  sd: number                                         // the relative sd the band was built from (after decay, floor, talent)
  conf: 0 | 1 | 2 | 3                                // sd <= .06 is 3, <= .15 is 2, <= .30 is 1, else 0
  y: number; src: string                             // year and source of the reading ('passive', 'press', ... or 'exact')
  exact: boolean                                     // Exact mode, or an `own:` key: the caller keeps its old text
  asOf?: number                                      // set only when the reading is 2 or more years old
  words: string                                      // what a menu prints: '$4.2M', 'about $4M', '$3M to $5M', 'mid-sized', 'likely'
}
export interface EstimateOpts { unit?: Unit; exp?: number /* 0..1, passive sd x (1 - .4 exp) */; ladder?: readonly (readonly [cut: number, word: string])[] }
export function know(g: GameState, key: string, truth: number, opts?: EstimateOpts): Estimate   // the call most screens make; reads the record
export function estimate(g: GameState, key: string, truth: number, opts?: EstimateOpts & { row?: StoredRow | null }): Estimate  // same, with the row explicit (tests, tools)
export function readValue(g: GameState, key: string, truth: number, opts?: EstimateOpts): number   // = know(...).mid; what hint helpers rank on
export function mergeReadings(a: { mid: number; sd: number }, b: { mid: number; sd: number }, unit: Unit): { mid: number; sd: number }
export function agedSd(sd: number, drift: number, years: number): number     // sqrt(sd^2 + (drift sqrt(years))^2)
export const BAND_Z = 1.298, SD_MIN = 0.03                                   // 80% of the unit-variance draw; no merged band is sharper than 3%
// record (H3)
export const KNOW_FLAG = 'know'
export const KNOW_LIMITS: { keys: 120; years: 12; heat: 20 }
export function readKnow(g: GameState): Readonly<KnowRec> | null              // pure; hostile input reads as null or trimmed
export function storedEstimates(g: GameState): Estimate[]                     // stalest first, no truth needed (the hub)
export function learn(g: GameState, key: string, r: { mid: number; sd: number; src: string }): StoredRow | null  // null when (src, year) was already merged
export function widen(g: GameState, keyPrefix: string, factor?: number): void  // an event doubles sd
export function forget(g: GameState, key: string): void
// sources, kinds, menus (H4, H5, H7)
export type SourceId = 'own' | 'news' | 'press' | 'report' | 'analyst' | 'diligence' | 'investigator' | 'informant' | 'hacker' | 'desk'
export interface Offer { src: SourceId; label: string; price: number; sdFrom: number; sdTo: number; block: string | null }
export function offersFor(g: GameState, keys: readonly string[]): Offer[]     // pure; price, sd before and after, block reason
export function buyIntel(g: GameState, src: SourceId, keys: readonly string[]): { ok: boolean; why?: string }
export function ingestSignal(g: GameState, s: { key: string; v: number; sd?: number }): boolean   // the free 'news' source
export interface KeyKind { kind: string; label(g: GameState, key: string): string; truth(g: GameState, key: string): number | null; scope?(g: GameState, key: string): { tier: 1 | 2 | 3; country?: string; countries?: number; deal?: number } }
export function registerKeyKind(def: KeyKind): void                           // owners register at module load; the same def twice is fine
export function lookCloser(g: GameState, scope: { id: string; keys: readonly string[] }): MenuGroup | null  // null in Exact mode or when nothing can be bought
export const intelBriefingMenu: MenuGroup                                     // id 'intel.briefing'
```
```ts
// src/settings.ts
export type InfoSetting = 'realistic' | 'exact'
// Settings.info?: 'exact'   absent means Realistic; stored only when 'exact'
export function infoSettingOf(s: Pick<Settings, 'info'>): InfoSetting
export function applyInfoSettings(s: Pick<Settings, 'info'>): void
// src/game/types.ts: MenuBase and MenuInfo gain `asOf?: number` (the year of the reading; the chip prints "as of 2023" at 2 or more years old)
```

**The rule table** (`knowledge/keys.ts`, one row per `kind.field`; a key is `<kind>:<id>[:<id>]:<field>`, at most 64 characters; later tracks add rows, never edit these). `sd0` is the passive relative sd, `drift` the yearly drift of the truth, `talents` sharpen sd by x0.6 (passive) and x0.8 (source); `hasMainCharacter` sharpens every key.

| Key | Unit | sd0 | drift | Talents |
|---|---|---|---|---|
| `mkt.size` | money | .25 | .06 | Business |
| `mkt.share` | pct | .25 | .15 | Business |
| `mkt.*` | count | .25 | .08 | Business |
| `riv.quality` | score | .30 | .10 | Business |
| `riv.cash` | money | .60 | .35 | Business |
| `riv.*`, `cmp.*` | money | .30, .25 | .15, .10 | Business |
| `cand.skill` | score | .18 | 0 | Business |
| `odds.*` | odds | .20 | .05 | Business |
| `ev.*` (hint option values) | money | .30 | 0 | Business |
| `sec.*`, `fund.*` | pct | .25 | .20 | Investing |
| `val.*` | money | .30 | .15 | Investing |
| `cast.*`, `peer.*` | score | .25 | .15 | Acting, Modeling |
| `eco.*` | pct | .05 | .02 | none |
| `pol.*` | score | .25 | .25 | none |
| `ppl.*`, `war.*`, `story.*`, `show.*` | score | .45, .30, .30, .30 | .20, .25, .25, .25 | none (reserved for R4 to R9) |
| `own.*` | exact | 0 | 0 | always exact |

**How a Fog-track screen calls it.**

```ts
const est = know(g, `mkt:${industry}:${country}:size`, trueSize)
{ type: 'info', id, text: est.exact ? oldText : `Market size: ${est.words}`, ...(est.exact ? {} : { conf: est.conf, asOf: est.asOf }) }
// at the end of the list: ...[lookCloser(g, { id: 'market', keys: [...] })].filter(Boolean)
```

**Consumed.** `kernel/streams` (`streamKey`, `streamUnit` for hashed draws; `outcomeStream` once), `kernel/ledger` via `core.spend`, `kernel/registry` (`registerModule`), `talents` (`hasTalent`, `hasMainCharacter`), `core` (`spend`, `log`, `notice`, `useYearAction`, `shortMoney`, `formatMoney`), `text/pick` (`pickLine`), `world.ts` (`getCountry(id).wealth`, the `ddCost` pattern at `business/fund-vc.ts:277`), `crime.ts` data shapes only through `g.character` (`criminalRecord`, `wantedLevel`, `hidden.notoriety`). Nothing from the Effort or Frontier tracks.

**Decisions for the cross-check to reconcile.**
1. Mode is a presentation switch; the sim never reads it. The standing orders and the heat hazard run in either mode, so a setting cannot change a replay. The Briefing row stays visible in Exact when orders or heat exist, so they can be cancelled.
2. The suite override beats the setting (`setInfoOverride`), so a test file that imports the store (which applies the setting) is still Exact.
3. `Settings.info` is optional and absent by default, which keeps 9 pinned settings checks unchanged.
4. Owner stamp: `o` is `v2:${generation}:${character.id}`, the same text as `special/common.ts ownerKey`, copied because knowledge may not import `special`. If the cross-check hoists `ownerKey` to L0, replace the copy.
5. `know` is classed personal: an heir starts clean. Design 6.3 keeps company-bound records at age +5; that is left out (open question 2).
6. A new reason `intel` (pool other). Illegal sources pay under the existing `bribe`.
7. The hub registers in slot `assets.money`, order 45, and the module adds a yearly entry (phase `close`, order 20). Both move pinned fixtures once; H5 records the reasons.
8. Effort's focus-week pool will replace `useYearAction`; the DIY source calls it through `core`, so it migrates with the counters.

---

## 3. Tasks

### R3-H1 (H.3): the information mode, Settings and Exact in the suite

**Lane** main. **Depends** none. **Goal.** Realistic (default) and Exact exist as a switch with a Settings card; every test file starts in Exact through `setupFiles`; nothing reads the mode yet.

**Files.** Create `src/game/knowledge/mode.ts`, `src/ui/components/InfoSettings.tsx` (the card, like `NoticeSettings.tsx`), `test/setup-exact.ts` (`setInfoOverride('exact')`), `test/info-mode.test.ts`, `test/info-settings.test.ts`. Modify `vite.config.ts:17-24` (`setupFiles: ['./test/setup-exact.ts']`), `src/settings.ts` (interface 19-35, `normalizeSettings` 60-68: keep `info` only when it is exactly `'exact'`; `applyInfoSettings` beside `applyMoneySettings` at 77, called at 103 and 121), `src/ui/screens/SettingsScreen.tsx` (import at 4, `<InfoSettingsSection />` before `<NoticeSettingsSection />` at 221).

**Steps.**
1. Red: `test/info-mode.test.ts` (a) a fresh test file reports `infoMode() === 'exact'` (red until `setupFiles` exists); (b) the same after `vi.resetModules()` and a dynamic import; (c) `withInfoMode('realistic', fn)` flips and restores on a throw and nests; (d) `setInfoMode('realistic')` does not beat the override, and with the override cleared the setting rules; (e) a scan: no file in `src/game/aging.ts`, `life.ts`, `core.ts`, `modules/yearly-aging.ts`, `economy/**`, `world/**`, `kernel/**` imports `knowledge/`. `test/info-settings.test.ts`: `normalizeSettings({})`, `null` and `{ info: 'realistic' }` equal `DEFAULT_SETTINGS` with no `info` key; `{ info: 'exact' }` keeps it; junk drops it; `loadSettings` with a stored exact value leaves `infoMode()` at `exact` once the override is cleared; the card's markup (`renderToStaticMarkup`, the pattern of `test/quiet-settings.test.ts`) has the heading "Information", two radios whose `aria-checked` follow the setting, and no dash characters.
2. Change: the files above. The Realistic radio patches `{ info: undefined }` (the type is `'exact'` only), the Exact radio `{ info: 'exact' }`. Card copy: "Realistic: estimates, ranges and words until you look closer. Exact: every number, as before."
3. Checks: `/Users/saeed/projects/anotherlife/wt/bin/tc`; `/Users/saeed/projects/anotherlife/wt/bin/vt22 test/info-mode.test.ts test/info-settings.test.ts test/quiet-settings.test.ts test/store.test.ts`; then `test/offline.test.ts test/screens.test.ts test/currency-input.test.ts test/year-integration.test.ts`; then a hint sample, 4 at a time: `test/talent-business.test.ts test/talent-investing.test.ts test/lab-hints.test.ts test/market-screen.test.ts`, `test/scorecard.test.ts test/talents-core.test.ts test/talents-ui.test.ts test/main-character-hints.test.ts`, `test/talent-perks.test.ts test/talent-integration.test.ts test/report-live.test.ts test/deeptech.test.ts`.

**Proves.** Exact through `setupFiles`; the Realistic default; the Settings card. **Size.** 300 source, 260 test. **Risk.** A test that sets `localStorage` settings with an unknown key still loads (normalize drops it).

---

### R3-H2 (H.1): the estimate core

**Lane** main. **Depends** R3-H1. **Goal.** `know`/`estimate` return an honest, stable, pure Estimate for any key, in Exact or Realistic mode; no record yet.

**Files.** Create `src/game/knowledge/types.ts` (`Unit`, `Estimate`, `StoredRow`, `Rule`), `keys.ts` (the rule table above, `parseKey`, `ruleOf`, `isExactKey`), `normal.ts` (`zOf(g, key, year, src)`: sum of six `streamUnit` draws on `streamKey(g.lifeId, 'know', year, key + '|' + src)`, minus 3, times sqrt 2; a bounded memo of 512), `format.ts`, `estimate.ts`, `contract.ts`, `test/knowledge-kit.ts` (`inFog(fn)`, `fogGame(i)` giving each draw its own `lifeId`, `coverage(n, make)`), `test/knowledge-estimate.test.ts`, `test/knowledge-format.test.ts`.

**Interfaces.** As section 2. Math, per unit's scale (log for money, count, pct; linear for score with `sd x 100` points; linear for odds clipped to 0..1): passive `mid = apply(truth, sd, z)` with `sd = sd0 x talent(.6) x (1 - .4 exp)`, band `mid +- BAND_Z sd` in scale space (so the truth is inside with probability .80, since the draw is the same distribution); a stored row ages with `agedSd`; whichever of the aged row and the passive read has the lower sd is shown (a choice that never looks at the truth, so coverage holds); `mergeReadings` is inverse-variance in scale space, floored at `SD_MIN`. Truth that is not finite, or not above 0 on a log scale, returns the exact estimate (no NaN). Words: sd <= .06 gives '$4.2M' (3 significant digits); <= .15 'about $4M' (1 digit, 2 when the mantissa is under 2); <= .30 '$3M to $5M' (1 digit each, never equal); above that the caller's `ladder`, else a default (money and count by magnitude: 'in the millions'; score 'poor' to 'outstanding'; pct 'a sliver' to 'most of it'; odds 'a long shot', 'unlikely', 'less likely than not', 'even money', 'likely', 'very likely', 'close to certain'). Odds show 'about 65%' (nearest 5) from conf 2 and '65%' at conf 3. `conf`, `asOf` as in section 2. Money text goes through `shortMoney`/`formatMoney`, so currency settings apply.

**Steps.**
1. Red (the files do not exist): `knowledge-estimate`: (a) over 10,000 draws (own `lifeId` and truth each), the band holds the truth 77% to 83% of the time, for each unit, with the Business talent, and for an aged row with a simulated drift; (b) stable: the same `g`, key and year give the same JSON, another year another mid, truth x3 keeps `mid/truth` on a log unit; (c) pure: `deepFreeze(g)` then reads, `g.rng` and the JSON unchanged; a token scan finds no `rand`, `chance`, `pick`, `shuffle`, `.rng`, `Math.random`, `Date` anywhere in `knowledge/**`; (d) Exact mode and `own:` keys return `exact: true`, `mid === truth`, conf 3; (e) `mergeReadings` of two .2 reads is .1414, never under `SD_MIN`; `agedSd` grows with the square root of age; (f) 100x truths up to 1e15, 0, -1, NaN and Infinity give finite fields; (g) the talent and `hasMainCharacter` multipliers apply to the right kinds only. `knowledge-format`: the word ladder per unit and conf, rounding, `lo < hi`, `asOf` only at 2 or more years, no dash characters, every `words` at most 40 characters.
2. Change: the files above.
3. Checks: `tc`; `vt22 test/knowledge-estimate.test.ts test/knowledge-format.test.ts test/world-streams.test.ts test/architecture.test.ts test/layers.test.ts test/layers-domains.test.ts`.

**Proves.** Honest, stable, pure, bounded (the first three of the lead's list). **Size.** 810 source, 700 test. **Risk.** The log scale hides sign: keys that can be negative (growth) use `score` or `odds` until a later row says otherwise.

---

### R3-H3 (H.1): the `flags.know` record

**Lane** main. **Depends** R3-H2. **Goal.** What the player researched is kept, owner-stamped, bounded and validated, and `know` uses it.

**Files.** Create `src/game/knowledge/record.ts`, `test/knowledge-record.test.ts`. Modify `src/game/knowledge/estimate.ts` (`know` passes `storedRow(g, key)` as `row`), `contract.ts`, `src/game/world-flags.ts:87` (`'know'` into `PERSONAL`).

**Interfaces.** `flags.know = { v: 1, o, k: Record<key, row>, d?: 0..3, h?: 0..20, sy?: year }`. `o` is the owner stamp (decision 4). A row is one string `mid|sdPermille|year|src[+src]` (each field strictly parsed; mid at most 9 significant digits; a row that fails reads as absent); the sources listed are the ones merged in that row's year. Rules: at most `KNOW_LIMITS.keys` (120) rows, kept stalest-first-out (ties by key); a row older than 12 years, or stamped after `g.year` (no foresight, and a Time Machine jump back), reads as absent; a record whose `o` is not the current owner reads as null. `learn` merges inverse-variance with the aged row, refuses a (src, year) already in the row (returns null: repeat buys never average), sets `y` and `src`, and writes in place (`flags` is an inplace core slice). `widen` multiplies sd by `factor` (default 2, cap .8). `readKnow` never writes. The key is read through `const KNOW_FLAG = 'know'` so the flags scan classifies it.

**Steps.**
1. Red: (a) hostile `know` values (a number, an array, 500 rows, `__proto__`, NaN fields, a 1 MB string, wrong owner, rows from year `g.year + 3`) read as null or a trimmed record and never throw; (b) the cap and the prune order; (c) `learn` twice with one source in one year changes nothing the second time; across two years it merges and sharpens; (d) `know` with a stored row at 12% shows `conf 2` where the passive read shows 1, and the band still holds the truth 77% to 83% over 2,000 draws; (e) a real `continueAsChild` on a life with a populated record drops `know` (the personal-keys case at `test/world-flags.test.ts:202` covers the key too, once it is classified); a Time Machine snapshot round trip keeps it; `test/fixtures/save-v5.0.0-heavy.json.gz` loads with the key absent and plays 5 years; a 20-year default life never creates `flags.know`; (f) 120 rows are at most 400 JSON nodes; a JSON round trip is equal; (g) `storedEstimates` is pure under `deepFreeze` and ordered stalest first.
2. Change: the files above.
3. Checks: `tc`; `vt22 test/knowledge-record.test.ts test/knowledge-estimate.test.ts test/world-flags.test.ts test/heir-world-flags.test.ts`; `vt22 test/save-slices.test.ts test/old-saves.test.ts test/save-v3-schema.test.ts test/world-heirs.test.ts`.

**Proves.** RF4 for the record; RF2 for rows; RF3 (an heir starts clean). **Size.** 360 source, 420 test.

---

### R3-H4 (H.2): sources, prices, buying, illegal heat

**Lane** main. **Depends** R3-H3. **Goal.** Every way to sharpen a key exists as a priced source with a floor; buying books the fee, merges a reading, and illegal sources add heat.

**Files.** Create `src/game/knowledge/sources.ts`, `intel.ts`, `risk.ts`, `kinds.ts`, `test/knowledge-sources.test.ts`, `test/knowledge-intel.test.ts`. Modify `src/game/kernel/reasons.ts:151-161` (`intel: same('other', 'reports, analysts and investigators')` between `inputs` and `marketing`), `src/game/charts/books.ts:71-90` (`intel: 'Reports and analysts'`), `docs/LEDGER.md` (a row), `test/ledger.test.ts:796-797` (NAMES plus `'intel'`, 63 to 64: a moved test, with a row in `moved-tests.md`), `test/stream-tap.ts:149` (row `'intel.risk'`: slices `character`, `flagsPersonal`, `text`; `driven: true`), `test/stream-isolation.test.ts:71` (driver `(g) => void hazardOf(g)`), `test/ceiling-list.json` and `test/ceiling-kit.ts` (entries `intel-floors`, `intel-price`, `know-keys`).

**The table** (`SOURCES`, price in constant dollars at tier 1, one country, wealth 1).

| id | kind | base sd | floor | price | reads | notes |
|---|---|---|---|---|---|---|
| `own` | free | .45 x (1.5 - smarts/100) | .25 | 0 | not private | `useYearAction(g, 'intel.own', 3)` |
| `news` | free | .30 | .20 | 0 | any | `ingestSignal` |
| `press` | sub | .30 | .20 | 1,200 | mkt, cmp, riv, eco, pol, sec | a year of a trade title |
| `report` | once | .18 | .12 | 9,000 | mkt, riv, cmp, eco | |
| `analyst` | engage | .12 | .08 | 30,000 | mkt, riv, cmp, val, sec, fund | |
| `diligence` | deal | .05 | .03 | the greater of 8,000 x wealth and 2% of the deal | val, cmp, cand | the `ddCost` rule |
| `investigator` | once | .14 | .10 | 15,000 | riv, cand, ppl | legal |
| `informant` | illegal | .10 | .07 | 6,000 | riv, cmp, mkt | heat 3 |
| `hacker` | illegal | .07 | .05 | 20,000 | riv, cmp, val, cand | heat 6 |
| `desk` | standing | .14 | .10 | 0.6 x analyst | as analyst | only through the dial (H5) |

`price(src, scope, country) = round100(base x [1, 2.2, 4.5][tier - 1] x (1 + .25 (countries - 1)) x clamp(country.wealth, .3, 1.5))`: scope and country wealth, never the buyer's cash. `readingSd(src, { quality, spend, talent })` is `base x (1.5 - quality) x (spend / ref)^-0.35`, times .8 on a talent key, never below `floor`. `buyIntel` checks, in order: fog mode, era, the provider's truth, prison for an illegal source, a key already read this year (all skipped means "You already have this year's reading", nothing booked), cash; then `spend(g, price, { reason: 'intel', token: 'intel:<src>:<year>:<keyhash>' })` (illegal: reason `bribe`), a reading `apply(truth, sd, zOf(g, key, year, src))` per key, `learn`, and one `pickLine` log line of at most 90 characters (3 or more variants). Heat: `risk.ts` keeps `rec.h` (0..20, +3 informant, +6 hacker); `hazardOf(g)` is pure (`outcomeStream(g, 'intel.risk', g.year, 'you')`, `p = min(.5, .05 + .06 h)`, only when `h > 0`); `settleHazard(g)` is idempotent by `rec.sy`: a hit adds a `CrimeRecord` `{ crime: 'Corporate Espionage', caught: false, convicted: false }`, `wantedLevel + 2` (cap 5), `notoriety + 8`, `karma - 4` and a bad-tone notice (the existing yearly crime step then arrests, `crime.ts:3872`); `h` halves either way. No false data from a source (open question 3).

**Steps.**
1. Red: floors exactly .20, .12, .08, .03 (illegal at least .05), and 100x spend never goes below one; price equal at 1x and 100x `character.money`, rising with tier, countries and country wealth; the second purchase of a source for a key in one year is refused, money and JSON unchanged; two fresh games give the same reading, another year another; research pays (mean `|mid - truth| / truth` over 200 keys falls after a report) and the post-source band holds 77% to 83%; `own` stops after 3 uses; no cash, Exact mode and prison refuse without a write; `checkLedger(g).ok`, one `intel` flow to `pool:other`, a replayed token books nothing; `hazardOf` is pure (rng and JSON unchanged), `settleHazard` twice in one year equals once, a hit leaves an uncaught record and `wantedLevel` up; `kinds` rejects a different def for a taken kind.
2. Change: files above. Tests that moved: `ledger.test.ts` (reason count), with its row.
3. Checks: `tc`; `vt22 test/knowledge-sources.test.ts test/knowledge-intel.test.ts test/ledger.test.ts test/money-ratchet.test.ts`; `vt22 test/ceiling-list.test.ts test/ceiling-probe.test.ts test/stream-isolation.test.ts test/world-acceptance.test.ts`; `vt22 test/voice-guards.test.ts test/world-streams.test.ts`.

**Proves.** Floors, no averaging, honest fees, price independent of wealth, D14 (illegal intel with real risk). **Size.** 800 source, 650 test.

---

### R3-H5 (H.2): Look closer, the Briefing hub, standing orders, the module

**Lane** main. **Depends** R3-H4, R3-E1 (the effort hooks). **Goal.** The player can see what they know, sharpen it, keep it fresh on a budget, and the module is registered.

**Files.** Create `src/game/knowledge/look.ts`, `briefing.ts`, `standing.ts`, `module.ts`, `test/knowledge-hub.test.ts`, `test/knowledge-yearly.test.ts`. Modify `src/game/modules/index.ts:14-20` (import `knowledgeModule`, list it first so ids stay ascending), `test/hub-entry.test.ts:22` (a `['knowledge/module', ...]` line), `test/kernel-menus.test.ts:89-93` (orders become `[10,20,30,40,45,50,60]`, the id list gains `intel.briefing`; a moved test, with its row), `test/fixtures/kernel-parity.json` (re-record: the hook list gains `knowledge` in `close`), `contract.ts`.

**Interfaces.** `knowledgeModule`: `{ id: 'knowledge.core', layer: 3, yearly: [{ seam: 'aging', phase: 'close', order: 20, run: yearlyKnowledge }], menus: [{ path: 'assets.money', order: 45, build: () => [intelBriefingMenu] }] }`. `lookCloser(g, { id, keys })`: null in Exact mode, with no provider among the keys, or when every offer is blocked; else a group "Look closer" (emoji 🔎) whose children are one action per offer: label the source, subtitle `<price> · sharpens ±25% to ±12%` (at most 70 characters), `disabledReason` (cash, already read, era, prison), `confirm` for an illegal source ("It's illegal. If it comes out, expect trouble."), `run` calls `buyIntel`. The hub (`id: 'intel.briefing'`, visible when not Exact and a record exists, or when the dial or heat is above 0): a heading, one info row per stored estimate (stalest first, at most 12 and a "N more" row) with `conf` and `asOf`, a "Refresh" action per row (the cheapest unblocked offer), "Standing orders" (a 0 to 3 slider with a live caption: 1 the press for every tracked key, 2 an analyst for the 3 stalest, 3 the desk for 8; yearly cost from scope), and a heat row in words. `yearlyKnowledge(g)`: returns at once for the dead or with no record; idempotent by `rec.sy`; prunes; runs the orders (fees through `buyIntel`'s path, a lapse logs once and does not charge); then `settleHazard`. It draws nothing outside `risk.ts`.

**Steps.**
1. Red: `lookCloser` is null in Exact mode and for keys with no provider, a group with the right subtitles otherwise (register a `test` kind); buying changes the hub row (text, `conf` 0 to 2, `asOf` after 2 years); the hub is hidden in a default life, in Exact mode, and shown after the first `learn` or with orders set in Exact mode; stalest first; Refresh books once; orders at levels 0 to 3 refresh the right keys and book fees once, and a second `yearlyKnowledge` in a year leaves the JSON equal; the yearly fee of the same orders is equal at 1x and 100x wealth; a poor player lapses with one log line; `deepFreeze` plus `renderAll` over the hub finds no failure; the module registers with ascending ids and a unique entry.
2. Change: files above; record the fixtures under Node 22 with `RECORD_KERNEL_PARITY=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/kernel-parity.test.ts`, and say why in the commit and in `moved-tests.md` (a new yearly hook and a new menu row are deliberate changes of the pinned order).
3. Checks: `tc`; `vt22 test/knowledge-hub.test.ts test/knowledge-yearly.test.ts test/kernel-menus.test.ts test/hub-entry.test.ts`; `vt22 test/kernel-parity.test.ts test/kernel-registry.test.ts test/kernel-acceptance.test.ts test/golden-digest.test.ts`; `vt22 test/layers.test.ts test/layers-domains.test.ts test/nav-sections.test.ts test/world-flags.test.ts`.

**Proves.** The Look closer row and the Briefing hub; D14 yearly hazard; default lives unchanged (golden digest green). **Size.** 650 source, 500 test. **Risk.** `kernel-parity.json` moves for every track that adds a hook; the lead re-records after the merge.

---

### R3-H6 (H.1, H.2, H.3, H.13): acceptance sweep, probes, docs

**Lane** main. **Depends** R3-H5. **Goal.** The roadmap's information acceptance holds as one set of tests, and the track is documented.

**Files.** Create `test/knowledge-acceptance.test.ts`, `docs/KNOWLEDGE.md` (what the player sees, the rule table, the sources, the mode, how a screen calls `know`, how to add a key kind). The probes are test code; no source file is added. Modify `test/knowledge-kit.ts` (helpers), `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md` (final check of its rows).

**Steps.**
1. Tests (written to run green on the merged lane, red if any piece is removed): (a) coverage 77% to 83% over 10,000 draws for passive reads, for each legal source, and for merged and decayed rows (6 cases); (b) same source twice: for every source and 200 keys the reading is equal and the repeat buy changes neither money nor JSON; (c) no `g.rng` in a read: a fog life at age 40 with a company and a record, frozen with `deepFreeze`, `renderAll(g, log)` finds nothing and `g.rng` is unchanged; (d) no foresight: a spy on the engine readers (the pattern of `test/foresight-scan.test.ts`, `vi.mock` of `invest/engine`) while the hub, every Look closer group and every `buyIntel` run asks for no year after `g.year`, with and without the Investing talent; (e) money: after buying every source `checkLedger(g).ok` and the flows of `intel` and `bribe` net to zero; (f) long run: 100 years with orders at level 3 and 30 registered keys leaves the record at most 120 rows and 400 nodes and the yearly fee flat from net worth 1x to 100x; (g) the simulation never reads the mode: the same seeded life played in Exact and in Realistic ends with equal JSON; (h) `src/game/knowledge/` holds at least 8 files, `test/knowledge-fence.test.ts` saw them (it exports nothing; the count is asserted here by a directory listing); (i) `docs/KNOWLEDGE.md` has no U+2013 or U+2014 and names every export of `contract.ts`.
2. Checks: `tc`; `vt22 test/knowledge-acceptance.test.ts test/knowledge-fence.test.ts`; then the guards one group at a time: `test/world-flags.test.ts test/save-slices.test.ts test/old-saves.test.ts`, `test/foresight-scan.test.ts test/analyst-tip.test.ts test/replay-purity.test.ts`, `test/architecture.test.ts test/layers.test.ts test/layers-domains.test.ts test/seed-pins.test.ts`.

**Proves.** The track's rows of the acceptance table. **Size.** 130 source (the kit and docs count as source), 650 test.

---

### R3-H7 (H.2): the confidence chip

**Lane** ui. **Depends** none. **Goal.** `conf` and `asOf` on a row draw three dots and, at 2 or more years old, "as of 2023".

**Files.** Create `src/ui/components/ConfChip.tsx`, `test/conf-chip.test.ts`. Modify `src/game/types.ts:788` and `:821` (`asOf?: number` with a comment: "the year of the reading"), `src/ui/components/menuModel.ts:78` (`nodeConf(node, g)` returns `{ conf, asOf }` or null: `conf` must be an integer 0 to 3, `asOf` an integer not after `g.year`, shown only at 2 or more years back), `src/ui/components/MenuList.tsx` (info rows at 359-377 draw the chip after the text; `MenuRow` at 429-480 draws it after the subtitle; chart rows draw none), `src/ui/styles/nav.css` (end: `.conf-chip`, three `i` dots, filled ones `--action-blue`, empty ones `--border`, the text `--muted` at 12px).

**Interfaces.** `<span class="conf-chip" role="img" aria-label="Confidence: a good estimate, as of 2023">` with three `<i>` and an optional `<span class="conf-asof">as of 2023</span>`. Labels by conf 0 to 3: "a rough guess", "a fair estimate", "a good estimate", "close to exact". Rows without `conf` render exactly as before.

**Steps.**
1. Red: markup for conf 0 to 3 has that many filled dots and the label; `asOf` shows only at `g.year - asOf >= 2`; conf 7, '2', NaN, -1 and a future `asOf` draw no chip and do not throw; a node with no `conf` renders the same markup as before (compare to a stored string); chips never appear on chart rows; no dash characters.
2. Change: the files above.
3. Checks: `tc`; `vt22 test/conf-chip.test.ts test/a11y-roving.test.ts test/talents-ui.test.ts test/ladders-wiring.test.ts`; `vt22 test/books-menu.test.ts test/nav-sections.test.ts test/nav-needs.test.ts test/ui-contrast.test.ts`.

**Proves.** The chip. **Size.** 170 source, 200 test.

---

### R3-H8 (H.13): market signals and the market read

**Lane** tips. **Depends** none. **Goal.** The Financial News gains one analyst line that cites a real present signal, with a confidence hedge and no direction; the free tip and the gut are untouched.

**Files.** Create `src/game/invest/signals.ts`, `test/market-read.test.ts`. Modify `src/game/investments.ts:84` (import) and `:2203-2204` (after `if (tip) lines.push(tip)`: `const read = marketRead(g, l.info); if (read) lines.push(read)`). Do not edit `invest/instinct.ts` or `seededTip`.

**Interfaces.**
```ts
export type SignalKind = 'wave' | 'shock' | 'tilt'
export interface MarketSignal { kind: SignalKind; strength: 1 | 2 | 3; label: string; year: number }   // year <= g.year
export function marketSignals(g: GameState, info: ExInfo): MarketSignal[]   // pure, strongest first
export function marketRead(g: GameState, info: ExInfo): string | null       // one line, at most 110 characters, or null
```
Signals read this year and last only: `wave` is the largest sector move that `waveNews` finds (`invest/wave-stocks.ts:219`; 3%, 6%, 10% give strength 1 to 3), `shock` is `shocksThisYear(g)` (`invest/shocks.ts:338`) with a move of 15% or more, `tilt` is the share of this year's listed stocks that rose (at most .30 or at least .70, strength 2 at .20 and .80). The line names a sector or a wave, never a company, and carries 3 variants per kind picked by a hash of life, year and kind. It hedges ("Worth watching, nothing more.") and holds none of buy, sell, strong, overvalued, will rise, will fall. Direction stays the tip's: this keeps `test/analyst-tip.test.ts`'s coin-flip band untouched.

**Steps.**
1. Red: a life with a live wave gets a line that names the wave, one with a shock names the shock, one with neither and a middling year gets none; the line is pure and deterministic (`g.rng` and JSON unchanged on a frozen state); a spy on `exchangeYear`, `cryptoYear`, `goldYear`, `fxYear` over 40 seeds by 12 years asks no year after `g.year` (copy the mock from `test/analyst-tip.test.ts:10-45`); the text rules (length, no `NaN`, no verbs of direction, no real company name, no dash characters).
2. Change: files above.
3. Checks: `tc`; `vt22 test/market-read.test.ts test/analyst-tip.test.ts test/foresight-scan.test.ts test/wave-stocks-surface.test.ts`; `vt22 test/investments.test.ts test/stocks-real.test.ts test/r2-anachronism-mexico.test.ts test/talent-investing.test.ts`.

**Proves.** Signal-based, present-only, no-direction notes. **Size.** 230 source, 320 test.

---

### R3-H9 (H.13): the foresight fence for knowledge

**Lane** fence. **Depends** none. **Goal.** The D12 fence covers the new code: no source of knowledge reads the market, and the gut stays behind the talent.

**Files.** Create `test/knowledge-fence.test.ts`. No source change.

**Steps.**
1. Red, with synthetic sources the way `test/foresight-scan.test.ts` does it (`toSource` from `test/scan-kit.ts`): a file at `src/game/knowledge/x.ts` that imports `../invest/instinct`, imports anything from `../invest/`, or calls a reader named in the foresight test's `WATCHED` block (the test reads that key list from the text of `test/foresight-scan.test.ts` by regex, so the lists cannot drift) is flagged; clean sources are not. Then the real tree: every file of `src/game/knowledge/**` passes (a directory listing, so the test is meaningful once the lane merges); `marketInstinct` is null for 60 states (ages 0 to 90, six countries, dead, no talent) and non-null for an adult with `Investing`; the files that import `invest/instinct` are exactly the four of the foresight test's `INSTINCT_IMPORTERS`, and none of `src/game/advisors/**`, `business/fund-*.ts`, `business/competition-*.ts` is one.
2. Checks: `tc`; `vt22 test/knowledge-fence.test.ts test/foresight-scan.test.ts`.

**Proves.** RF2 for the new code. **Size.** 0 source, 220 test.

---

## 4. Open questions

1. Is "tilt" market breadth (as H8 reads it) or a macro cycle phase? Breadth needs no new reader; a cycle phase would read `economicCycle`.
2. Should an heir keep company-bound records at age +5 (design 6.3)? This plan resets all of `know`; a later row in the heir table can carry `mkt:` and `riv:` keys for companies the family still owns.
3. Should an informant sometimes feed false data (design: "turned-source false data")? It breaks "a shown band holds the truth 80% of the time" for that source; left out until the owner says how to state its band.
4. The fee payee is `pool:other`; the design says "a real consultancy entity". Area A has no such firm; switch the counterparty in `buyIntel` when one exists.
5. Should the standing-orders dial follow the Effort posture (ambition's yearly budget) instead of its own 0 to 3? Kept separate so the two tracks do not depend on each other.

---

## Cross-check amendments (2026-10-22)

These override the text above. Numbered decisions are in `00-crosscheck.md` section 6.

- **B1 R3-H2 (D20).** Add unit `'delta'`: a signed money amount on a linear scale, absolute sd = `sd * opts.scale` (`scale` required, normally the company's revenue or `|truth|`), words with a sign ("roughly +$20M to +$45M"); used by forecasts. Rule rows for the Fog track, so Fog edits no file of this track: `scn.*` (delta, sd0 .30, drift .15, Business), `hint.*` (unit from `opts.unit`, sd0 .20, drift 0, talents by kind), `cmp.score` (score, sd0 .20, drift .10, Business), `riv.tech` and `riv.line` (score, sd0 .30, drift .10, Business). Key shape is `<kind>:<id>[:<id>]:<field>` with at most two ids and 64 characters; an owner whose natural id is longer hashes it (`hashKey(...).toString(36)`). `KeyKind` gains optional `revealedBy(g, key): readonly string[]` (the Effort `Task.field` values whose research sharpens the key). `know`/`estimate` take no `sd0`, `src` or `sdMult` option: the table decides, a stored row decides the source, `exp` is the exposure.
- **B2 R3-H4 (D19, D21).** Add `takeReading(g, src, key, truth, opts?: { sd?: number }): Estimate | null` to `contract.ts`: a read whose fee the caller already paid (applies `readingSd(src)` floored at the source floor, merges with `learn`, refuses a (src, year) already merged, books nothing, logs nothing). Add source `lab` (free, floor .15, reads `riv.*`, `mkt.*`, `cmp.*`; reachable only through `applyReveals`). Extend `reads`: `press` gains `scn`; `report` and `analyst` gain `scn` and `odds`. The illegal-intel hazard (heat, `hazardOf`, `settleHazard`, stream `intel.risk`) stays here and is the only one in R3; Fog's R3-G6 is removed.
- **B3 R3-H5 (D8).** Depends also on R3-E1 (the effort hooks). `knowledge/module.ts` calls `bindRevealed(applyReveals)` at load (bare call). `applyReveals(g, reveals)`: for each stored row whose kind lists `reveal.field` in `revealedBy`, `takeReading(g, 'lab', key, truth)` with `exp = reveal.strength`; at most 12 rows a call; no draw outside the hashed normal. Test with a registered `test` kind: a reveal narrows the band, the same (src, year) does not narrow it twice, Exact mode ignores it, a replayed `step` does not call it. About +110 source (H5 is about 770).
- **B4 R3-H1 and the kit.** Fog tests flip the mode with `withInfoMode(m, fn)` or `inFog(fn)` from `test/knowledge-kit.ts` (the override beats the setting), never with `setInfoMode`. Say so in the kit header.
- **B5 R3-H6.** The sweep also asserts a rule row exists for every key family the Fog track registers (`riv`, `mkt`, `scn`, `cand`, `cmp`, `sec`, `val`, `odds`, `hint`) and that `registerKeyKind` with the same def twice is fine and a different def for a taken kind throws.
- **B6 Hot files.** `modules/index.ts`: `knowledgeModule` goes first beside `effortModule`, sorted by id (`effort.you`, `knowledge.core`); trivial merge. `world-flags.ts` PERSONAL gains `'know'`. `test/fixtures/kernel-parity.json` is re-recorded at the merge, not by hand (`00-crosscheck.md` section 4). The `moved-tests.md` file exists; append under `## knowledge`.
- **B7 R3-H8 and R3-H9.** H9 is the one owner of the Investing gut fence and the importer list (Fog's `test/gut-fence.test.ts` is dropped, D24). H8 edits `investments.ts` in the news-line hunk only; Fog's R3-G9 edits the `offerNode` hunk; neither touches `invest/instinct.ts` (the foresight scan pins its gate at line 177).
- **B8 Door (rule c).** `knowledge/contract.ts` also re-exports `isExact`, `infoMode`, `withInfoMode`, `setInfoOverride` and the type `InfoMode` from `mode.ts`, `registerKeyKind` and the `KeyKind` type, `takeReading`, and `storedEstimates`. Another domain (Fog, Effort migration's menus, the UI) imports nothing else of this folder; an import of `knowledge/mode.ts` or `knowledge/estimate.ts` from outside counts as a domain pair and fails `layers-domains`.
