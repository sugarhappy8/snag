# R2 wave 0: tests that moved
Rebaseline commit: 20071a3. Recipe: wave0.md, task R2-C. Totals: 9 files, 15 tests.

| file | test | kind | before | after | why |
|---|---|---|---|---|---|
| test/anachronism.test.ts | anachronism lint (offline lives born 1900-1995) > never mentions things before t | bug | 1945 br: 'on live TV' debate line, 'televised speech' log | politics.ts gates TV and radio by era; lint unchanged, 0 findings | politics.ts spoke TV in every year; new text draws reached lines the old draws never hit |
| test/currency-life.test.ts | whole lives > write the birth year in the new life’s currency, whatever life was | seed | seed: 2 and seed: 1 (not red) | findSeed(British birth in 2000, parent founds a company with savings) | not red; the file needed findSeed, so every pin of it goes; the search lands on seeds 1 and 2 |
| test/currency-life.test.ts | whole lives > show a Japanese life in yen, never in dollars | seed | playLife(21, jp, 1975, 35) | findSeed(a Japanese life that stays in Japan for 35 years) | text draws left g.rng; life 21 now emigrates to the US in 2001, where dollars are right |
| test/deeptech-fusion.test.ts | fusion: twenty-five years of ordinary play > starts its first program, raises Se | seed | SEEDS = [3, 11, 70, 71] (Series C in 7 of 16 labs, needs 8) | findSeeds(US fusion lab raises Series C under eager play, 4) | text draws left g.rng; Series C is a coin flip (52 of 104 labs), so the cohort is found, not pinned |
| test/deeptech-fusion.test.ts | fusion: twenty-five years of ordinary play > builds the pilot plant in a rich ma | seed | seeds [3, 11, 70 to 79] (not red) | seeds 1 to 12, a plain range | not red; the pinned list is replaced so the file keeps no pinned seed list |
| test/deeptech-fusion.test.ts | fusion: twenty-five years of ordinary play > with only the general manager’s yea | seed | SEEDS = [3, 11, 70, 71] (not red) | the found cohort of the ladder test | not red; it shares the found cohort of the ladder test, so no pinned list is left |
| test/fame-career.test.ts | podcast audience ceiling > leaves the early years alone: the same audience and t | number | seed 1 listeners 7,718,721, ads 3,892,655 (seeds 1 to 5) | seed 1 listeners 2,070,070, ads 1,651,102 (seeds 1 to 5) | text draws left g.rng; the old values return to the digit when pickLine draws g.rng, the cap never binds |
| test/localize-life.test.ts | growing up and growing old > remembers the right school dance and runs off somew | seed | local(id, seed): lifeId test-life for all 400 seeds | local() sets g.lifeId = 'test-life-' + seed | text draws left g.rng and key on lifeId; 400 seeds shared one id, so one crisis line, never the prom one |
| test/localize-life.test.ts | local health care > dials the local emergency number and calls the ER the ER onl | seed | local(id, seed): lifeId test-life for all 40 seeds | local() sets g.lifeId = 'test-life-' + seed | text draws left g.rng and key on lifeId; 40 seeds shared one id, so one ER line, never the 911 one |
| test/music-legacy.test.ts | music legacy pin > pins five legacy years of a hit with a release, royalties, aw | number | seed 3: popularity 72, renewal $692,000 (hit block) | seed 3: popularity 73, renewal $709,000 (hit block) | text draws left g.rng; award and review picks no longer move the rolls, the old golden returns with g.rng picks |
| test/probe-life.test.ts | probeLife > builds an adult with the requested companies and a populated previou | seed | seed: 7 (not red) | findSeed(alive three years into two companies) | not red; replaced so the file keeps no seed pin |
| test/probe-life.test.ts | probeLife > keepAlive carries a founder past the untreated illness that kills th | seed | seed: 226 (appendicitis at 32, dies at 35) | findSeed(dies of an untreated illness, lives with keepAlive) | text draws left g.rng; seed 226 no longer dies untreated; the search needs a 120 s timeout |
| test/report-live.test.ts | built as lived, opened in today money > prints the market note in the prices of | bug | unmoney read only -$ so +$6,558 threw | unmoney reads +$ and -$; assertion unchanged | a gain is in the top 3 drivers and formatSigned prints +$; the test helper read only -$ |
| test/report-live.test.ts | built in today money, opened as lived > prints the market note in the prices of | bug | unmoney read only -$ so +$8,577 threw | unmoney reads +$ and -$; assertion unchanged | a gain is in the top 3 drivers and formatSigned prints +$; the test helper read only -$ |
| test/social-delete-era.test.ts | social account deletion era text > keeps both deletion notices era-safe before w | seed | g.rng = seed varies the notice; 16 lives give 2 notices | g.lifeId = delete-era-<seed> per life; assertion unchanged | text draws left g.rng; makeTestGame has one lifeId, so all 16 lives drew the same notice |

## Bugs found
| file | what | fixed in |
|---|---|---|
| test/anachronism.test.ts | politics.ts speaks TV in every year | src/game/special/politics.ts |
| test/report-live.test.ts | helper unmoney rejected the + sign formatSigned prints on a gain | test/report-live.test.ts (helper) |

