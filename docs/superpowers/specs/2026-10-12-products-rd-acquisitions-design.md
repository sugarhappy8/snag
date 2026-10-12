# Products, R&D and Buy-outs 2.0 — design

Date: 2026-10-12 · Status: implemented in v2.3.0

## Player feedback

A 1930 Japanese power company showed an R&D slider for "Street Lighting" running from ¥110K to
¥18M with a ¥441K default and the preview "+10% demand while fresh if it works". The player asked:

1. R&D must not scale with how much money the company has.
2. A product should win customers from rivals when it is better than theirs, not add a flat
   demand bonus.
3. Every product should add its own demand, following that product's real historical demand,
   and those demands should stack.
4. Buying out a rival should bring its products "and whatnot".

The exact-amount field also showed `441326.96`: a suggested budget converted from dollars, never
rounded in the player's currency.

## What changes

### 1. R&D costs belong to the product

- `rdCost(b, idea)`: a fixed development cost per idea, from the trade's cost of one site in the
  home city (`localEcon(...).capital`), the kind of line (a next generation or premium edition costs
  more than a regional edition or a bundle) and the size of the product's market. Company cash,
  revenue and valuation play no part.
- The slider runs from half to four times that cost, the same for a corner shop and a giant. Cash
  only decides whether the company can pay (the action explains how much is missing).
- A team can run a few projects at once without strain: one more slot per doubling of the
  company's sites. Projects beyond that stretch the team (the same money buys less).
- A bigger budget still means likelier, faster and better, with diminishing returns. "Better" is
  now the line's own quality, quoted against the rivals' versions.

### 2. Product lines compete head to head

- Every line has its own quality (fixed at launch; rivals' versions catch up a little every
  year, fastest in tech).
- Rivals offer each kind of product once it has caught on in their market (big rivals first),
  each at its own quality. A line's pull is its kind's share of demand times its edge over the
  rivals that offer it: `2^((quality − field quality) / 15)`, plus up to +80% while few rivals
  offer that kind at all (early movers win).
- The pull lifts the company's own pull in the market model (competition-core): its share rises
  and the rivals' falls. Rivals whose versions are worse than yours lose those customers first;
  rivals with better versions keep theirs (the rivals' total is redistributed by product quality,
  so the player's share is computed once).

### 3. Real historical demand per kind of product, stacking

- `product-data.ts` holds a demand curve for every product the game offers: first year sold,
  the year it went mainstream, its size against a typical line of the trade, and when and how far
  it declined (coal plants after 2008, house calls after the 1930s, cronut knockoffs after 2014).
  Products tied to a technology follow the game's real adoption curves (a smartphone chip follows
  smartphones). Poorer countries adopt later, as with technologies.
- Lines of different kinds stack one for one. Variants of one kind (premium, budget, regional
  editions, bundles, add-ons, next generations) share that kind's demand: the best line counts in
  full, the others add a little. A soft ceiling keeps a vast range from multiplying demand
  without end, and the old complexity costs still make product spam lose money.

### 4. Buy-outs bring what the rival had

`acquireRival` now hands over, besides most of its customers:

- its product lines that you don't sell yet, at its quality (and upgrades your line of a kind
  where its version was better);
- its sites, spread over your country's biggest cities instead of piled into one;
- some of its know-how (your quality moves part of the way toward its own when it was better)
  and a little brand.

The quote, confirmation and notice list all of it; the rival profile lists its products.

## Old saves

Lines without a quality get one from their old demand boost; projects in development keep their
budget, odds and timing and get a quality the same way. Nothing is paid or refunded.

## Also

Money sliders that open on a suggestion (R&D budgets) start on a round number in the player's
currency.
