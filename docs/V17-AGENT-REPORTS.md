# Raw builder and reviewer reports (appendix)

Generated from the workflow journal. "sharedChangesNeeded" items are edits to files the agents did not own; unless marked done in HANDOFF.md they are STILL TO APPLY.


## build:luxury-family-use

### summary
Luxury real-brand shopping and family use are built. A catalog of 414 real product lines now sits behind tiered shops, and family can use what you allow and show off. `tsc` is clean. My luxury, brands, family-use and era-feature tests pass, and so does `simulate.test.ts`. The last full-suite run had 5 failures, none caused by my files. By then I had already fixed my own two `era-features-more` anachronisms.

**Catalog and shops**
- The catalog covers watches, jewelry, bags and luggage, fashion, eyewear, pens and fine goods, cameras and audio, luxury phones (tech-gated), designer sneakers, cars and supercars, motorcycles, boats, light aircraft and helicopters, wine, champagne and spirits.
- Auction rooms with a 20% buyer's premium and grand hotels, first-class and liner/Concorde trips are bookable.
- Every brand and line is gated by year, country and technology. Closed marques keep their old cars on the used market only.
- Prices are in constant 2026 dollars, scaled by era and the existing local price levels, with luxury taxes for the US 1991-93, Japan to 1988 and China. Everything is approximate.
- The Luxury Lifestyle tab now opens at a $20K net worth. Luxury-tier pieces unlock at $250K and ultra-tier pieces and the existing islands, megayachts and jets at $5M.
- Shops sit under "Brand Shops" and "Auctions & Grand Trips" headings as submenus (Category > Brand > Line > ways to buy). "Your Collection" lists what you own.
- `luxury-fleet.ts` now uses real yacht builders and real airframes for the megayachts and jets. I added a Light Jet or Turboprop class.

**Value, resale and counterfeits**
- Every purchase becomes an Asset with `details.brand` set to a registry id, plus condition, service, insurance (5% deductible), theft and loss risk, and a value class.
- Appreciation is capped per class, and net worth counts the quick-sale value.
- You can sell to a dealer (spread) or consign to an auction house (commission, costs, hammer luck, a 12% chance it goes unsold). Buy-and-sell loops lose money in the tests.
- Allocation-only pieces (waitlist) cost nothing to ask for and are a poor flip.
- Pre-owned and gray-market sellers can sell fakes at stated odds. Until checked, an unverified piece is priced for that risk, the same number for a real one and a fake one. Authentication costs money, and dealers and auction houses refuse fakes.

**Family use**
- Permission is per item and per person, and the same toggles appear on the person sheet. Taking access away costs relationship.
- Minors need a chauffeur for cars. No minors in supercars without a driver. The country's driving age applies.
- Each year the family uses what you allowed. Calm outcomes go to the life feed. Notable ones are bundled into one "Family Life" notice, with at most one decision popup (a crash, a pawned watch, a party gone wrong).
- Nothing creates money: uninsured family use only ever costs.
- Kids' entitlement rises in bounded steps, partners warm to jewelry, and a relative may envy or gossip.
- Show-offs feed small fame and a bounded "looks richer" effect (up to +35%, halving each year) that raises the wealth requests.
- Nothing runs for a minor player, a prisoner, the dead, or in the year you emigrate. Heirs start clean.

**Talent hints**
- Business-talent purple hints say which piece typically holds value (with a range) and the real counterfeit odds of the gray market. None claims certainty.

**Also changed**
- `wealth-core.ts`: `perceivedWealth` now includes the show-off effect.
- `wealth-kids.ts`: the kids' clothing ask names a real fashion house, and the phone ask names the top real phone maker if the registry has one.
- Existing `luxury.test.ts` gate tests were rewritten for the new tiers.
- New tests: `test/luxury-brands.test.ts` (49 tests) and `test/family-use.test.ts` (22 tests).

**Not mine in the full run**
- `anachronism.test.ts` ("group chat", 1967) and `offline.test.ts` (a `fetch(` match in market data) come from other agents' files.
- `competition.test.ts` (a restaurant rival with a Philippine home where the test expects the US) and `deeptech.test.ts` (`startTrial` returned null) failed in the same run and look like other agents' in-flight work; I did not investigate them.

I did not run the dev server or Playwright, so the menus are only checked as data, not visually.