## Pinned numbers moved by the other tracks
Written at the integration (R2-P11) from the commit messages of the merged tracks, each line checked against the merged tree. Wave 0's rows are the table above; nothing here is a seed pin.

Ledger-world
- R2-L2 fix (9156b02): the lending cap rises from 2.5e9 to 1e12 after the R2-L5 probe saw a founding loan of 40.5e9. The cap pin and the clip steps in test/ledger.test.ts (1e9 and 2e9 become 4e11 and 8e11), the clip tests of test/ledger-wrappers.test.ts (5e9, 4e9 and 3e9 become 2e12, 4e12 and 3e12) and the mint-caps text of test/ceiling-list.json move with it.
- R2-L3: none. The plan said erodeCash rounds cash to whole dollars and moves the `character` digests; the code does not, because whole-dollar rounding broke all 18 tests of test/korean-cash.test.ts (idle cash held to 0.005 local units). The books take the whole dollars of the change and the cash keeps the engine's arithmetic, so no canary slice moved.
- R2-L4: test/money-ratchet.json becomes version 2 (537 sites in 134 files, reasoned or not), and the floor of 100 files in test/money-ratchet.test.ts becomes "not empty, and core.ts and cash.ts are in it", because the seven migrations drive the list down by design.
- R2-L6: none. The same-year house resale is capped at the sellers' spread and draws nothing; no house flips in its year in the 12 parity lives, so no pinned number moved.
- R2-L13: test/investments.test.ts "taxes realized gains" is renamed and reads the tax from the tax.capgains row at the capital gains rate (the plan called this line 294; it is line 296 now), and "overflowed acquisition settlement" reads the proceeds from the trade.sell row less the tax withheld. test/hedge-fund.test.ts "take out pays the share and taxes the gain" and test/hedge-story.test.ts: the gain no longer enters taxable income or earns a taxesPaid credit. A bond redeems at its eroded par.
- R2-L15 and 23a31c5: two tests of R2-L1 in test/world-state.test.ts: an heir's world is the carried world plus the index shards and the ledger (not an equal copy), and the heir no longer has an absent world.
- R2-L19: the `assets` column of test/fixtures/r2-parity.json for the four founder lives (the company tally is new optional state in assets details). Nothing else moved.

Save
- R2-S2: ten tests pinned SAVE_SCHEMA at 2 as a release statement and now say 3 (devices-save, ai-bench-save, sector-state, model-state, music-state, silicon-state, wave-stocks-story, notice-acceptance, tech-waves-wiring, inbox-state), and test/save-store.test.ts uses SAVE_SCHEMA + 1 for a later version (line 1221 holds the second use). Only the literal and the test name changed.
- R2-S6: test/save-store.test.ts "gives the main save the room the Time Machine's localStorage snapshots take" (line 1234) no longer asserts that the stored record equals JSON.stringify(game), because the record is a head now; it asserts the save lands once room is given back and that loadGame returns the same JSON.
- R2-S7: three assertions of test/save-hydrate.test.ts said the IndexedDB record is the plain migrated JSON after the import; the import stores a head with chunks now, so they read the game back through the chunks and still compare it to the migrated JSON exactly.
- R2-S9: the world frame count of test/time-machine.test.ts is TIME_MACHINE_STOPS (it was one more; lines 223 to 226 say why). test/world2-supply-world.test.ts no longer expects history frames. WHOLE_FLAGS_SITES drops save.ts.
- R2-S10: previous holds the focus countries and at most 40 (test/probe-life.test.ts, test/save-v3-schema.test.ts), history holds HISTORY_YEARS = 16 rows (test/living-economy.test.ts line 144, test/world2-trade-invariants.test.ts line 158, test/world2-performance.test.ts line 95), and sv['flags.worldEconomy'] is 2 in test/save-codec.test.ts. test/fixtures/r2-parity.json and test/fixtures/kernel-parity.json moved on the economy column.
- R2-S12: the synthetic worlds of test/save-codec.test.ts, save-slices.test.ts, save-shapes.test.ts and time-machine-v3.test.ts are valid ones now (version 1, shards registered), because the world slice reads through the world's readers.

Kernel
- None. Its parity fixture test/fixtures/kernel-parity.json did not move in R2-K9 to R2-K12.

Platform and the merge
- R2-P11 re-recorded test/fixtures/r2-parity.json on the merged tree (economy by R2-S10, assets by R2-L19, the shown-only text digest by R2-P8 to R2-P10; `rng` and every other slice unmoved) and test/fixtures/kernel-parity.json (assets by R2-L19 and the text digest; the Save branch recorded it before the Ledger tally existed).
- R2-P11 regenerated test/fixtures/golden-digests.json once, under Node 22: world is new (the ledger and index shards, all 15 lives), assets gain the company tally (founder lives only), economy prunes previous and history (all 15 lives), and character, people and flagsPersonal moved only because the golden kit now digests a float to 9 significant digits (the lead's decision 31). `rng` did not move.
