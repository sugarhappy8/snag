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