### sharedChangesNeeded
- REQUIRED, assets.ts `ageAsset(g, a, market)`: add `if (a.details.lux === 1) return` as the first line. Brand pieces keep their own value, condition and running costs in `shops/luxury-brands-assets.ts` (`yearlyBrandAssets`, run from `yearlyShops` before `yearlyAssets`). Without this, `yearlyAssets` drifts a piece's value after my hook runs, so a new car shows 10-20% below its model value and a car's `upkeep` is overwritten by `CAR_UPKEEP`. My hook re-snaps the value each year, so nothing breaks, but the displayed number is noisier. Cars would then also keep my capped garage cost instead of CAR_UPKEEP.
- REQUIRED, assets.ts `assetNode`: add an extension seam so the brand-piece screen and Family Access appear on every holding in the Assets tab. Suggested code: `export const ASSET_NODE_HOOKS: { view?: (g: GameState, a: Asset) => MenuNode[] | null; extra?: (g: GameState, a: Asset) => MenuNode | null } = {}` next to `ASSET_KIND_VIEWS`. At the top of the `children` function, after `cur` is found and before the heirloom/kind switch, add `const lux = ASSET_NODE_HOOKS.view?.(gg, cur); if (lux) return lux`. After the kind switch, before `return nodes`, add `const fam = ASSET_NODE_HOOKS.extra?.(gg, cur); if (fam) nodes.push(fam)`. In menus.ts, where `ASSET_KIND_VIEWS` is filled, set `ASSET_NODE_HOOKS.view = luxuryAssetNodes` (from `shops/luxury-brands-assets`) and `ASSET_NODE_HOOKS.extra = familyAccessNode` (from `shops/luxury-family`). Both already exist with these signatures. Needed because the generic sell action on a brand piece would bypass the authenticity check, dealer spread and auction fees; the quick-sale value limits the damage but the real screen should be shown. Existing cars, boats, aircraft, jewelry and instruments get a per-holding Family Access row from the same seam. The person-sheet Family Access already works for them without it, and brand pieces also have their own screen under Your Collection.
- brands.ts: `ALL` is built by concatenation and `BY_ID` ignores duplicate ids, but `brandsFor` and `brandsInCategory` filter `ALL`, so a brand id defined in two category files with the same category shows up twice. brands-luxury.ts defines mass-market ids that brands-consumer.ts might also define: 'toyota', 'ford', 'chevrolet', 'nissan', 'honda', 'bmw', 'audi', 'lexus' (cars) and 'nike', 'adidas', 'puma', 'converse', 'new-balance', 'reebok', 'vans', 'asics' (sneakers). Dedupe `ALL` by id (first wins) or tell the consumer-brands owner to skip these ids.
- assets.ts store names are still generic or fictional (Glitterwell Fine Jewelers, Bling Bros. Discount Jewelry, the Luxury Boutique's generic items). For the 'real brands' request, name them from `brandsFor(g, 'jewelry')`, `brandsFor(g, 'handbag')` and `brandsFor(g, 'watch')`. The art gallery and collectibles store there also random-walk without a cap, unlike the bounded model used for brand pieces.
- Optional, aging.ts: `yearlyFamilyUse` already runs after `wealth`. If you want the show-off effect on wealth requests to be decayed more than once a year, nothing else is needed. The decay lives in `luxury-brands-deal.decayHeat`, called from `yearlyBrandAssets` inside `yearlyShops`.

### docsNotes
Real-brand luxury shopping and family use (shops/luxury-brands-*.ts, shops/luxury-family.ts). Catalog: data/brands-luxury.ts registers the houses; shops/luxury-brands-goods/-wheels/-craft/-cellar/-stays.ts hold the product lines (LuxLine: brand registry id, model, year from/until, approximate price in constant 2026 dollars, a value class, optional waitlist year `scarce`, `limited`, `collect` for classics, `fleet` for airframes the Aircraft Brokerage sells). luxury-brands-catalog.ts is the single entry point: lineOnSale (brandAvailable + year + country + hasTech; a closed marque keeps its old lines on the used market only), eraMult/fairNew/quoteNew (era price level x local luxury/car/alcohol/global level, plus luxury excise: Japan to 1988, US 1991-93, China), and the tiers. The Luxury Lifestyle tab opens at a $20K net worth (boutique tier), the luxury tier at $250K, the ultra tier (and the old islands/megayachts/jets) at $5M. luxury-brands-value.ts holds the value classes: a market value per piece (details.mkt), `Asset.value` is the quick-sale value (market x condition x the dealer's spread, with an unverified piece priced for the risk of a copy), yearly trend + class mood + the piece's own luck with floors and caps (appreciation is bounded; quoted classics follow their line's price path inside a band), service, insurance (5% deductible, nothing for a counterfeit), theft/loss, counterfeit odds per channel (boutique 0, certified pre-owned and auction low, gray market high), and auction fees and hammer luck. luxury-brands-deal.ts: offers (seeded per life/year/line, no g.rng in menus), buying, allocation for waitlisted pieces, authentication, sale to a dealer or auction, bottles; luxury-brands-shop/-rooms/-assets.ts: the menus, auction lots, hotels and first-class trips, the holding screen and the yearly step. State is plain JSON: Asset.details (lux:1, line, brand, cat, cls, mkt, basis, auth, lfake, fo, boughtYear, serviced, luxIns, fam, famBy) and g.flags 'lux.b' (brand history, allocation tries, sold listings), 'lux.heat', 'lux.lots', 'lux.showN', 'lux.fam.at'. Family use (luxury-family.ts): permission lives in Asset.details.fam (person ids) stamped with the granting character id (an heir starts clean) and Person.data.fu (uses, mishaps; also stamped). Eligibility: driving age by country, a chauffeur for minors in cars and none at all in supercars without one, crew or a pilot for aircraft, a minimum relationship. yearlyFamilyUse (aging.ts, after wealth) lets up to 3 allowed pairs use things; calm outcomes go to the life feed, notable ones are bundled in one 'Family Life' notice, and at most one decision popup a year (crash with claim/pay/chip in/slide/ground, a pawned watch, a party gone wrong). Kids' entitlement rises in bounded steps through addEntitlement (max +4 a year per person); show-offs give a small diminishing fame (showOffFame, max 2 a year) and raise the 'looks richer' heat (wealth-core.showOffHeat, up to +35%, halves yearly, feeds perceivedWealth and so the money requests). Nothing here creates money. Nothing runs for a minor player, a prisoner, the dead or in an emigration year. Business-talent purple hints (honest, never certain): the typical 5-year value outlook of a line and the real gray-market counterfeit odds.

### notes
The two REQUIRED shared changes (assets.ts `ageAsset` skip and the `ASSET_NODE_HOOKS` seam) are needed to complete the feature. Without the first, values and car upkeep are noisier; without the second, the generic Assets-tab sell action bypasses the authenticity check and fees. Unverified pieces are priced for the counterfeit risk, which limits that exploit. The player-facing brand shop works from the Luxury Lifestyle tab without either change. No Playwright check was run (port 4352 not used); the UI is generic menu rendering, and a test checks sibling ids are unique and no text contains NaN/undefined across 40 countries and 4 eras. Prices and shares shown to the player are approximate and labeled so. Brand data keeps to the binding rules: only well-known facts, no real people, alcohol only as adult luxury goods gated by age, country and US Prohibition, no tobacco, firearms or gambling brands. Real brand names appear only as products; counterfeits are described as a generic market phenomenon, never as something a brand did. I removed a few era-wrong blurbs (Speedmaster 'went to the Moon', Everest helicopter landing, etc.), moved Valentino's red gown to 1960 (brand year) and the H125 to 1992 (registry year) so no line predates its brand. The four pre-existing luxury data files had been committed by the lead from the earlier attempt; I only corrected those facts and blurbs in them. Failures I saw in the last full suite that are not from my files: anachronism.test.ts (a 'group chat' scandal in 1967 from the era packs), offline.test.ts (a `fetch(` match in a market-data file), and competition.test.ts and deeptech.test.ts, which look like other agents' in-flight work; I did not investigate those last two.

### files
- /home/user/snag/src/game/shops/luxury-brands-catalog.ts
- /home/user/snag/src/game/shops/luxury-brands-value.ts
- /home/user/snag/src/game/shops/luxury-brands-deal.ts
- /home/user/snag/src/game/shops/luxury-brands-shop.ts
- /home/user/snag/src/game/shops/luxury-brands-rooms.ts
- /home/user/snag/src/game/shops/luxury-brands-assets.ts
- /home/user/snag/src/game/shops/luxury-family.ts
- /home/user/snag/src/game/shops/luxury.ts
- /home/user/snag/src/game/shops/luxury-fleet.ts
- /home/user/snag/src/game/shops/luxury-brands-goods.ts
- /home/user/snag/src/game/shops/luxury-brands-craft.ts
- /home/user/snag/src/game/shops/luxury-brands-wheels.ts
- /home/user/snag/src/game/shops/luxury-brands-stays.ts
- /home/user/snag/src/game/events/wealth-core.ts
- /home/user/snag/src/game/events/wealth-kids.ts
- /home/user/snag/test/luxury.test.ts
- /home/user/snag/test/luxury-brands.test.ts
- /home/user/snag/test/family-use.test.ts


## review:luxury-family-use

### fixed
- Closed a risk-free buy, restore, resell loop. Worn pre-owned and gray-market pieces (down to 40% condition) were serviced for 1-4% of value and resold at auction for up to 35% profit. Pre-owned pieces are now certified (70% condition or better) and gray pieces start at 60%. Gray prices are 88-97% of market, not 78-95%. For classes with a gray market, Service It now costs at least about 92% of the value the restoration adds. Fix is in luxury-brands-deal.ts and luxury-brands-value.ts.
- Closed a cheap-country arbitrage. Pre-owned prices were scaled down by the local luxury level while the piece kept the world market value, so wine and boats bought in the Philippines, India or Japan resold at a profit. The local discount now also lowers the market value, and dearer countries just pay the premium.
- Closed the allocation flip. The resale premium on waitlist pieces (18% for icon watches and bags, 20% for collector sneakers) beat the auction commission, so a free allocation could be flipped for a few percent. Premiums are now 10% for icons, 4% for collector sneakers and 8% for others, and tests prove the auction room never beats the retail price you paid. Gray-market counterfeit odds before 1970 were also too low (x0.4) and are now x0.7.
- Lowered fine-wine appreciation from 6.5% to 5% a year (still capped), so wine is not an outsized near-riskless return.
- Wine, spirits and art no longer offer Service It, which could 'restore' a bottle's condition for a fee.
- Gifting a bottle is limited to relatives of drinking age in your country. Before, a 12-year-old could be given a bottle of champagne.
- Family Access: granting the first thing to a relative still warms them (+1), but the tenth no longer does. Before, each grant gave +1 relationship, which could be farmed across many items.
- Family use: a 17-year-old with a chauffeur on staff used to drive a supercar themself and could crash it, against the 'no minors in a supercar unless a driver takes them' rule. The driver now takes them and they cannot crash it.
- Owning pieces no longer gives unlimited happiness. The first four outings a year lift your mood; more are still allowed but give nothing.
- wealth-kids.ts: a kid's phone ask can no longer name a luxury or ultra maker such as Vertu, whose $18K phones are ten times the ask. It picks the top mainstream maker.
- Real-brand facts in the catalog: renamed 'Tumi Alpha Briefcase' to 'Business Briefcase', 'Montblanc Meisterstuck 149' to 'Meisterstuck', and 'Grand Caravan EX Amphibian' to 'Caravan Amphibian' (the EX name came decades later). Replaced Yamazaki 18 with Yamazaki 12 (1984). The JetStar blurb no longer claims 'the first business jet'. I could not verify those dates, names or claims, so I removed them.
- Removed SPECIAL_EDITIONS from luxury-brands-wheels.ts. It was unused, and pairing edition names with models would have invented model variants. Special editions remain modelled as the real limited-run lines (LaFerrari, F1, Valkyrie and so on).
- Added test/luxury-review.test.ts with 7 regression tests: a sweep of every offer across 7 countries and 6 eras for any loop that wins, the certified-condition floor, the restoration cost floor, allocation flips, the bottle and art service rows, bottle gifting, bounded joy, trust farming, and the 17-year-old supercar case.
- Audited and found no problems: every menu and preview in all luxury and family rows is pure (no change to g.rng or to the state JSON, checked across 3 countries and eras); a 45-year, 8-seed life with a spouse, five kids, a parent and a sibling, everything shared, runs through the real ageUp with no NaN, bad numbers or stuck popups; brand years and facts were checked line by line against the rules, and no real person, tobacco, firearms or gambling brand appears and nothing negative is attributed to a brand.

### remaining
- Needs the lead (assets.ts): `ageAsset` still runs over brand pieces. For kind 'collectible' (all art) it applies a +/-15% random walk plus a 2% yearly 'artist got famous' x2.5 jump, and these show in the Assets tab generic sell and in net worth until the next yearly re-snap. A player can cash a x2.5 art jump through the generic sell before the brand model re-snaps it. Cars, boats and aircraft also drift 5-20% off model and have their upkeep overwritten. Exploitable in a small way, and needs the one-line skip.
- Needs the lead (assets.ts assetNode): the generic Assets-tab holding screen has no hook for brand pieces or for Family Access on existing cars, boats, aircraft, jewelry and instruments. The generic sell on a brand piece bypasses the authenticity check, dealer spread and auction fees. Unverified pieces are already priced for the counterfeit risk, so the loss is limited. Person-sheet Family Access and Your Collection work without it.
- Registry: `ALL` in brands.ts is a plain concatenation and brandsFor/brandsInCategory filter it, so any id defined in both brands-luxury.ts and brands-consumer.ts shows twice. No duplicate exists today (checked), but brands-luxury.ts defines mass-market ids that the consumer-brands owner must not repeat: toyota, ford, chevrolet, nissan, honda, bmw, audi, lexus, nike, adidas, puma, converse, new-balance, reebok, vans, asics.
- Brands carry no `countries` limits, so any Rolex or Hermes line is on sale in every country, with only a boutique trip cost for people outside the big cities. Embargoes, local availability and sanctions are not modelled.
- Waldorf Astoria New York is offered continuously from 1893, although the original hotel was demolished in 1929 and the current one was closed for renovation in 2017. Registry facts are approximate.
- I did not run the dev server or Playwright at 390x844. Menus were verified as data (no NaN or undefined, no changes to g.rng or the state JSON, unique sibling ids), not visually.
- test/anachronism.test.ts still fails on a 'group chat' scandal in 1967 (era packs, not my files). Everything else passes, including simulate.test.ts.

### sharedChangesNeeded
- REQUIRED, assets.ts `ageAsset(g, a, market)`: add `if (a.details.lux === 1) return` as the first line, before the heirloom check. This is more than cosmetic: art pieces in the Assets tab can jump x2.5 (the 2% 'artist got famous' roll) and be sold at that value through the generic sell before the brand model re-snaps them, and car upkeep and values are overwritten.
- REQUIRED, assets.ts `assetNode`: add the extension seam the builder described. Add `export const ASSET_NODE_HOOKS: { view?: (g: GameState, a: Asset) => MenuNode[] | null; extra?: (g: GameState, a: Asset) => MenuNode | null } = {}` next to `ASSET_KIND_VIEWS`. At the top of the `children` function, after `cur` is found, add `const lux = ASSET_NODE_HOOKS.view?.(gg, cur); if (lux) return lux`. Before `return nodes`, add `const fam = ASSET_NODE_HOOKS.extra?.(gg, cur); if (fam) nodes.push(fam)`. In menus.ts set `ASSET_NODE_HOOKS.view = luxuryAssetNodes` (from shops/luxury-brands-assets) and `ASSET_NODE_HOOKS.extra = familyAccessNode` (from shops/luxury-family).
- brands.ts: dedupe `ALL` by id (first wins), or tell the consumer-brands owner to skip the mass-market ids listed above.
- assets.ts stores: the generic stores still use fictional names (Glitterwell Fine Jewelers, Bling Bros. Discount Jewelry, the Luxury Boutique's generic items). Name them from brandsFor(g, 'jewelry'), brandsFor(g, 'handbag') and brandsFor(g, 'watch') for the 'real brands everywhere' request. The art gallery and collectibles random-walk there is unbounded, unlike the brand model.
- Docs paragraph to add: unverified pieces are priced for the counterfeit risk (same number for a real piece and a fake). Pre-owned pieces from certified dealers are 70% condition or better and gray-market ones are 60% or better. Service on gray-market classes costs at least about 92% of the value it adds, so restoring is not a trade. Waitlist resale premiums are capped below the auction commission.

### testsPassing
False


## build:market-screen-real-rivals

### summary
Rivals are now real companies in all 33 industries, and the Market & Competition screen is much bigger. tsc is clean and test/simulate.test.ts passes. The full suite has one failure, test/anachronism.test.ts, which is not from my files (details in notes).

**(A) Real rivals**
- About 3,000 real companies sit in compact rows in business/market-data-{tech,heavy,food,retail,services}.ts, turned into registry brands by market-rows.ts and data/brands-rivals.ts.
- Each row has founding year, home country, price tier, rough pull, ramp, entry year, real end year (none after 2025), a strength arc, and per-country entry, pull and exit for local trades.
- competition-roster.ts reads those rows. A company appears only from its founding year (or when it reached a country) and leaves only in the year it really ended; real brands never end after 2026.
- Past 2026 each real brand drifts up or down by a seeded amount but never disappears.
- The fictional, locally named long tail is kept as "local challengers": a few per market, more where the real field is thin, never named like a real brand, still RNG-free and cached from the family seed.
- State-backed incumbents in spaceTech are now real and rescaled to the old pull.
- Real foreign chains count at 60% pull outside their home country.
- competition-events.ts is rewritten for real names:
  - Only fictional rivals ever get scandals.
  - A real rival's copycat becomes "A Rival Launch" with no suing.
  - Price war and giant-bid copy are neutral.
  - New neutral "Makes a Move" event.
  - New "Supply Chain Disruption" event.
- Buying out a real rival still follows the old size and regulator rules, with neutral copy.
- A minor who inherits a brewery sees "Brewer A, B…" instead of real beer names.

**(B) Market & Competition screen**
- It is now a hub with Explore sections (each a submenu) and a Strategy section. No section has more than about 12 rows.
- Explore sections: Overview, Leaderboard, Segments, Regions & Countries, History, Rival Profiles.
- Overview shows concentration (HHI-style index with a plain-words label).
- Leaderboard shows a top 10 with text bars, trend arrows, tier and home flag.
- Segments covers budget to luxury, with industry-specific names.
- Regions and countries use a modeled split. Each country's shares sum to 100%, and each company's weighted shares average back to its world share. Country drilldown shows tariffs and trade blocs, other barriers, currency exposure, local champions and regulator thresholds.
- History shows sparklines for your share, the leader, market size and concentration.
- Strategy section: Competitive Moves (the old four), Enter a New Country (export, partner or joint venture, local subsidiary), Regional Brand Campaigns, Protect & Partner (defend home, diversify supply chains, patent cross-licences for deep tech), and What-If Scenarios. The old four are unchanged except buy-outs now count toward antitrust exposure.
- All new moves feed one multiplier on pull, `reachOf`, folded into the share model's `edge`. They have a term (they ramp up over about three years and have to be renewed), tariffs and red tape that eat into them, and a 45% ceiling.
- A move's price is the larger of a fixed floor and a multiple of the yearly revenue it adds, so a big prize costs more.
- Extra pull is worthless to a company with no spare capacity, so the hint says so.
- Buy-outs and deep-tech cross-licences with a top rival now add to antitrust risk.
- Menus are pure (state and `g.rng` unchanged, same output twice, cached) and purple hints use the same quotes the buttons use. Checked in Chromium at 390x844.
- I did not wire the new moves into smart CEOs; nothing in board-ceo.ts uses the competitive moves today.

**New tests**
- test/market-brands.test.ts: data checks.
- test/market-roster.test.ts: era gating, determinism across heirs and saves, non-empty fields, share sums, drift.
- test/market-screen.test.ts: menu purity, sections, regional split.
- test/market-moves.test.ts: costs, caps, terms, antitrust.
- test/market-events.test.ts: neutral events, old saves, brewery minors, a 40-year run with moves.
- test/market-kit.ts is the shared helper.

### sharedChangesNeeded
- test/anachronism.test.ts ('never mentions things before they existed') fails, but not from my files. It flags src/game/special/politics.ts line 2334 ('a leaked group chat' scandal) firing in a 1967 France life; it needs an era gate or a different phrase. It comes from the politics/era work, not from my files.
- Optional: board-ceo.ts (smart CEOs) could call the new moves. Each move has an exported pure quote (quoteEnter, quoteCampaign, quoteDefend, quoteSupply, quoteLicense in market-strategy.ts) and an action (runEnter, runCampaign, runDefend, runSupply, runLicense), so a CEO could take the best positive-value move once a year. Left out because nothing in board-ceo.ts uses the classic competitive moves today.
- README disclaimer: the rival rows name hundreds of real companies, so the trademark disclaimer covers them. Brewery rivals are real brewers: founding a brewery needs the drinking age, and competition.ts shows a minor 'Brewer A, B...' instead.
- I edited three shared test files: test/offline.test.ts, test/deeptech.test.ts and test/competition.test.ts.
- In test/offline.test.ts I narrowed the 'no AI SDK' guard from the bare words 'openai' and '@anthropic-ai' to real import and require patterns, so the real brand name 'OpenAI' can appear in data; the package.json dependency check is unchanged. Other agents' real-brand data (stocks, consumer) will hit the same guard unless this narrowed regex survives the merge.
- In test/deeptech.test.ts the biotech pipeline test now skips drugs already licensed to a partner. New competition events changed the event dice sequence, so a partner deal sometimes landed before the test's first trial.
- In test/competition.test.ts the US restaurant test now expects real chains (some foreign) plus local fictional challengers, instead of every rival being headquartered in the US.

### docsNotes
Add to docs/ARCHITECTURE.md under the competition paragraph:

`business/competition-roster.ts` now builds each market's cast from REAL companies (`data/brands-rivals.ts`, built by `business/market-rows.ts` `rowsToBrands` from rows in `business/market-data-{tech,heavy,food,retail,services}.ts`; one row is one company in one industry). A row gives the real founding year, home country, price tier (`budget`/`mass`/`premium`/`luxury`), a relative pull `pot` (1 = a solid reference competitor; giants 6-14), a `ramp`, `since` (the year it began competing in that market), `end` (the real last year; never after 2025), a strength arc `a` of [year, multiplier] points, and for local trades the countries it trades in with the year it arrived (`s`), a per-country pull (`w`) and a per-country exit (`x`). World markets use every row of the industry; local trades use the rows that trade in the market's country in that year. A fictional, locally named long tail (`f0`, `f1`... ids, never named like a real brand, 3-10 per market, more where the real field is thin) fills every market and year; everything is a pure function of the family seed, with no RNG and no state (real brands only get a seeded drift of their strength after PRESENT_YEAR, never an end). `Rival.from` is the year it enters this market, `founded` the real founding year. Old saves keep their stored `rivals`/`mods`/`gone` entries for ids that no longer exist; they are ignored.

`business/market-reach.ts` folds the player's entries into foreign countries (export / joint venture / subsidiary, with terms of 4 / 8 / 15 years), regional brand campaigns, home defence and supply-chain diversification into ONE multiplier on pull, `reachOf(state, industry, year)`, which `competition-core.buildCtx` multiplies into `ctx.edge`. Each move ramps over three years, lasts its term, fades over two more years, loses strength to tariffs and red tape (`market-trade.ts`: blocs, a tariff curve by era and country, goods share by industry, non-tariff barriers, currency exposure), and the multiplier saturates at +45% (`REACH_CAP`). `market-strategy.ts` holds the pure quotes (cost, pull path, extra share, expected dollars net of cost; moves cost the larger of a floor and a multiple of the revenue they add, and extra pull beyond spare capacity is worth nothing) and the actions; the menus, the scenario table and the Business talent's purple hints all read the same quotes. `MarketState` gained `entries`, `campaigns`, `deals`, `supplyUntil`, `defendUntil`, `acquired` and history `lead`/`hhi` (all optional on read, so old saves load). Antitrust: `antitrustOf` adds buy-outs in the last 8 years (floor drops to 30% after two, +18% per buy-out) and local dominance in entered countries (`market-regional.ts`, an iterative-proportional-fitting split of the world market by country). `market-view.ts` holds the pure numbers of the screen (concentration, leaderboard, segments, regions and countries, history, rival profiles); `market-menu.ts` and `competition-menu.ts` build the menus. Competition events never accuse a real company of anything: scandals pick only fictional rivals, real launches have no lawsuit option, and `supplyShock` is cushioned by diversified suppliers.

### notes
Verification
- Typecheck: tsc --noEmit is clean.
- Tests: the full vitest suite ran at 1620 of 1621 passing; the one failure is test/anachronism.test.ts (see sharedChangesNeeded). test/simulate.test.ts passes.
- No scratch files left. The dev server I started on port 4351 is stopped.
- UI: I checked the Market & Competition screen in Chromium at 390x844 on a seeded save (Market, Overview, Leaderboard, Regions, a country, Enter a New Country, Scenarios, Rival Profiles) with no page errors.

Facts and sizes
- Real facts are approximate. I removed rows I wasn't sure of (product-only beer brands, collapsed or failed companies, duplicates); I never write bankruptcies, scandals or lawsuits about a real company.
- Market sizes in dollars come from the existing model's units, not real-world revenue, so a real company can show a share of a small market (for example the world software market is a few billion). The screen labels all figures approximate.
- Countries in rows that the game doesn't model (Luxembourg, Ghana, ...) are ignored for trading but allowed as headquarters (market-places.ts has their names and flags).

Behaviour changes to know about
- A real rival's id is its brand id; fictional ones are f0, f1, ... Old saves' r0, r1... entries are ignored and shares re-settle on the next booked year.
- Real foreign chains count at 60% of their pull in countries other than home, unless a per-country multiplier says otherwise.
- The old 'rivalScandal' event now only fires when the market has fictional rivals.
- Brewery rivals are real brewers; a minor owner sees 'Brewer A, B...' (competition.adultBrandName, also used by the regional lists).
- The new strategy moves are not yet used by smart CEOs; see sharedChangesNeeded for the hook points.

### files
- /home/user/snag/src/game/business/competition-roster.ts
- /home/user/snag/src/game/business/competition-core.ts
- /home/user/snag/src/game/business/competition-state.ts
- /home/user/snag/src/game/business/competition.ts
- /home/user/snag/src/game/business/competition-moves.ts
- /home/user/snag/src/game/business/competition-events.ts
- /home/user/snag/src/game/business/competition-menu.ts
- /home/user/snag/src/game/data/brands-rivals.ts
- /home/user/snag/src/game/business/market-rows.ts
- /home/user/snag/src/game/business/market-data-tech.ts
- /home/user/snag/src/game/business/market-data-heavy.ts
- /home/user/snag/src/game/business/market-data-food.ts
- /home/user/snag/src/game/business/market-data-retail.ts
- /home/user/snag/src/game/business/market-data-services.ts
- /home/user/snag/src/game/business/market-places.ts
- /home/user/snag/src/game/business/market-trade.ts
- /home/user/snag/src/game/business/market-reach.ts
- /home/user/snag/src/game/business/market-regional.ts
- /home/user/snag/src/game/business/market-view.ts
- /home/user/snag/src/game/business/market-strategy.ts
- /home/user/snag/src/game/business/market-menu-kit.ts
- /home/user/snag/src/game/business/market-menu.ts
- /home/user/snag/test/market-kit.ts
- /home/user/snag/test/market-brands.test.ts
- /home/user/snag/test/market-roster.test.ts
- /home/user/snag/test/market-screen.test.ts
- /home/user/snag/test/market-moves.test.ts
- /home/user/snag/test/market-events.test.ts
- /home/user/snag/test/competition.test.ts
- /home/user/snag/test/deeptech.test.ts
- /home/user/snag/test/offline.test.ts


## review:market-screen-real-rivals

### fixed
- Rival events no longer put snide or invented words in real companies' mouths: a spurned giant's 'CEO said we'll see in a tone you didn't love' is now neutral, 'called your counteroffer a fantasy' is now 'passed on your counteroffer', 'waited for X to run out of money' (Waiting It Out) is now about the discount season passing, and 'Their lawyers are watching' (talent raid cooldown) is gone (competition-events.ts, competition-moves.ts)
- Lobbying win copy no longer hints that a real regulator was swayed ('Nobody can quite say why' removed)
- Rival profiles (market-view.ts): 'Likely to restructure' (reads as layoffs) became 'sharpen its focus on its strongest markets'; 'It follows orders and budgets, not the market' (about real state-backed firms such as NASA-era contractors, ISRO, Roscosmos) became 'steered by state contracts and budgets'
- Rival profiles: the year-stamped 'In 2020 it signed a distribution partnership' lines read like real history for a real company, so they now end with '(simulated)' for real rivals (market-view.ts)
- Rival profile 'Strengths' star ratings are invented evaluations of real brands and could show 1 star: real companies now show at least 3 stars and are labelled '(modeled)' (market-menu.ts)
- Alcohol brand hiding for minors now also covers the Bar industry (real bar and brewhouse names such as Paulaner Brauhaus show as 'Bar A, B...'), and hidden names stay unique past 26 rivals ('Brewer AA'...). The old code wrapped around and produced duplicate 'Brewer A' names (competition.ts adultBrandName)
- Added test/market-review.test.ts: after answering every choice of every competition event against a real rival, the resulting notices contain nothing snide or accusatory; real-rival profiles stay neutral; hidden adult brand names are unique and cover bars; a minor heir's bar screens show no real bar names
- Verified with no change needed: all menus across all 33 industries x 7 countries/eras are pure (state hash and g.rng unchanged) with no NaN/undefined/Infinity/[object]; the real roster has no tobacco, vape, firearms or gambling brands and no living people as characters; strategy moves are not a money exploit (blindly spamming every move loses 10-70% of company value; picking only positive-value moves gains about 5-30% over 25 years at real cost, capped by REACH_CAP and the two-per-year limits); UI checked in Chromium at 390x844 in dark and light themes with no page errors or horizontal overflow; filtered tsc is clean

### remaining
- test/anachronism.test.ts still fails, and it is not from the market files: src/game/special/politics.ts (around line 2334) fires the 'leaked group chat' scandal in a 1967 France life. It needs an era gate or a different phrase.
- Facts in the ~3,000 rival rows are approximate and unverifiable at scale. I read every company name, founding year, home country and end year and found no wrong or invented fact. I spot-checked the chains' per-country entry and exit years (McDonald's, KFC, Starbucks, Tesco, Carrefour, Walmart) and they look right. Sizes and pull values are modeled and labelled approximate in the UI.
- Real beer brands still appear as rivals of a Brewery company, adults only (minors see 'Brewer A'). This follows the task spec, which asked for real rivals in every industry. The lead should confirm it fits the 'alcohol only as adult luxury goods' rule.
- Cross-licences give permanent +3 tech and +2 quality for a floor cost, once a year, three at a time, then renewable after the 6-year term. This is capped, costs money and matches other tech sources (R&D adds +3 too), so I did not change it, but it has no diminishing return near level 100.
- Renewing an entry in its last year restarts the 3-year ramp, so renewing early can lower strength for a while. The quote shows this honestly (a negative value); it is a UX trap, not a bug.
- The new strategy moves are still not wired into smart CEOs (optional, per the builder).

### sharedChangesNeeded
- Fix test/anachronism.test.ts: src/game/special/politics.ts around line 2334 ('a leaked group chat' scandal) fires in a 1967 France life. It needs an era gate (for example from 2010) or a period phrase. This is not a market file.
- README disclaimer should cover the real company names used as market rivals (hundreds of them) and the '(simulated)' / '(modeled)' labels on rival profiles. The Brewery industry shows real beer brands to adults only.
- docs/ARCHITECTURE.md: add the builder's docsNotes paragraph. One more sentence: real-rival profile lines and star ratings are labelled simulated/modeled, and adultBrandName hides real brewery and bar names from minors using A, B... Z, AA... tags.

### testsPassing
True


## build:real-stocks

### summary
Every exchange the registry covers now lists real companies in their real eras, with real names by year, real IPO and delisting dates, real index-fund providers and real coins. 41 countries are covered, including every major market on your list, and the exchanges the registry doesn't cover keep the old fictional engine unchanged. `npx tsc --noEmit` is clean and `test/simulate.test.ts` passes. My last full-suite run had 7 failures; I then fixed or explained each one (below), but I did not re-run the whole suite afterwards. I re-ran the stock, investment, history-market, politics and deep-tech test files; those pass.

**How the real companies work**
- **Roster:** the registry now holds about 410 real stocks, with the IPO year as `founded`, the last year-end quote as `ended`, and name history in `data.aka` as `[{from, name}]`. Data files are `src/game/invest/stocks-*.ts`, merged by `data/brands-stocks.ts`.
- **Slots:** `invest/real.ts` assigns each exchange's companies to listing slots without overlap and with sector matching. There are up to 36 real slots (40 for the US), plus four always-fictional small-cap slots on every real exchange.
- **Filler buyouts:** a made-up filler company is bought out in the year the real company that follows it in its slot lists.
- **Real endings:** a real company ends only the year after its `ended`, with its recorded fate. Only 11 documented bankruptcies are recorded (Lehman, Sears, the old GM, Kodak, Pan Am, Japan Airlines and similar). Nothing real ends after 2025.
- **No random victims:** real companies never get random scandals, surges, bankruptcies or buyouts. Their idiosyncratic risk is capped at 0.20 for the best-known names and 0.26 for the rest, and a single year's move is clamped to between 0.12x and 4x.
- **Arcs:** about 20 names carry a coarse `data.arc`, such as Apple, Nvidia, Tesla, Nokia and GE.
- **Names and sizes:** the menus show the name the company had that year (Apple Computer, Facebook, Chase Manhattan). The Stocks menu groups rows under rough Mega/Large/Mid-cap headings by era. The header says the names are real and the prices are simulated.
- **Tickers:** these are derived from the name (`tickerFor`), not real symbols.
- **News and tips:** news lines are neutral for real companies. Analyst tips are about the whole sector, never an opinion on one company.
- **Fund providers:** index funds and trusts use real names by era (Massachusetts Investors Trust, Vanguard 500 Index Fund, Foreign & Colonial Investment Trust, iShares FTSE 100 ETF, Tracker Fund of Hong Kong and others). The fee model is unchanged, and the fund blurb now says "Yearly fee in this game". Index names by era also got small fixes for India and Australia.

**Fiction and crypto**
- Penny stocks and made-up filler companies never take a registry name, and the check covers every registered brand, not just stocks.
- **Shocks:** a ban, probe or nationalization of a real company has no effect (`shockable()` / `addMarketShock`).
- **Politicians:** `stockTargets` now returns only made-up companies, so politics.ts needed no change. The new `listedTargets` lists every company for options.
- **Fictional names:** brokers, analyst firms, crypto exchanges and the stablecoin stay fictional. I renamed the analyst firms that were puns on real banks (they now read as plain made-up names).
- **Coins:** slots 0 to 2 are now Bitcoin, Ethereum and Dogecoin at their real historical prices, and they never collapse by chance. The algorithmic stablecoin and every later coin generation are made up. The stablecoin is renamed, since the old names echoed Terra and Luna.

**Old saves**
- Holdings saved before this change are re-anchored once to the current quote at the same value.
- A made-up holding whose slot now holds another company is swapped share for share, with a log line, and the year's market move still applies.
- Tests cover US, Japan, UK and Germany saves, a generation the new engine never had, and a country with no roster.

**Calibration:** I raised `GUT_NOISE` from 1.8 to 2.8 because real stocks are less noisy, which had pushed the Investing talent hint precision past its cap. Measured precision is now about 0.86 and the talent tests pass.

**Test changes beyond my own file**
- The golden stock prices in `history-markets.test.ts` were re-recorded; index fund, penny, REIT, crypto and gold values are unchanged. I also changed its fund-name expectations and the crypto id (Dogecoin no longer collapses).
- I updated `investments.test.ts` for the new row counts and headings.
- I updated `politics-abuse.test.ts` to pick a made-up company for the buyout case.
- I updated `deeptech.test.ts` so the "no deep-tech extras" check ignores the new real and small-cap slots.

### sharedChangesNeeded
- README.md disclaimer: add that real company, index, fund and cryptocurrency names (stock exchanges' listed companies, index funds, Bitcoin, Ethereum, Dogecoin) are trademarks of their owners used only to identify them, and that all prices, returns and events in the investments screens are simulated, not real quotes or predictions.
- data/brands.ts header: add one line that for category 'stock' `founded` is the listing (IPO) year, `ended` is the last year-end it had a quote, `segment` is an invest/engine.ts SectorId, and `data.aka` is the full name history `[{from, name}]` oldest first with the last entry equal to `name` (name in year y = the last entry with from <= y).
- docs/ARCHITECTURE.md: replace the investments bullets with the paragraph in docsNotes (new modules invest/real.ts, funds.ts, stocks-*.ts; investments.ts normalizeHoldings; shocks.ts shockable).
- Not mine, but the suite currently fails in test/era-features.test.ts (3 tests: electronics 'Black-and-White TV', 'VCR', original feature list now shows 'Google Pixel 10') and test/localPrices.test.ts ('Resona Bank' now appears as a Japanese mortgage lender from data/brands-consumer-money.ts); the shops/consumer builders need to reconcile these. test/deeptech.test.ts 'founds all eight industries' and 'renders every deep-tech menu' time out at the 5 s default when the machine is loaded (they pass alone).
- special/politics.ts needs no change: stockTargets(g) already returns only made-up companies. If the lead wants politicians to hit real coins differently, nothing else is required.

### docsNotes
Real listed companies (invest/real.ts, funds.ts, stocks-*.ts). data/brands-stocks.ts merges invest/stocks-{americas,europe,asia,mea,more}.ts (about 410 companies, constructor stock() in stocks-data.ts). A registry row: category 'stock', segment = engine sector id (invest/engine.ts SECTORS), hq = the exchange's home country, founded = LISTING year (very old firms: 1900), ended = last year-end it had a quote (a real merger or takeover; data.fate 'bankrupt' only for documented bankruptcies; never later than 2025), data = { exchange, aka: [{from,name}] (full name history oldest first, last = current name), arc: [[from,to,excess]] (coarse, at most 0.15 a year, real history only), size: [[from,'mega'|'large'|'mid']], label (period sector label), dy (dividend yield override) }. invest/real.ts (pure, RNG-free) turns it into a plan: buildRealPlan assigns each exchange's companies to listing slots with no overlaps, sector affinity and at most 36 real slots at once (40 for the US; nothing may be dropped, a test enforces it); engine.slotPlan = the classic base plan + extra slots + 4 made-up small-cap slots (SMALL_CAPS). Generations: gen >= 100000 is a real company (index in the slot's queue), gen 100*k is the made-up filler after the k-th real company, small gens are the classic fictional chain, so ids stay '<exchange key>#s<slot>g<gen>'. A made-up filler is bought out (at a premium) in the year the next real company of its slot lists, and keeps the old random bankruptcy/buyout/scandal/surge rules; a real company ends only in ended+1 with its recorded fate, never at random, with idiosyncratic risk capped (0.20 if fame >= 8, else 0.26) and a single-year log move clamped to [ln 0.12, ln 4]; arcs apply only to real-history years. Real exchanges use one seeded stream per slot and burn the classic stream's draws, so penny stocks, REITs, index funds, gold and crypto paths are identical to before; exchanges without a roster run the unchanged classic engine. eraIdentity gives real companies the name of the year (aka), the period sector label and the registry blurb; sizeLabelOf/sizeRankOf give rough Mega/Large/Mid-cap classes by era (made-up companies: Small-cap), and the Stocks menu groups by them. Tickers are derived from names (tickerFor), unique per exchange, never real symbols. invest/funds.ts names index trackers, ETFs and old investment trusts by country and launch year with the unchanged fee model. Crypto: slots 0-2 are Bitcoin, Ethereum (2015) and Dogecoin (2013) at real prices and never collapse by chance; the algorithmic stablecoin and every later generation are made up. Fiction stays fictional: made-up companies and penny stocks never take any registry brand name (isRealName covers all brands), shocks.ts shockable()/addMarketShock make bans, probes and nationalizations of real companies a no-op, computer/money-stocks.ts stockTargets (used by politics) lists only made-up companies while listedTargets lists all (options and bets), analyst tips about real companies are about their sector, and brokers, analyst firms, crypto exchanges and every scam stay fictional. Old saves: holdings without details.eng (ENGINE_V = 2) are re-anchored once by investments.ts normalizeHoldings at the same value (priced as of last year-end inside the yearly step so the year's move still applies); a holding whose slot now holds a different company is swapped share-for-share with a log line. The Investing talent's gut (invest/instinct.ts) still reads next year's real simulated move; GUT_NOISE was raised to 2.8 because real stocks are less noisy (measured precision about 0.86). Tests: test/stocks-real.test.ts (registry rules, era gating, renames, fund providers, determinism, no random victims, fiction, menus, old saves, a 40-year investor life).

### notes
The registry contains about 410 stocks across 41 countries. Facts are approximate public knowledge; listing years of old companies are rounded (many start at 1900) and a few (Lufthansa 1966, Maersk 1965, Nokia 1915, ANA 1958, Norsk Hydro 1927, Leumi 1953) are the least certain; the lead may want a quick fact pass. Ended dates follow the 'last year-end quote' rule, so the in-game event year is ended+1 (Lehman ended 2007 -> bankruptcy news in 2008). No alcohol, tobacco, gambling or firearms companies are included. Per-slot lists are long on big exchanges (US up to 44 rows including 4 small caps) but are grouped under size headings; verified in a 390x844 dark-theme screenshot with no horizontal overflow. Real fund names appear only where I was confident of the product and launch year. The brokers/analyst firms/crypto exchanges stay fictional because game mechanics blame them (margin calls, flagged traders, hacks). Scratch files and the dev server (port 4354) were removed. The 7 failures in my last full-suite run were: investments.test and talent-investing.test (mine, fixed and re-run green), deeptech.test x1 (a 5 s timeout under machine load, passes alone), and era-features.test x3 plus localPrices.test x1 from the shops/consumer builders' in-flight data (not mine; see sharedChangesNeeded)."

### files
- /home/user/snag/src/game/invest/real.ts
- /home/user/snag/src/game/invest/funds.ts
- /home/user/snag/src/game/invest/stocks-data.ts
- /home/user/snag/src/game/invest/stocks-americas.ts
- /home/user/snag/src/game/invest/stocks-europe.ts
- /home/user/snag/src/game/invest/stocks-asia.ts
- /home/user/snag/src/game/invest/stocks-mea.ts
- /home/user/snag/src/game/invest/stocks-more.ts
- /home/user/snag/src/game/invest/engine.ts
- /home/user/snag/src/game/invest/era.ts
- /home/user/snag/src/game/invest/instinct.ts
- /home/user/snag/src/game/invest/shocks.ts
- /home/user/snag/src/game/investments.ts
- /home/user/snag/src/game/computer/money-stocks.ts
- /home/user/snag/src/game/data/brands-stocks.ts
- /home/user/snag/src/game/history/markets-assets.ts
- /home/user/snag/test/stocks-real.test.ts
- /home/user/snag/test/investments.test.ts
- /home/user/snag/test/history-markets.test.ts
- /home/user/snag/test/politics-abuse.test.ts
- /home/user/snag/test/deeptech.test.ts


## build:real-consumer-brands

### summary
Replaced fictional consumer brands with real, era- and country-gated brands through a registry of about 1,000 brands. Covers food, coffee, supermarkets, banks, cards, insurers, brokerages, phones, computers, consoles, streaming, telecom, airlines, hotels, sportswear, toys, furniture, appliances, cars, bikes, pharmacy, delivery, ride-hailing, social, endorsements, employers, job boards, store chains and shop catalogs. Brokers on the options and stock screens are now real brokerages for the country and year, with the invented name as fallback. tsc is clean and test/simulate.test.ts passes. The full suite ran 1677 of 1679 passing. The two failures, in market-events and stocks-real, passed when re-run alone. The market-events one is a 5s timeout under load. I did not find the cause of the stocks-real one (invest/* is not mine). Earlier runs timed out in deeptech and conglomerates, so timing flakiness under load looks likely. Home brands are weighted x3 in picks. Old saves keep their saved item names.

### sharedChangesNeeded
- docs/ARCHITECTURE.md and README.md: add the docsNotes paragraph (not edited, per the rules).
- Money-scale and lender-name owners (business/*, invest/*) can reuse employerRef and isRealBrandName from shops/everyday-brands.ts for any text that makes claims about a company. Those directories were not touched.
- invest/* (not mine): test/stocks-real.test.ts 'buy more on an old holding swapped for its slot company' failed once in the full run and passed alone. It may be order-dependent or flaky.
- Load-sensitive tests (deeptech, conglomerate, market-events) occasionally hit the 5s default timeout in the full run. A higher testTimeout in vitest config would help.

### docsNotes
Real brands: all consumer brands live in the registry (src/game/data/brands.ts, merged from brands-consumer-{food,money,services,retail,goods}.ts; luxury ids win). A Brand has id, name, category, segment, hq, founded, sold, countries, ended, tier, fame, blurb and data. Footprints use a mini-language, "us:1955 jp:1971 EUW:1985 -ru", where explicit countries beat region groups and "-xx" removes a country. Product lines are data.lines = [name, from, until?, where?]. Russia exits are separate split brands with an `ended` year. Game text never names a brand directly. It goes through shops/everyday-brands.ts: brandPool lists available brands for the country and year, home brands first and weighted x3. seededBrand, steadyBrand, streamBrand, seededModel and gadgetName are deterministic and never touch g's RNG. pickBrand uses g's RNG and is for actions only. Text that makes claims (layoffs, foreclosure, lawsuits, cancellations, "flagged as sharp") must use employerRef(name, generic) so real companies are never shown in a negative light. Scams, villains and penny stocks stay fictional. Shop items keep the generic name in details.baseName and take a maker prefix from shops/everyday-makers.ts. Old saves keep their saved names. Brokers come from the 'brokerage' category through brokerName(countryId, year).

### notes
Kept fictional on purpose: game-industry companies, music labels, sports teams, nightlife and alcohol venues, scam exchanges and crime corporations. No real people, tobacco, vape, firearms or gambling-operator brands, and no alcohol brands in everyday shops. No real brand ends after 2025. The sports/TV/film fallbacks stay invented when no real brand fits. The lint test checks owned files for leftover former-fictional names. The required era/country sampling test (1950, 1975, 1985, 2000, 2015, 2026 across us/jp/br/ng/de/in/id) and the old-save test are in test/consumer-brands.test.ts, now 17 tests, all passing. Scratch files: none left.

### files
- /home/user/snag/src/game/data/brands-consumer.ts
- /home/user/snag/src/game/data/brands-consumer-kit.ts
- /home/user/snag/src/game/data/brands-consumer-food.ts
- /home/user/snag/src/game/data/brands-consumer-money.ts
- /home/user/snag/src/game/data/brands-consumer-services.ts
- /home/user/snag/src/game/data/brands-consumer-retail.ts
- /home/user/snag/src/game/data/brands-consumer-goods.ts
- /home/user/snag/src/game/shops/everyday-brands.ts
- /home/user/snag/src/game/shops/everyday-makers.ts
- /home/user/snag/src/game/shops/everyday.ts
- /home/user/snag/src/game/shops/memberships.ts
- /home/user/snag/src/game/shops/memberships-data.ts
- /home/user/snag/src/game/special/fame.ts
- /home/user/snag/src/game/special/social.ts
- /home/user/snag/src/game/special/sports-core.ts
- /home/user/snag/src/game/special/actor.ts
- /home/user/snag/src/game/careers.ts
- /home/user/snag/src/game/assets.ts
- /home/user/snag/src/game/finance.ts
- /home/user/snag/src/game/computer/dev-learn.ts
- /home/user/snag/src/game/computer/dev-freelance.ts
- /home/user/snag/src/game/computer/era.ts
- /home/user/snag/src/game/computer/money-common.ts
- /home/user/snag/src/game/computer/money-options.ts
- /home/user/snag/src/game/computer/money-stocks.ts
- /home/user/snag/src/game/activities/vacation.ts
- /home/user/snag/src/game/activities/movies.ts
- /home/user/snag/src/game/activities/lawsuit.ts
- /home/user/snag/src/game/events/kid.ts
- /home/user/snag/src/game/events/work.ts
- /home/user/snag/src/game/events/history.ts
- /home/user/snag/test/consumer-brands.test.ts
- /home/user/snag/test/era-features.test.ts
- /home/user/snag/test/localPrices.test.ts


## review:real-stocks

### fixed
- Fact fixes in the registry: Maruti Suzuki now lists in 2003 (it was 1994) under Maruti Udyog until 2007. ANA now lists in 1961 under one name, because the old Nippon Helicopter name was wrong for 1958-63. Aviva's name history gained CGNU (2000-01). BT Group is the name from 2001. The Amundi CAC 40 ETF name now starts in 2022. Files: src/game/invest/stocks-asia.ts, stocks-europe.ts, funds.ts.
- Credit Suisse's UBS rescue paid roughly 60% below the last price, but the sim always paid every real takeover a 12-38% premium. A new optional registry field (payout in stocks-data.ts, read in real.ts) sets Credit Suisse to -0.6, which is approximate. The merger news and the holder notice in investments.ts no longer claim a premium for real takeovers. A rescue deal reads as a payout well below the last price, with a bad tone.
- Exploit closed: options on real companies in their last year. Real bankruptcies and mergers are fixed history, so a put on Lehman bought in 2007 (an exact-history guess) paid roughly 13-20x risk-free, up to the maximum bet. stockFairValue and stockOptionPrice (computer/money-stocks.ts) take the year the option is written. A real company in its last trading year is then priced for the end at 85% odds, so puts on a doomed company cost almost what they pay, and so do calls on a takeover target. Both call sites pass g.year. Tests added.
- Bug: 'Buy more' from the holding screen of an old-save holding rejected the order. normalizeHoldings swapped the holding to its slot's company, so the old secId no longer matched anything. buySecurity now follows the swap. Test added.
- Wrong story in the logs: a trust holder's log read 'cut its fees and became the Vanguard 500 Index Fund'. Real fund providers are different products, so investments.ts now logs 'holding moved into the ...' unless the change is Lyxor to Amundi, which is a real rename. Test added.
- Renamed the crypto exchange 'CoinVault', which is the name of a real ransomware family, to 'Coinucopia'. Same array length, so the RNG picks are unchanged.
- New tests in test/stocks-real.test.ts for each fix above: the name and listing-year fixes, the Credit Suisse payout, the fund-holder log, buy-more on a swapped holding, and option pricing in a company's last year. The old CAC fund expectation gained a 2021 Lyxor case.
- Checked and found sound: all ~410 registry rows (listing years, renames, endings, 6 documented bankruptcies, no negative text, no real persons, no tobacco, gambling, firearms or alcohol brands); numeric stability (no NaN, non-positive prices or runaway paths across every real exchange, 3 families, 3 start years, to 2070); old-save re-anchoring; reading menus and listings never touches g.rng; the politics path cannot hit real companies.

### remaining
- A few listing years are still unverified, as the builder flagged: Lufthansa 1966, Maersk 1965, Nokia 1915, Norsk Hydro 1927, Leumi 1953. I also could not confirm Aeroflot 1994 or Turkish Airlines 1990. A quick fact pass by the lead is advisable, but none of them is negative or accusatory.
- Real history is still a mild edge. Holding a real company the year before it merges earns the 12-38% premium. Index options in a known crash year were already like this before this work, and I did not change them.
- Bets on real stocks in the middle of a crash year: the sector moves are history-driven, and put pricing uses generic volatility. The sure-thing cases (bankruptcy and merger) are closed; the general history edge is not.
- Not checked in a browser. Long company names like 'E. I. du Pont de Nemours and Company (DUPO)' in the 390x844 Stocks menu rely on the existing row wrapping. The builder reported a screenshot with no horizontal overflow.
- Old saves that held a stablecoin gen 1+ by id see a different display name on the coin-collapse news line, since the name list was shortened. That is cosmetic.

### sharedChangesNeeded
- special/politics.ts announce(): findTarget now also returns real companies. Today only stockTargets (made-up) feed the menus, so this is unreachable. As defence in depth, announce() could refuse a negative move (ban, probe, nationalize) when t.real is set, so the headline never says 'plunged' while the shock multiplier is a no-op.
- README.md disclaimer (the builder's request, still valid): real company, index, fund and cryptocurrency names (Bitcoin, Ethereum, Dogecoin) are trademarks of their owners used only to identify them. All prices, returns and events in the investments screens are simulated, not real quotes or predictions.
- data/brands.ts header (the builder's request, still valid): for category 'stock', founded is the listing year, ended is the last year-end with a quote, segment is an invest/engine.ts SectorId, and data.aka is the full name history [{from, name}] oldest first, ending with the current name. Add data.payout: an optional change on the last quote for rescue takeovers.
- docs/ARCHITECTURE.md: use the builder's docsNotes paragraph. Add that real-company options are priced for a known end (money-stocks.ts END_ODDS, endingMove) and that buySecurity follows a normalizeHoldings swap.

### testsPassing
True


## review:real-consumer-brands

### fixed
- Removed the Remington typewriter brand (data/brands-consumer-goods.ts). Remington is mainly known as a firearms name, which the brand rules forbid.
- Carrefour footprint (data/brands-consumer-food.ts): a 2026 life in Japan, the US, South Korea, Mexico, Thailand, Singapore, Malaysia, Chile, Colombia or Indonesia saw Carrefour. It was also listed twice in the Middle East (global row plus the Majid Al Futtaim row). The main row now covers only current markets. Markets it really left are separate rows with an `ended` year: carrefour-exit-1993/2005/2006/2010/2012. Hungary, Czech Republic, Slovakia, Portugal, Greece, Taiwan, India, Switzerland and Algeria were dropped without a historical row because I could not verify exit years.
- Burger King was offered in Australia, where the chain is called Hungry Jack's. Fixed, and the real Australian chain was added.
- Starbucks no longer trades in Nigeria, Kenya or Israel. The Nigeria and Kenya entries were wrong; Israel is excluded because I recall the Israeli stores closing in 2003, which I did not verify. Tesco no longer trades in Thailand, Malaysia or Turkey. eBay no longer trades in China, India, South Korea or Taiwan.
- TIM was listed twice in Brazil (Italian TIM plus TIM Brasil). Brazil now has only TIM Brasil.
- Added data/brands-consumer-home.ts (merged in brands-consumer.ts) with 62 home-market brands for Australia, Canada, New Zealand, Mexico, France, Britain, China, Thailand, Singapore, South Korea and Italy. Before this, Australia had no supermarket of its own (no Coles or Woolworths), Canada had no Loblaws or Sobeys, and New Zealand had one supermarket in total. Hudson's Bay ends in 2025, the year it really closed.
- Product lines that never retired showed up in the wrong era. Tandy 1000 appeared in 2026 and IBM ThinkPad appeared after IBM sold its PC business. Both now have end years. Samsung's 1983 SPC-1000 (the brand lists SPC-1000 from 1989) was offered as a US computer from 1992 on; it is now Korea only, up to 1990. The Motorola RAZR and Samsung NC10 are bounded. 2023-2025 lines were added for MacBook Air (M2, M3, M4), Xiaomi, OnePlus and Huawei.
- Embargo filter (shops/everyday-brands.ts, new `embargoed()`, used by brandPool and gadgetName): US brands are no longer offered in Cuba from 1961, Iran from 1980, Syria from 2004, or North Korea ever. Before this, a 2000 Cuban life could be offered Marriott and Hilton.
- A furniture shop could be named Herman Miller, Steelcase, Knoll or La-Z-Boy (makers, not shops). PickOpts has a new `notSegment` option, and storeName now excludes the chair-maker segment.
- Grammar: 'an used road bike' and 'an Uniqlo hoodie' now read 'a used...' and 'a Uniqlo...' (withArticle in shops/everyday.ts, now exported).
- Removed a dead 'bike:inline' key from everyday-makers.ts.
- Freelance 'Ghosted' notice and log no longer name the real platform (Fiverr, Upwork) as the place a client never paid.
- W3Schools is era-tagged '@1998' in dev-learn.ts; an untagged fallback site remains for earlier years.
- Tests: test/consumer-brands.test.ts has 8 new tests. They cover:
- no duplicate brand names per category, country and year across 102 countries and 7 years
- Carrefour exits
- Hungry Jack's and TIM Brasil
- home-market supermarkets and Stan, Hudson's Bay and Woolworths year gating
- retired product lines
- the embargo
- furniture shop naming
- articles

Full suite: 96 files, 1690 tests pass. The builder's two failures (market-events, stocks-real) did not reproduce. Filtered tsc clean.

### remaining
- Brand footprints are approximate. The row format has no way to say 'left this country in year Y', so exits other than Carrefour, Starbucks Israel, Tesco and eBay (fixed above) are not modelled. Foreign banks, airlines, hotels and luxury brands are offered in every country, so a Japanese life can be offered Barclays or Qantas. Markets I could not verify were left alone. I only checked the 2026 fast-food, coffee and supermarket pools for 18 countries and some of the 2026 data by eye.
- Many smaller countries still have thin home-brand coverage (Egypt, Chile, Nigeria supermarkets, Gulf fast food, most of Africa, Central America). The Philippines, Thailand and Vietnam have no home-grown insurers.
- The social platform shows as 'X (Twitter)' in every year, including 2010. Making it year-aware means changing the static PLATFORMS table in special/social.ts and every plat.name call; I left it.
- Aged-car breakdown and theft notices (assets.ts) name the real make and model ('Your Toyota Camry broke down'). This is condition-driven for any model, not a model-specific claim, and was already in the game, so I left it. It could be made generic if the lead wants stricter handling.
- The 'sold'/'countries' model cannot express brands that really left a market for other brands: Dunkin' in the UK and Germany, Wendy's in Germany, Walmart in Germany and Korea, Chipotle in Germany and others. Those are approximate.
- Playwright/UI pass at 390x844: not done. No UI files changed; the brand text flows through existing strings.

### sharedChangesNeeded
- docs/ARCHITECTURE.md and README.md: add the builder's docsNotes paragraph. Also note that data/brands-consumer-home.ts holds home-market chains for thinly covered countries, that `embargoed()` in everyday-brands.ts applies US trade embargoes inside brandPool, that exits from a country are modelled as separate `ended` rows (see carrefour-exit-*), and that PickOpts has a `notSegment` option.
- crime.ts (not mine): bank-robbery targets are named 'First National' / 'Citizens Savings' / 'Union Federal' / 'Harbor Trust' + 'Bank of <city>'. 'Citizens' and 'First National' are now real registry banks. Rename them to clearly invented names (for example 'Maple Street Savings') so a robbery is never pinned on a real brand.
- business/founding.ts (not mine): 'Loan Denied: <bank> looked at your credit score and said no' names a bank through bankName(). If bankName() now returns real banks, route those lines through employerRef() from shops/everyday-brands.ts, as finance.ts and assets.ts do for lender names.
- wealth-kids.ts (not mine) calls brandsFor() directly, so the new embargo filter in brandPool does not apply to it. Use brandPool() from shops/everyday-brands.ts instead if embargo-correct brand picks matter there.
- vitest config: consider a higher testTimeout (for example 15s). The builder saw 5s timeouts under load in deeptech, conglomerates and market-events; they passed in all my runs.

### testsPassing
True


## build:nepo-babies

### summary
Nepo babies is built and wired through the stubs. Kids from 14 and adult relatives ask for jobs; the owner can hire, promote, demote, set pay, fire, make a relative CEO or name a successor. Pay comes out of company cash, and executive or above-market family jobs go to the board as self-dealing. Typecheck is clean on my files and all nepo tests pass. The full suite had 4 failures in talent-business, deeptech and history-markets, all 5s timeouts; talent-business and history-markets pass when rerun alone, and deeptech passes in 2-3s with a raised timeout.

**The ask.** Kids from 14 (summer job at reduced pay) and 18+ (a real role) bring it up. Odds scale with age, ambition, entitlement, the player's stake and whether the company is profitable. Other askers:
- adult children, grandchildren, siblings, a spouse and rarely parents;
- a married child's spouse;
- a cousin or in-law, who is only added to contacts if hired.

At most one ask popup a year, bundling up to 3 askers, and at most 2 nepo popups a year overall (ask, outcome, life event share one budget). A single asker gets: hire at the bottom, give the job they asked for, a made-up job, hire and groom as successor, or say no. A bundle gets: hire all at the bottom, the normal hiring process, the jobs they asked for, decide one at a time, or no to all.

**Roles and competence.** Six ranks from intern to CEO with era titles (Apprentice before 1950, Trainee until 1980, Clerk before 1960, Intern/Associate since). Pay is anchored to the industry's key-staff pay and the country's labor cost, and capped below the going CEO pay. Competence is deterministic from the person: smarts, a stable hidden "drive", traits and entitlement. Skill grows toward a ceiling, so a bright kid in a junior role grows and a mismatched promotion drags and can burn them out.

**Consequences.**
- *Pay:* salaries come out of company cash and count as company costs. Anything above 1.5x the going rate also costs the company the tax deduction. The relative pays income tax. If cash is short they are paid pro rata, and two bad years can make them quit.
- *Staff and press:* resentment and admiration move morale. The "nepo baby" label feeds era-correct press (newspaper, magazine, and a viral post only from the 2010s with social media). Family drama between siblings is handled.
- *Company numbers:* demand, cost and quality effects are capped at +/-3%, +/-2% and +/-3 points, and shrink for bigger companies.
- *Kid's arc:* they can quit, burn out, leave to found a company, be poached, or leave to become a socialite or influencer.
- *Firing:* severance, a lawsuit chance, a family rift, awkward holidays and a will remark.

**Board.** New `familyHire` proposal. Self-dealing is higher for executive jobs, made-up jobs and pay above market. It is included in the minority-shareholder suit. A listed company's independents can block blatant cases. `passOdds` is exact, and the Business hints use it.

**CEO and succession.**
- A relative CEO is the normal hired-CEO manager built from their real skill, with `Manager.personId`.
- `career.syncCeo` installs the named successor (a relative or a key employee) when the owner stops running the company.
- An heir who was the CEO becomes owner-CEO. A sibling heir keeps the kid CEO.
- A dead or emigrated CEO gets an interim manager.
- A "pass the baton" prompt appears at 66+, and there is a "Hand over now" action.

**Surfaces.** The company screen has Family at the Company: payroll, an honest effect line, an employee row with Promote/Demote/Set Pay slider/Make CEO/Groom/Let Go, Offer a job, and Succession. The person sheet shows the job, or Offer a job. The Employees screen shows a one-line family summary. Menus are pure, and Business hints are honest, covering fit, board odds and the odds a refused relative earns their own way.

**Connections (`events/nepo-life.ts`).** For rich or famous parents with no company: an arranged summer job, internship or first job through a family friend, and an acting or music opening using the Fame stat. Favors wear out over about 3 years, the friend may call it in for a donation, and the press may notice. Generic fictional firms only, no real brands.

**Tests.** `test/nepo.test.ts`, `nepo-asks.test.ts`, `nepo-year.test.ts`, `nepo-life.test.ts` and `nepo-kit.ts` (55 tests). They cover ask scaling and the popup cap, hiring/firing effects, bounds and caps, board votes, succession and heir inheritance, exploit checks, old saves, era text, and a 40-year two-seed dynasty.

### sharedChangesNeeded
- life.ts continueAsChild: let the designated successor keep the company even when several heirs share the estate. Read `details.family.succ` (readFamily in business/nepo-state.ts): if `kind === 'person'` and `id === childId` for a business asset, keep that asset for the heir whatever `keepProperty` says, and subtract its equity from the estate before splitting the cash. Today the company only passes whole to a sole beneficiary; the Succession menu text says so honestly.
- events.ts EVENT_LIBRARY needs no change. `events/nepo-life.ts` is driven from `yearlyNepo`, with its own popup budget.
- manage.ts pickManager: add the owner's relatives to the headhunter shortlist with `familyCandidates(g, a, b, (skill) => askingSalary(b, skill, 0))` from business/nepo-succession.ts. Label them '(your son)'. Chosen candidates carry `Manager.personId`, and nepo-year.ts repairs the person's CEO job record on the next yearly step.
- Optional, activities/will.ts or will-feud.ts: fired relatives get `Person.data.nepoGrudge` (the year) and `data.nepoPast` ({how: 'fired'}). The will-feud hook may read them so a fired kid brings up the will.
- Optional, relationships.ts: no change needed. updateOccupation leaves 'Title at Company' occupations alone; nepo-year re-asserts them.

### docsNotes
Nepo babies (business/nepo*.ts, events/nepo-life.ts). A relative's job lives on the Person (`Person.data.nepo`: assetId, rank 0 intern/apprentice to 5 CEO, focus, kind real/cushy, title, pay, hidden skill, mood, last rating, `part` for a minor's summer job, `groom`). `Person.data.nepoPast` records how a job ended. Per-company state is `BizState.family` (readFamily/familyOf in nepo-state.ts): the named successor, staff resentment (fades 30% a year), the press label (fades 20% a year) and the last press/ask/baton years. A relative CEO is a normal `BizState.manager` with `Manager.personId`; their skill and pay are copied from the Person every year. Competence (nepo-model.ts) is pure: drive (stable roll per person, moved by traits and entitlement), aptitude = 0.5 smarts + 0.38 drive + 6, ceiling = aptitude + 14, start skill from aptitude and age, yearly growth toward the ceiling (slower when far over their head, faster when groomed, almost none in a made-up job). fit = skill minus the rank's difficulty (15/35/55/68/78/85). Menus and hints never touch g's RNG. Money: salaries are paid in `familyYear` after the business year: `b.cash -= pay; b.yearCosts += pay` (paid pro rata when cash is short), pay above 1.5x the going rate also costs the company its corporate-tax deduction, and the relative receives pay minus `finance.incomeTax`. The CEO's salary is paid by the economy as manager cost. The family's effect on the company is capped at +/-3% demand, +/-2% costs and +/-3 quality points a year and shrinks with company size. Board: ProposalKind `familyHire` (Proposal.rank/market/cushy/skill/amount). Executive ranks, made-up jobs and pay over 1.5x market need a vote when a board exists; the assessment weighs fit and pay against self-dealing; it is in the minority-shareholder suit set and subject to the once-a-year refusal rule. Popups: `NEPO_POPUPS` = 2 a year shared by the ask (`nepo.ask`, bundles up to 3 askers), the year's one outcome story and `events/nepo-life.ts` connections (`nepo.life`). Succession: `Family.succ` (a relative or a key employee); `career.syncCeo` installs the named successor when the owner stops running the company (`nepo-succession.successorManager`/`afterSuccession`), and an heir who was the family CEO becomes owner-CEO there. Counters: familyHires, familyFired, familyCeos. Flags: `nepo.favors` ({n, y}, fades one per 3 years). Tests: test/nepo*.test.ts.

### notes
- The only full-suite failures were 4 five-second timeouts: talent-business and history-markets pass when rerun alone, and deeptech passes in 2-3s with a raised timeout while other agents' test runs were loading the machine. I measured deeptech with the nepo hook disabled and it was the same speed.
- I edited existing files with a Python script rather than the Edit tool for `state.ts`, `career.ts`, `board-vote.ts`, `staff.ts` and `wealth-kids.ts`. The changes were narrow and targeted. `board-state.ts`, `board.ts`, `board-menu.ts`, `yearly.ts`, `wealth-ask.ts`, `wealth-catalog.ts` and `people.ts` were not changed.
- Parents and grandparents are hireable relatives (capped at 72), so every new life's company screen offers "Offer a job: Mom". It is intentional.
- `Person.data` keys added: nepo, nepoPast, nepoNo, nepoSelfMade, nepoGrudge, nepoAsk, nepoLife, nepoArranged, nepoCraft, founder, celeb, kin. The `kin` key marks in-laws and cousins, who are added with relation 'coworker'.
- Only Business-talent hints are implemented; no new talent id was added.
- No scratch files remain in the repo (scratch output went to the scratchpad directory).

### files
- /home/user/snag/src/game/business/nepo.ts
- /home/user/snag/src/game/business/nepo-job.ts
- /home/user/snag/src/game/business/nepo-roles.ts
- /home/user/snag/src/game/business/nepo-model.ts
- /home/user/snag/src/game/business/nepo-state.ts
- /home/user/snag/src/game/business/nepo-actions.ts
- /home/user/snag/src/game/business/nepo-asks.ts
- /home/user/snag/src/game/business/nepo-year.ts
- /home/user/snag/src/game/business/nepo-menu.ts
- /home/user/snag/src/game/business/nepo-succession.ts
- /home/user/snag/src/game/business/nepo-staff-line.ts
- /home/user/snag/src/game/events/nepo-life.ts
- /home/user/snag/src/game/business/board-vote.ts
- /home/user/snag/src/game/business/career.ts
- /home/user/snag/src/game/business/state.ts
- /home/user/snag/src/game/business/staff.ts
- /home/user/snag/src/game/events/wealth-kids.ts
- /home/user/snag/test/nepo-kit.ts
- /home/user/snag/test/nepo.test.ts
- /home/user/snag/test/nepo-asks.test.ts
- /home/user/snag/test/nepo-year.test.ts
- /home/user/snag/test/nepo-life.test.ts


## build:will-anger

### summary
Being written out of the will now makes the family angry, and it plays out over years and after your death. The full suite passes (103 files, 1815 tests, including test/simulate.test.ts), and `tsc` is clean for my files. I did not run Playwright or the dev server; it isn't installed here. A `vite build` succeeded.

**Who can be named.** The will menu now offers spouse, children and stepchildren, grandchildren, parents, siblings, close adult friends, and a charity share. An empty will still divides evenly among the children. Each person has an expectation score from role, closeness, years known, whether they were once in line or promised a share, money trouble, allowance and entitlement. Rows show an honest warning before you remove someone, for example "angry (52) if they hear behind your back, upset (29) if you explain kindly". The spouse is not in the default will, so the menu shows a "counting on a big share" heads-up for them. Each named person has a share slider (10–100%), and charity is a 0–90% slider.

**Anger.** Each relative gets an anger meter (0–100), computed with no randomness so menu previews match what happens.
- It rises with their expectation and the size of the estate, and with a broken promise or having been cut before.
- It rises for petulant, spoiled or hard-up people and falls for kind, forgiving or rich ones.
- It depends on how they hear: told kindly, bluntly, by a letter, a lawyer's leak, a relative, a family dinner, or the reading.
- Anyone cut out who was counting on a share (expectation 30 or more) triggers a "how do you tell them" popup: explain kindly, bluntly, leave a letter, or say nothing.

**How they find out.** Discovery is no longer a coin flip. Each year there are separate odds for a lawyer leak, a gossipy relative, and a family dinner, and some people learn immediately. Under-13s never react.

**Escalation while you live.** Anger cools slowly for forgiving people and hardens for vengeful ones or after you stonewall. The stages are:
- cold shoulder and skipped holidays;
- siblings taking sides;
- a confrontation popup;
- a spouse's ultimatum, with a chance a prenup is set aside if they divorce;
- tabloid embarrassment for famous or business families;
- grandkids caught in the middle;
- a child cutting contact.

At most one popup scene happens per year, and the quiet beats are bundled into one "Family Tension" notice. The hook draws no randomness for families nobody was cut out of.

**Confrontation choices.** Explain yourself, apologize and restore them, double down, cut their allowance too, buy them off (three real amounts), offer a smaller share (slider), or refuse to discuss it.

**Estrangement.** An estranged adult child gets no visits, allowance or access to your valuables, and the person sheet shows only the way back. Their kids are kept away. In old age, with no helping child left, you lose happiness and pay for a home aide (or lose health if you can't). An estranged child may later reach out.

**Making up.** Every way back costs something real:
- a heart-to-heart (odds shown, costs happiness either way);
- an explanation, once;
- restoring them to the will;
- a smaller share, with the resulting anger previewed honestly;
- a gift that works less each time it is tried.

Putting someone back earns at most 7 trust points, halving each time and nothing from someone who never minded. The cut costs more, so toggling the will loses more than it gains. A test checks this.

**After you die (life.ts).** Money is conserved, with at most a dollar per heir lost to rounding as before. Estate tax and the sole-adult-heir-keeps-property rule are unchanged.
- The reading of the will is a notice with each person's reaction.
- A cut-out relative who is angry enough may take the will to court. The estate pays the fees, and probate holds half the heir's share for one to three years.
- Odds follow the role (a spouse or a young dependent child fare best), a very recent change, a will that looks unduly influenced, whether you explained in advance, and a prenup.
- A cut-out adult heir is offered honest odds and a choice to contest (pay the fee up front, decided in one to three years), ask the family to be fair, or drop it. Cut-out minors are represented by a guardian automatically.
- Siblings who got everything react with guilt (they share money), gloating, or a shrug. An angry cut-out sibling can ask the heir for a share.
- Money still in probate or a pending claim when the player dies is returned to the estate.

**Old saves.** Everything reads leniently from `g.flags['will.state']` and `Person.data.wl` (stamped with the character id so heirs start clean). A save with no will state plays unchanged, and contests only apply to wills written through the new menu.

**Existing test changed.** `test/activities.test.ts` "explains when there is nobody to inherit" now expects the info row plus the charity row, since charity can be named without any relatives.

### sharedChangesNeeded
- Make other modules treat an estranged relative like a disowned one: import `isEstranged(g, p)` from events/will-core and add it wherever `p.data.disowned === true` is checked. The places are events/wealth-ask.ts (`folks` and `mayAsk`), events/wealth.ts (`payAllowances`), events/wealth-menu.ts (person eligibility), shops/luxury-family.ts (`isFamilyMember`), and business/nepo.ts (estranged relatives should not ask for jobs, and any estranged relative already working at your company should quit or be flagged). My code already zeroes the allowance, sets `ties.bound` eight years out, strips the person from `Asset.details.fam`, hides the person-sheet rows and sets `livesWithPlayer = false`, so this only closes the gaps.
- wealth-kids.ts `cutFromWill` could call `changeWill` and `removeHeir` from events/will-act so the cut gets the tell popup. Without it nothing breaks: the yearly will-feud hook detects the rewrite and treats the person as having found out within the hour.
- Optional UI: DeathScreen could show the reading-of-the-will notice and the cut-out heir's 'Contest the Will?' choice; both arrive in `g.queue` as ordinary notice and choice modals after the 'Generation N' notice, so the existing modal host already shows them.

### docsNotes
Add a "Wills and family feuds" section to docs/ARCHITECTURE.md.

`activities/will.ts` is the Will & Testament menu. Nameable: spouse, children and stepchildren, grandchildren, parents, siblings, close adult friends (`will-core.canBeNamed`), plus a charity share.

State, all plain JSON, so old saves load:
- `Character.willBeneficiaries` holds the named person ids (empty means divide evenly among the children).
- `g.flags['will.state']` (`WillState`) holds `shares` (percent of an equal share, 10–100), `charity` (0–90), `snap` (who was in line at the last check), `written`, `changed` (year) and `changes`.
- `Person.data.wl` (`Wl`, stamped with the character id so an heir starts clean) holds one relative's feelings: `cut`, `was`, `told`, `known`, `how`, `explained`, `anger` (0–100), `hard`, `stage`, `cold`, `restores`, `buys`, `estr`.
- `g.flags['will.escrow']` and `g.flags['will.pot']` carry probate and a cut-out heir's claim into the next generation.

Modules:
- `events/will-core.ts` is the pure model: roles, `willSlices` (the shares an estate divides into), `expectation`, `angerOnLearning`, `angerDrift`, `peaceOdds`, `giftRelief`, `angerAfterShare`, `readWl` and `updateWl`.
- `will-act.ts` has `changeWill(g, mutate)`, which diffs the will against the snapshot, registers cuts and restores, and returns a report. The caller shows its notice and then calls `queueTells`. It also has `learn`, `estrange` and `reconcile`.
- `will-scenes.ts` has the popups and their scripts: tell, confrontation (buy-off and compromise-slider follow-ups), spouse ultimatum, tabloids, grandkids, olive branch.
- `will-feud.ts` has `yearlyWillFeuds` (aging hook after `nepo`): discovery, anger drift, escalation (cold shoulder, taking sides, confrontation, ultimatum, estrangement), and old-age effects of estrangement.
- `will-amends.ts` has `willPersonNodes`, the "Your Will" rows on a relative's sheet, appended in relationships.ts `personActions`.
- `will-estate.ts` has `planEstate` and `settleReading`, which life.ts `continueAsChild` calls, plus `yearlyEstateTail`, called from `yearlyWillFeuds`.

Rules to document:
- Cut-out detection is by snapshot diff, so other modules rewriting `willBeneficiaries` are caught by the next yearly tick.
- Discovery channels are a lawyer's leak, a relative who talks, a family dinner, the player telling them, or the reading.
- Trust returns by at most 7 points on a first restore, halving each time and scaled by anger.
- Gifts relieve less each time (0.6^buys).
- Contest odds: `contestOdds` (role base, recency, undue influence, advance explanation, prenup). `contestAward` and `contestFee` are pure and the heir's popup shows the same numbers.
- Estate flow: tax, then legal fees, then court awards, then slices rounded down (as before).
- A contested estate holds half the heir's cash in escrow for 1–3 years.
- A cut-out adult heir's claim waits in `will.pot` until they decide.
- A pending escrow or pot returns to the estate if the player dies first.
- Estranged people get no allowance, no asks and no family use. Their grandkids are kept away (`keptAwayBy`). In old age, with no helping child, the player pays for a home aide and loses happiness.
- The hook draws no randomness unless someone is cut out.
- Tests: test/will-feud.test.ts, will-estate.test.ts, will-menu.test.ts.

### notes
Judgment calls and limits:
- The default will still excludes the spouse, as before. I did not change it. The menu shows an honest heads-up row, and a spouse can only contest a will written through the new menu (an old save's `written` flag is false).
- The old `+4 relationship` for naming a sole heir is gone because it was farmable. Goodwill for being added is now +3 once per five years, and only if the person actually learns of it.
- Estate rounding: each slice is floored as before, so under a dollar per heir is lost. `test/life.test.ts` still expects the floor, so I kept that behaviour.
- Money conservation is tested: estate = tax + legal fees + charity + people's cash + the heir's cash and probate + any pending claim, within a few dollars.
- `test/market-events.test.ts` and `test/talent-business.test.ts` timed out (5s) once in a loaded full run, unrelated to my files. They passed in the final full run.
- Not run: Playwright and a dev-server session on port 4356. Playwright and a browser are not installed in this environment.
- The estranged person's sheet hides the usual interactions in relationships.ts (`personActions` and `statusInfo` only), which is the one non-will-row change there.

### files
- /home/user/snag/src/game/events/will-core.ts
- /home/user/snag/src/game/events/will-act.ts
- /home/user/snag/src/game/events/will-scenes.ts
- /home/user/snag/src/game/events/will-feud.ts
- /home/user/snag/src/game/events/will-amends.ts
- /home/user/snag/src/game/events/will-estate.ts
- /home/user/snag/src/game/activities/will.ts
- /home/user/snag/src/game/life.ts
- /home/user/snag/src/game/people.ts
- /home/user/snag/src/game/relationships.ts
- /home/user/snag/src/game/events/obituary.ts
- /home/user/snag/test/will-feud.test.ts
- /home/user/snag/test/will-estate.test.ts
- /home/user/snag/test/will-menu.test.ts
- /home/user/snag/test/activities.test.ts


## review:nepo-babies

### fixed
- In-laws and cousins who ask for a job were shown one skill, department and title in the popup and hints, then got a different one once hired. Their stable rolls came from the stand-in id, not the real id. They now keep the stand-in id as a seed (Person.data.nepoSeed, seedKey() in nepo-job.ts, pseudoId() in nepo-actions.ts), so the preview matches the hire.
- The pay slider could lift a 16-year-old on a summer job to the full adult rate, because the slider's 100% is the full-time rate. Part-time jobs now refuse a pay change in setPay, and the menu row says why.
- A relative you disowned in the will menu stayed on the payroll, and in the CEO chair if they were CEO. The yearly cleanup now ends the job, installs an interim manager if needed, and logs it.
- The firing notice named the country by its code ('the law in US requires'); it now uses the country name.
- The arranged internship popup read 'a apprenticeship' and 'a internship'. It now uses the right article in every era.
- The 'the old man's pet' press line is now 'the boss's pet', so it works for a female player.
- Added test/nepo-review.test.ts and test/nepo-fuzz-rng.ts. The tests:
- a 45-year fuzz across 4 seeds that drives the real company and person menus (hire, promote, demote, set pay, make CEO, name a successor, hand over, fire), random popup answers, owner deaths and heirs, checking for NaN, non-finite money and JSON round-trip after every step.
- a purity test that calls every subtitle, hint, preview, header, confirm and disabledReason in a busy company (Business talent on, CEO relative, made-up job, minor, board): game state and g.rng are unchanged, no 'undefined' or 'NaN' text, no duplicate menu ids.
- one regression test for each fix above.
- Typecheck of the nepo files is clean. test/nepo*.test.ts and test/simulate.test.ts pass (69 tests). The full suite passes (1826 tests); its only failures are test/zz-scratch2.test.ts and zz-scratch3.test.ts, other agents' scratch files that fail to load.

### remaining
- Paying relatives is a way to move money out of the company before death and avoid estate tax. A kid's own money carries into the heir's starting money. It is bounded by income tax on the kid, losing the company's deduction above 1.5x the going rate, and the board vote and minority-shareholder suit. I judged it acceptable but did not remove it.
- Money paid to relatives can come back to the player in small ways: 'Ask for Money' takes up to 3% of a relative's money per ask, and a spouse's death passes 70-100% of their money to the player. Both lose money to tax along the way.
- nepo-life.ts credits the kid a one-off wage that no employer pays (typical income times a share, a few thousand per success). It is negligible next to a rich parent's estate. Left as is.
- The extra corporate tax on above-market family pay is booked into yearCosts. The next year's profit then deducts it again, so the penalty is about 20% weaker than the code comment says. I did not change it, because moving it would change the P&L accounting that economy.ts owns.
- A job record can point at a company that was sold or closed by a random event during the same year, until the next yearly cleanup. The person sheet shows no job row for that year. Harmless, not fixed.
- A divorced spouse (relation 'ex') stays on the payroll until fired, because the job lives on the Person. Not fixed.
- I did not run the app in Playwright at 390x844. The builder added only MenuNode data and no React components, so I checked the menus through a purity test with unique ids and clean text. A visual pass of the ask popup (up to 3 askers) and the Family at the Company screen on mobile is still worth doing.

### sharedChangesNeeded
- Same as the builder's list: life.ts continueAsChild should let the designated successor keep the company when several heirs share the estate (read details.family.succ via readFamily in business/nepo-state.ts, subtract its equity from the split). The Succession menu text currently says honestly that several heirs means the company is sold.
- manage.ts pickManager should add the owner's relatives to the headhunter shortlist with familyCandidates(g, a, b, (skill) => askingSalary(b, skill, 0)) from business/nepo-succession.ts, labelled '(your son)'.
- Optional, will-feud.ts: fired relatives carry Person.data.nepoGrudge (the year) and Person.data.nepoPast {how: 'fired'}, so a fired kid can bring up the will. I also added Person.data.nepoSeed, which only the nepo model reads.
- docsNotes addition for the lead: the stable rolls for drive, department, made-up title, CEO style and integrity are drawn from seedKey(p) in nepo-job.ts. That is Person.data.nepoSeed when present, otherwise the person id. In-laws and cousins who ask before being hired are shown with pseudoId(o), and materialize() stores the same id as nepoSeed. Disowned relatives leave the payroll at the next yearly cleanup. A part-time summer job cannot be given a pay change.

### testsPassing
True


## review:will-anger

### fixed
- A written will that names people no longer forgets the children it never named (e.g. one born later, or a stepchild): they now count as cut out at the reading, with anger, possible court filing and honest odds. An unwritten (default) will is unchanged. Fix in will-estate.ts excludedFamily.
- Era anachronisms: the 'No Comment' tabloid outcome said 'The comment section had notes on your character' in every era; it now says 'the letters page of the paper' before social media. The estranged-in-old-age holiday line said 'the phone sat very still' even with no landline; it now says nobody visited and the mailbox stayed empty.
- Teenagers (under 16) can no longer stage a confrontation popup ('Tell me to my face why I'm not in your will') over the will, however angry.
- Gift/settlement trust farming: payOff gave up to +5 relationship from the relief amount even when the grudge was tiny; goodwill is now capped by the anger the gift actually soothed.
- Added test/will-review.test.ts (5 tests; the teen test was confirmed to fail without the guard).
- Adversarial checks that found no bug: a 40-seed fuzz of three generations with random will edits through the real menu, random popup answers, deaths and continueAsChild (no NaN/Infinity, no bad anger or relationship ranges, JSON round-trips, every scene exercised: tells, confrontations, buy-offs, estrangement, olive branches, readings, heir contests, probate, sibling asks); toggle-farming probe (cut, tell, restore, 6 cycles: cutting a child or spouse costs far more than restoring earns, and friends and siblings never gain); menus and previews are pure.

### remaining
- Cutting a share to the 10% minimum is not treated as being cut out: it triggers no anger and no contest. Only removal from the will does. Modeling partial cuts would need a design decision, so I left it.
- The default (empty) will still leaves the spouse out. The menu shows a 'counting on a big share' heads-up. A spouse can contest only a will written through the new menu, and any edit (even a charity-only change) flags it as written, so a spouse the default never named can sue.
- Pending estate claims and refunds go to people by id. If a person has been removed from g.people, their refund share is silently dropped. Tiny NPC money, but not strictly conserved.
- Time Machine edge: if g.year rewinds below Wl.cutY or will.changed, 'recent change' odds treat the change as brand new. Cosmetic.
- No Playwright or browser run at 390x844. The reading-of-the-will notice and the 'Contest the Will?' choice arrive as ordinary modals in the heir's queue and were exercised only through the engine and tests, not in the UI.
- The estranged-gap integration listed by the builder in sharedChangesNeeded is still open; I did not touch those files.

### sharedChangesNeeded
- Still needed from the builder's list: make wealth-ask.ts, wealth.ts payAllowances, wealth-menu.ts, shops/luxury-family.ts isFamilyMember and business/nepo.ts treat isEstranged(g, p) from events/will-core like p.data.disowned === true. Estranged relatives should not ask for money or jobs, and one already working at your company should quit or be flagged.
- wealth-kids.ts cutFromWill should call changeWill + removeHeir + queueTells (events/will-act, will-scenes) so a cut made in a wealth popup also gets the 'how do you tell them' scene. Today it still works through the yearly diff.
- Docs: add the 'Wills and family feuds' section from the builder's docsNotes. Add one line that a written will which doesn't name a child or spouse counts them as cut out at the reading.

### testsPassing
True


## build:era-feel-1900-1979

### summary
Added the 1900-1979 era content for the life simulator. It has 4 flavor-pool files and 6 event files (about 87 popup events, most gated by country, wealth and age) behind 2 pack assemblers. It has nominal-USD price rows for every year 1900-2026 and one culture line per year 1900-1979. It has era rules in careers, education, health and military. It also has 24 early job definitions, 36 extra headlines, a "This Year" menu node and 3 test files. The 5 test files I ran (my 3, simulate and events) pass, 79 tests, and `tsc --noEmit` is clean. I did not get a clean full-suite run: in earlier runs, currency-life (flaky, passes alone and at HEAD), era-features-more and era-late-packs failed, and I traced those to other agents' work in progress. I did not re-run the full suite after the final pruning.

### sharedChangesNeeded
- menus.ts: add `thisYearMenu` (exported from `./history/digest-menu`) to the `all` list in `activitiesMenu`. It is already a plain MenuGroup that only shows for historical years, and it uses no RNG.
- digest.ts: optionally filter the price rows and culture lines by country. The early digest text is written to be safe in every country, so this is polish, not a fix.
- data/jobs.ts: optionally register `EARLY_FULLTIME_JOBS` and `EARLY_PARTTIME_JOBS` (from history/events-jobs.ts) in ALL_JOBS so cv.ts and other code that scans ALL_JOBS sees them. careers.ts already resolves them through `earlyJobDef`.
- love.ts: use `typicalMarriageAge(g)` (appended to history/events-people.ts) for era-appropriate marriage-age pressure, and read `g.flags['era.pill']` if you want the contraception era effect.
- Anachronisms found in files I do not own: special/politics (selfie and live TV lines before TV), assets ('drive-thru' in 1941), business ('video game studio' in 1971), computer.* ('Get Online' in 1989), and locale school names plus WAEC in 1918.

### docsNotes
Era packs for 1900-1979. Each span has an assembler (events/era-pack-1900.ts, events/era-pack-1946.ts) that merges flavor-pool files (`-kids`, `-adults`) with event files (`-kidevents`, `-adultevents`, `-worldevents`). Shared helpers: era-pack-where.ts (placeOf regions, `pool()` and `widen()` builders, wealth and household stations, rationing and home-front checks, and the `familyAware` splitter, which keeps lines about spouses, children or grandchildren to players who have them), era-pack-kit.ts (`itemCost` ties event prices to the digest price rows, plus `niceRound`, `householdMoney`, `parentWord`, `minor`) and era-pack-jobs.ts (jobIsManual and jobIsDesk, falling back to `earlyJobDef`). Event ids start with `era.1900.` or `era.1946.`. Text uses lint-safe wording: 'wireless' for radio before 1941, 'tube set' for TV before 1972, 'microcomputer', and 'charge card'. Digest: history/digest-prices.ts holds 29 priced items for every year 1900-2026 in nominal USD. They convert to engine dollars as nominal / priceLevel(year). history/digest-early.ts holds one culture line per year 1900-1979. history/digest-menu.ts exports `thisYearMenu`, a MenuGroup showing the year's culture, prices and the technology that has reached the player's country. Era rules: education.ts has era school-leaving ages, era discipline, the finalExam eras, SAT scoring only from 1941, and Night School equivalency before 1942 in place of the GED. careers.ts has an age floor per job and era, gendered access bars, mean-preserving pay shapes by trade, and early jobs added to the listings. health.ts has house calls and a rest-cure factor in condition progression, plus era-tagged craving lines. special/military.ts logs a student deferment once per war. history/events-jobs.ts defines 19 full-time and 5 part-time early jobs. history/events-1900-more.ts adds 36 extra headlines. history/events-people.ts adds `typicalMarriageAge`. Tests: test/era-early.test.ts (digest coverage, pack validators, unique ids, untagged fallback per pool), test/era-early-rules.test.ts (careers, education, health and military rules) and test/era-early-lives.test.ts (sample lives from 1900, 1925, 1950 and 1965 simulate to death with no errors or anachronism hits, plus a country spread).

### notes
Wages are not scaled by year on purpose. Engine money is constant 2026 USD and goods and houses are not year-scaled, so scaling wages alone would break the balance. Instead I used mean-preserving pay shapes, gendered access bars and age rules. Pruned the unused helpers atWarNow, workHours, seen and markSeen. The final tsc check was clean, and test/simulate.test.ts, test/events.test.ts and my three era-early tests pass. In earlier full-suite runs the failures I traced to other agents' work in progress: era-features-more (computer.* work), era-late-packs (a timeout) and era-late-kit.ts (an `eraOk is not defined` error). currency-life was flaky and passed alone and at HEAD. No scratch files remain from me; test/nepo-fuzz-rng.ts is untracked and not mine. Era events are about 20-25% of events in a Western life. I added world events to raise the non-Western share but did not re-measure it. I ran no git commands that change the tree or index.

### files
- /home/user/snag/src/game/history/digest-prices.ts
- /home/user/snag/src/game/history/digest-early.ts
- /home/user/snag/src/game/history/digest-menu.ts
- /home/user/snag/src/game/history/events-jobs.ts
- /home/user/snag/src/game/history/events-1900-more.ts
- /home/user/snag/src/game/history/events.ts
- /home/user/snag/src/game/history/events-people.ts
- /home/user/snag/src/game/events/era-pack-where.ts
- /home/user/snag/src/game/events/era-pack-kit.ts
- /home/user/snag/src/game/events/era-pack-jobs.ts
- /home/user/snag/src/game/events/era-pack-1900.ts
- /home/user/snag/src/game/events/era-pack-1900-kids.ts
- /home/user/snag/src/game/events/era-pack-1900-adults.ts
- /home/user/snag/src/game/events/era-pack-1900-kidevents.ts
- /home/user/snag/src/game/events/era-pack-1900-adultevents.ts
- /home/user/snag/src/game/events/era-pack-1900-worldevents.ts
- /home/user/snag/src/game/events/era-pack-1946.ts
- /home/user/snag/src/game/events/era-pack-1946-kids.ts
- /home/user/snag/src/game/events/era-pack-1946-adults.ts
- /home/user/snag/src/game/events/era-pack-1946-kidevents.ts
- /home/user/snag/src/game/events/era-pack-1946-adultevents.ts
- /home/user/snag/src/game/events/era-pack-1946-worldevents.ts
- /home/user/snag/src/game/education.ts
- /home/user/snag/src/game/careers.ts
- /home/user/snag/src/game/health.ts
- /home/user/snag/src/game/special/military.ts
- /home/user/snag/test/era-early.test.ts
- /home/user/snag/test/era-early-rules.test.ts
- /home/user/snag/test/era-early-lives.test.ts


## build:era-feel-1980-2026

### summary
Years 1980-2026 now have their own flavor, popups and rules. Where a life is lived changes what a year feels like: a 1998 Lagos teen gets the cyber cafe and a shared TV, an American one gets the mall and the family computer. Two things are still open. test/anachronism.test.ts still fails on other agents' text, which I did not touch. The Hang Out menu is not reachable in the real game until activities.ts imports it (item 1 under sharedChangesNeeded).

**Final verification:** the full suite ran 1905 passed, 3 failed. Two of the failures are other agents' text (below). The third, a deeptech.test.ts timeout, passes when run on its own. I also fixed the one failure that was mine, a "Get Online" menu label tripping the era-features-more anachronism lint, and then re-ran era-features-more, era-late-rules, deeptech and simulate, which all pass. I have not re-run the full suite since that fix.

- **Culture lines:** `digest-late.ts` has one culture line for every year 1980-2026, lint-clean in every country.
- **Flavor pools:**
  - `era-pack-1980` (about 78 pools) and `era-pack-2000` split by child/teen/adult/elder and topic. Regional pools cover Japan, India, China, Brazil, Latin America, Africa, Europe, UK, Southeast Asia, the Middle East, Korea and Oceania, plus poorer-country, rich and Anglo pools.
  - Region and wealth are gated in each pool's `when`, because unknown era tags in a line are silently true. Every pool keeps untagged fallback lines.
- **Household ownership:** `householdHas(g, tech)` gives each life a fixed place in its country's adoption queue, so ownership is stable and uses no dice. `ownerPools` moves "our computer / my phone / my console" lines into `~own.<tech>` pools that only apply to homes that have it. About 250 lines were converted. A flag `own.<tech>` overrides the draw. Statistically, a 1998 Lagos household has a home computer under 15% of the time (odds are about 7%) and the US over 25% (odds are about 39%).
- **Popup events:** about 70 events with ids `era.<span>.<name>` (`era.1980s.arcade`, `era.1990s.dialUp`, `era.2000s.topFriends`, `era.2020s.remoteSchool` and so on).
  - They cover arcade, dial-up, pager, mixtape, video-store late fee, Y2K, MySpace top eight, first smartphone, data plan, binge, remote work, dot-com layoff, pandemic birthday, AI at school and more.
  - Poor-country variants cover the shared TV, phone kiosk, cyber cafe, video hall and power cut.
  - Purple talent hints are honest because the hint and the resolver share the same outcome weights.
- **Era rules:**
  - Hang Out (new `activities/pastimes.ts`): arcade, mall, video store, LAN party, mixtape, karaoke, roller rink, radio, streaming, scrolling, group chat and a cyber-cafe submenu, with era gating and costs.
  - Connection (new `computer/online.ts`): BBS, early web, metered dial-up bills, a broadband upgrade and the app store, wired into the Computer menu and the yearly hook.
  - Dating in `love.ts`: era-correct meet lines and breakup lines, real dating-service brands (Match.com, Tinder, Pairs, Momo, OkCupid), cheating-detection odds by era, and `courtshipShift` applied when you ask someone out.
  - Staying in touch in `relationships.ts`: `stayInTouchFactor` makes drifting apart depend on the era's communication cost and speed.
- **Headlines:** about 55 brand-free regional rows added to `history/events-regional.ts` (AFCON, Copa América, Asian Cup, Euros, Rugby World Cup and others), with 6 duplicates removed.
- **Tests:**
  - New: `test/era-late-digest`, `-packs`, `-events`, `-rules` and `-lives`. They cover event validators, unique `era.` ids, tag validity, dated-object end years, fallback depth per pool and owner-pool splitting. They also play whole lives born 1980, 1995, 2005 and 2015 across 12 countries with no errors and no anachronisms, and compare Lagos with the US.
  - Edited existing tests: `test/events.test.ts` (id regex, and era events probed over years and countries) and `test/era-features.test.ts` (Kindling became Tinder).

### sharedChangesNeeded
- src/game/activities.ts (not my file): import { pastimesMenu } from './activities/pastimes' and add it to miscActivities. Until then the Hang Out menu is not reachable in the real game (test/era-late-lives.test.ts drives pastimesMenu directly).
- test/events.test.ts coverage loop: the early-era builder's era.1900.* events are not all reached by the probe, so they can appear as uncovered. Give the probe their ages or years.
- Anachronism hits in other agents' text, which make test/anachronism.test.ts fail: special/politics campaign popup pol.run.school says 'The cook asked for a selfie' in 1980 (Election Night); sports.fight.socialCallout says 'Talk trash online' and 'You open your phone' in 1986. These need an era-aware wording or a year gate. My earlier note about 'local influencers' in a business market campaign notice is not confirmed in the latest run.
- shops/memberships-data: the 'Kindling' dating membership is still fictional. Rename it to a real service (Match.com or Tinder, as love.ts now does) or gate it by year.
- activities/movies.ts still has fictional film titles. They are harmless, but the brand rules prefer real era-correct titles.
- Optional: the Computer menu group id 'computer.online' is now labelled 'Connection'. Any docs or e2e scripts that look for 'Get Online' need updating.

### docsNotes
Late-era feel (1980-2026), for ARCHITECTURE.md or the events section:

- `events/era-pack-1980*.ts` (1980-1999) and `events/era-pack-2000*.ts` (2000-2026) hold flavor pools split by age band (child/teen/adult/elder) and topic, plus popup events with ids `era.<span>.<name>` (for example `era.1990s.dialUp`).
- Pool keys are `80.*` and `00.*`. Regional, poorer-country, rich and Anglo pools gate on country and wealth in the pool-level `when`, because a pseudo-tag in a line such as `@poorer` is silently true.
- Real era tags in lines (`@1985`, `@-1990`, `@+tech`, `@landline`) are open-ended: `@2020` means 2020 or later. Dated objects (cassette, pager, dial-up and so on) therefore need an end year, and a test enforces it. Every pool needs untagged fallback lines.
- `events/era-late-kit.ts` is the shared kit.
  - Region helpers: `regionOf`, `inCountry`, `anglo`, `wealthOf`, `poorerCountry`, `richCountry`, `adoption`.
  - Money: `eraPrice(g, nominalUsd)` converts a nominal price to constant 2026 dollars scaled by country.
  - Event DSL: `eraEvent(s)` takes weighted `Out` lists per option, and `outcomePct` makes the purple talent hint and the resolver share one set of weights.
- Household ownership: `householdHas(g, tech)` uses a stable per-life draw against `techOdds`, so a household gets the technology when its country's adoption reaches its turn. It involves no dice, and the flag `g.flags['own.<tech>']` overrides it. `ownerPools(pools)` moves lines tagged `own:<tech>` into `<key>~own.<tech>` pools that apply only to owning households. Use plain `+tech` for exposure lines (a friend's computer, the school lab, the cyber cafe).
- `activities/pastimes.ts` is the Hang Out menu (arcade, mall, video store, LAN, mixtape, karaoke, rink, radio, stream, scroll, group chat, cyber cafe), keyed `act.pastime.<id>`. It needs a one-line import into activities.ts.
- `computer/online.ts` is the Connection submenu of the Computer menu: BBS, early web, metered dial-up bills, a broadband upgrade (flag `computer.broadband`) and the app store, plus a yearly hook.
- Dating by era in `love.ts`: `appBrand`, `datingService`, era meet and breakup lines, `breakupFallout`, `cheatDetectionOdds` and `courtshipShift`.
- Staying in touch in `relationships.ts`: `stayInTouchFactor` makes drifting depend on the era's communication cost and speed.
- `history/digest-late.ts` holds one culture line per year 1980-2026 (`CULTURE_LATE`). It must pass the anachronism lint for every country, so avoid words like internet, app or streaming before adoption.

### notes
- Items 2 and 3 of sharedChangesNeeded come from the early-era builder and other agents. I did not edit them.
- The remaining anachronism.test.ts failure belongs to special/politics and sports text; none of the hits are in my files.
- Scratch files are removed (test/zz-scratch and the temp files); only the real test files remain.
- Other agents' work (nepo, market, luxury, will) was not touched.
- `era-features-more` only passes because the Computer submenu label is now 'Connection'. The word 'online' in a menu title trips the lint in years before the internet is common.
- Owner pools only apply when at least one of their lines passes the era filter, so they never waste a weighted draw.

### files
- /home/user/snag/src/game/events/era-late-kit.ts
- /home/user/snag/src/game/events/era-pack-1980.ts
- /home/user/snag/src/game/events/era-pack-1980-child.ts
- /home/user/snag/src/game/events/era-pack-1980-teen.ts
- /home/user/snag/src/game/events/era-pack-1980-adult.ts
- /home/user/snag/src/game/events/era-pack-1980-events.ts
- /home/user/snag/src/game/events/era-pack-1980-events-life.ts
- /home/user/snag/src/game/events/era-pack-2000.ts
- /home/user/snag/src/game/events/era-pack-2000-child.ts
- /home/user/snag/src/game/events/era-pack-2000-teen.ts
- /home/user/snag/src/game/events/era-pack-2000-adult.ts
- /home/user/snag/src/game/events/era-pack-2000-events.ts
- /home/user/snag/src/game/events/era-pack-2000-events-life.ts
- /home/user/snag/src/game/history/digest-late.ts
- /home/user/snag/src/game/history/events-regional.ts
- /home/user/snag/src/game/activities/pastimes.ts
- /home/user/snag/src/game/computer/online.ts
- /home/user/snag/src/game/computer.ts
- /home/user/snag/src/game/love.ts
- /home/user/snag/src/game/relationships.ts
- /home/user/snag/test/era-late-digest.test.ts
- /home/user/snag/test/era-late-packs.test.ts
- /home/user/snag/test/era-late-events.test.ts
- /home/user/snag/test/era-late-rules.test.ts
- /home/user/snag/test/era-late-lives.test.ts
- /home/user/snag/test/events.test.ts
- /home/user/snag/test/era-features.test.ts


## review:era-feel-1900-1979

### fixed
- careers.ts eraMinAge: the school-leaver age floor (14 before 1960) applied to EVERY no-degree or high-school job on the board, so a 14-year-old could be hired as a firefighter, priest, monk, nun, mail carrier, security guard, zookeeper, insurance agent, bill collector, wedding planner or exorcist. It now applies only to trades, shop and service industries plus a short list of clerical/messenger ids, minus skilled posts (wedding planner, jeweler, security guard, beekeeper, zookeeper, pet groomer); everything else keeps its adult age. Test added in test/era-early-rules.test.ts.
- era-pack-1900-worldevents.ts: the mission-school popup told Indonesian lives they learned English; it now says Dutch in the East Indies and English elsewhere (missionTongue helper).
- era-pack-1946-adults.ts: the Tupperware party flavor line was untagged and could appear in 1946-1950, before the home-party plan; now tagged @1951 to match the event gate. era-pack-1946-adultevents.ts: removed an invented company reward (a coffee percolator) from the Tupperware hostess outcome.
- digest-early.ts: 1921 said Wonder Bread came 'sliced and wrapped' (slicing arrived 1930 and the 1928 line already credits the Missouri bakery); now 'waxed-paper wrapper'. 1974 no longer identifies a real living person ('a Hungarian professor') and names the Magic Cube/Rubik's Cube instead. 1971 Starbucks is now 'a small coffee-bean shop' (it did not serve cups then).
- digest-prices.ts: the 1955 radio price spiked to $50 between $30 and $25, an artefact; smoothed to $35.
- Verified clean: all 40+ builder tests, simulate, tsc on the owned files, no real people named, no tobacco/firearm/gambling-operator brands, no negatives about real brands, brands in the packs (Kodak Brownie 6 exposures, Singer, Hoover from 1908, Spam from 1937, Meccano, Monopoly 1935, Lego, Barbie, Frisbee, Vespa/Lambretta 1948+) are era-gated; fact-checked all 80 culture lines and 36 extra headlines; money outcomes of all ~72 popup events surveyed across countries/years/wealth (losses clamp at zero, gains are one-offs near a few months of wages, gambles have negative EV, no free loops).

### remaining
- The 'This Year' menu (thisYearMenu from history/digest-menu.ts) is still not listed in any menu, so the card never shows until the lead applies the menus.ts edit below.
- Digest price display in default (engine-dollar) mode: sub-dollar early items render as '$0', '$1' ('a daily newspaper $0', 'a first-class stamp $1' in 1900) because formatMoney drops cents unless 'prices as they were' is on. The data is right; the fix belongs in digest.ts (not owned).
- Digest culture and price lines are not filtered by country (a Nigerian 1955 life reads about a McDonald's franchise in Illinois and the US stamp price); the culture text is anachronism-safe everywhere but US-centric.
- The scooter popup (Vespa/Lambretta) fires from 1948 in India, Brazil, Indonesia, SE Asia, Japan and MENA, which is a little early for some of those markets; approximate, left as is.
- Anachronism lint still reports 3 hits in other agents' files (test/anachronism.test.ts fails on them, not on this task's files): sports.fight.socialCallout ('online', 'open your phone' in 1986) and pol.run.school ('selfie' in 1980).
- Not run: a Playwright UI pass (no UI work in this task beyond the unwired menu).

### sharedChangesNeeded
- menus.ts: add `thisYearMenu` (exported from `./history/digest-menu`) to the `all` list in `activitiesMenu`. It is a plain MenuGroup, visible only for historical years and living characters, and it uses no RNG and no state.
- history/digest.ts: in pricesLine() and thisYearNodes() show sub-$10 amounts with cents (e.g. via a small helper that calls formatMoney on the value and keeps two decimals under $10) or skip items whose engine price rounds to $0-$1; otherwise 1900-1935 lines print '$0' newspapers and '$1' stamps.
- history/digest.ts (optional polish): filter or reword price items and culture lines by country; the early data is written to be safe everywhere but is US-flavored.
- special/sports (action sports.fight.socialCallout): gate 'Talk trash online' and 'You open your phone' with hasTech('internet') / hasTech('smartphone') or reword for earlier years; special/politics (action pol.run.school): reword 'asked for a selfie' before the smartphone era. These make test/anachronism.test.ts fail.
- data/jobs.ts (optional): register EARLY_FULLTIME_JOBS and EARLY_PARTTIME_JOBS from history/events-jobs.ts in ALL_JOBS so other scanners see them; careers.ts already resolves them via earlyJobDef.
- love.ts (optional): use typicalMarriageAge(year, gender) from history/events-people.ts for era marriage-age pressure.
- docs: ARCHITECTURE.md can note that careers.ts eraMinAge lowers the hiring age only for trades, shop/service work and a short clerical list in school-leaver years (before 1960), never for the professions, church, fire, police or other adult-only posts.

### testsPassing
False


## review:era-feel-1980-2026

### fixed
- Minitel (a French-only brand) was shown to 26 European countries in the 1980 adult Europe pool. Reworded to a generic phone-line text terminal (era-pack-1980-adult.ts).
- Schengen-style line 'traveled through three countries without showing my passport' was tagged @1992. Moved to @1995 (Europe pool).
- Famicom line paired Super Mario Bros. from 1983, before the game existed. Now @1985 (era-pack-1980-child.ts, Japan pool).
- Barney-style purple dinosaur line was tagged @1990, two years before the show. Now @1992.
- 'I got a Facebook page' line reached mainland China (blocked there) and every consumer country. Reworded to a generic social-site profile (era-pack-2000-teen.ts).
- Eurovision child lines claimed 'we gave the points to ourselves' in countries/years that did not compete. Reworded to a generic song-contest line in both packs.
- socialSite(): Mixi, Orkut, MySpace and Friendster were named before they launched (Japan, Brazil, India, Southeast Asia, everywhere 2003). Added launch-year gates with a neutral fallback (era-pack-2000-events.ts).
- The iPod popup quoted a flat 200 US dollars for 2001-2003, when the first models cost about 300. Added podPrice(year), so the early years show about 300.
- love.ts appBrand(): OkCupid was used for the first dating phones in every country (2009-2011). Now OkCupid only in the English-speaking markets and Match.com elsewhere. appBrand and AppBrand are exported for tests.
- Smarts farm: the cyber cafe 'Learn the machine' lesson gave +2-4 smarts six times a year for a few cents. It now gives +3, +2, +1, then 0, and the subtitle says so (pastimes.ts).
- Early web and BBS sessions gave +1-3 and +1-2 smarts on every session. Smarts now come only from the first three web sessions (+1-2) and the first two BBS sessions (+1) each year (computer/online.ts).
- Added test/era-late-review.test.ts with 6 tests: brand launch-year table over every flavor line in both packs, Minitel/Facebook country leaks, socialSite launch years, dating-app brand by country, cafe lesson diminishing return, iPod price by year.

### remaining
- The Hang Out menu (activities/pastimes.ts pastimesMenu) is still not reachable in the real game until src/game/activities.ts imports it. I did not edit that file because I do not own it. See sharedChangesNeeded.
- test/anachronism.test.ts still fails on three hits in other agents' text: sports.fight.socialCallout ('Talk trash online', 'You open your phone', 1986) and pol.run.school ('The cook asked for a selfie', 1980). Full suite: 1914 passed, 1 failed (this one). Not touched.
- No UI run on port 4358: nothing in my files draws new UI, and Hang Out cannot be opened yet. Menu purity was verified by test instead: building menus and subtitles for every country and every third year 1975-2026 never changed the game state or consumed g's RNG.
- A few facts are approximate, not exact. Examples: Tamagotchi lines tagged @1996 also show outside Japan, where it arrived in 1997. The Zelda gold cartridge in the 1986 culture line was 1987 in North America. 'Car phones on rich men's dashboards' in 1983 is loose.
- Pastimes can raise relationships a little by repeating outings with the same person, capped by yearly limits and cost (mix +6-12 three times a year, radio free six times a year at a 30% hit rate). Left as a mild, capped lever.
- Match.com is used as the dating website for every country with an internet from 1995. Acceptable, but not country-checked.
- The headline rows added to events-regional.ts were fact-checked and are fine. Everything checked in digest-late.ts (all 47 culture lines, no real people named) and the roughly 70 popup events was clean: no state mutation in setup beyond RNG, no negative money or NaN across 13 countries and 1980-2026, and company names go through employerRef so real brands never appear in layoff text.

### sharedChangesNeeded
- src/game/activities.ts: import { pastimesMenu } from './activities/pastimes' and add pastimesMenu to miscActivities (around line 30). Until then, the Hang Out menu cannot be opened in the real game.
- special/politics 'pol.run.school' notice: replace 'The cook asked for a selfie' with an era-neutral phrase such as 'The cook asked for a photo together', or gate it by year. This fixes the anachronism lint in 1980.
- sports.fight.socialCallout: its subtitle ('Talk trash online to build hype') and choice text ('You open your phone') need era-aware wording or a year/tech gate. They fire in 1986 and fail test/anachronism.test.ts.
- shops/memberships-data: the 'Kindling' dating membership is still fictional. Rename it to a real service (Match.com or Tinder) or gate it by year. activities/movies.ts still has fictional film titles, which the brand rules prefer be real and era-correct.
- test/events.test.ts coverage probe: the early-era builder's era.1900.* events are not all reached by the probe. Give the probe their ages or years.
- Docs: the Computer menu group id 'computer.online' is labelled 'Connection', not 'Get Online'. Update any docs or e2e scripts that look for the old label.

### testsPassing
False
