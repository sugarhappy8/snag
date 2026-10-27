# The ledger

Since R2 (v5.0.0) every dollar has a counterparty. Money does not just appear in the player's wallet or vanish from it: it moves
between two accounts, and the books say which. This page is the model, the vocabulary, the recipes and the guards. The code is
`src/game/kernel/ledger.ts` (the books), `kernel/reasons.ts` (the vocabulary), `kernel/spreads.ts` (bid and ask), `src/game/cash.ts`
(everything that is not the player's wallet) and the three primitives in `src/game/core.ts`.

## The model

- An account is a string: `person:<id>`, `firm:<id>`, `bank:<id>`, `gov:<country>`, `pool:<name>`, `pool:hh:<country>` or `abroad`.
  Its balance is the net of every dollar that ever moved through it, in whole dollars, and may be negative. Nothing invents an
  opening balance, so a save from before R2 loads with empty books and every pool starts at 0. A balance that returns to 0 is deleted.
- The player is `person:<character id>`. An heir keeps the id of the child, so the child's history is already under the right key. A
  person is `person:<data.sid>` when the record has a text `sid`, else `person:<id>`.
- Double entry. `book` takes an amount from one account and gives it to another. A mint credits one account and adds to the mint's
  total, a burn debits one and adds to the burn's total. The identity is always `sum(accounts) = sum(mints) - sum(burns)`.
  `abroad` is an ordinary account: tax paid abroad is a flow to it, not a burn.
- Whole dollars. An amount is rounded; one under 1, one that is not finite and one over 1e15 is refused and books 0. A balance may
  not pass 9e15, which stays under the largest exact integer, so every sum is exact. The player's cash can hold a fraction after the
  yearly erosion (the engine keeps idle cash to the cent). The books carry the cash rounded to whole dollars: `erodeCash` books the
  change of the rounded cash, and `addMoney`, `spend` and `earnIncome` book the new whole-dollar cash less the rounded old one, so the
  next booking lands the books exactly on the cash, even at an exact half dollar.
- Flows. `f["<year>:<country>:<reason>"]` holds `[person, firm, bank, gov, pool, abroad, mint, burn]`, the net each class gained or
  lost, so every row sums to zero. Two years are kept (this year and last), at most 8 countries a year have rows of their own (the
  rest share `*`) and at most 480 rows exist. `flowsOf(g)` is the pure view.
- The roll is lazy. The first booking of a new year pushes a close `[year, sum, cumulative mint, cumulative burn]` (the last 4 are
  kept), clears the yearly mint and burn counters and the tokens, and drops flow rows older than last year. A clock that moves
  backwards (a Time Machine jump, a test) resets the counters with no close.
- Tokens. A booking with a `token` is skipped when that token was already booked this year. Tokens embed the year
  (`redeem:${assetId}:${year}`), so a year that runs twice books and pays nothing twice. A wrapper given a token changes no cash on a
  replay.
- Caps. 500 accounts (a booking to a new account past that goes to `pool:other`, and the roll folds the smallest person and firm
  accounts into it), 480 flow rows, 600 tokens, 4 closes, 40 log rows. The log keeps `[year, kind, name, amount]` for every cap hit,
  fold, redirect and heal, merged per year, kind and name. One slot stays free for `pool:other` (a shard with 499 accounts and no
  `pool:other` is full), so `foldAccount` never takes `pool:other` as the account it folds away.
- Purity. `peekLedger` and `acctBalance` never write and work on a frozen state. `ledgerRoot` is the writer. The ledger is the one
  world shard that every booking edits in place; it is validated once per object identity.
- Normalization is total. A hostile or damaged shard is made valid on read: bad account names fold into `pool:other`, numbers round,
  lists are cut, a flow row that does not sum to zero is dropped, and any break of the identity that is left is healed by a mint or a
  burn named `heal` with a log row. `checkLedger(g)` reports a nonzero `heal` as a problem; the probes assert it is 0. A hostile-load
  test passes `{ allowHeal: true }`.
- The shard lives in `g.world.ledger` (see `docs/WORLD.md`). Nothing in `kernel/` or `world/` draws from `g.rng`, `Math.random` or a
  clock, and `test/ledger-guards.test.ts` says so.

## The reasons

Every booking carries a reason. A reason says who receives when the entity pays and who pays when it receives, so
`addMoney(g, -500, 'tax.income')` needs no second account: the table sends it to `gov:<country>`. A caller that knows the real
counterparty names it with `with`, and the table is only the default. Pools are anonymous crowds (the landlords, the retailers, the
households of a country): money that leaves a life goes to one and money that arrives comes from one. There are 64 reasons and at
most 80 may exist. A reason is never renamed or deleted, because saved flow rows and the ratchet name them. A reason in a saved flow
row that is not in the table drops that row on load.

| Group | Reason | Pays to | Paid by | Use |
|---|---|---|---|---|
| Work | `wage` | employers | employers | salary, job pay, prison wages |
| | `severance` | employers | employers | a payout on losing a job |
| | `pension` | gov | gov | state and private pension |
| | `benefit` | gov | gov | welfare, allowance, subsidy, royal allowance |
| | `prize` | other | other | contests, awards, windfall prizes |
| | `royalty` | markets | markets | royalties, residuals, advances, licences |
| | `career.income` | employers | employers | what a career earns (the career kit) |
| | `career.cost` | other | other | what a career spends (the career kit) |
| Tax and law | `tax.income` | gov | gov | income tax |
| | `tax.capgains` | gov | gov | capital gains tax |
| | `tax.estate` | gov | gov | estate and inheritance tax |
| | `tax.property` | gov | gov | property tax |
| | `tax.sales` | gov | gov | sales and value added tax |
| | `tax.corp` | gov | gov | company tax |
| | `tax.transaction` | gov | gov | the nation's tax on trades |
| | `fine` | gov | gov | penalties paid to the state |
| | `fee.gov` | gov | gov | licences, permits, visas |
| | `legal` | legal | legal | lawyers, settlements, court costs |
| | `bribe` | crime | crime | money slipped to someone for a favour |
| Living | `rent` | landlords | households | paying rent goes to landlords, receiving it comes from households |
| | `living` | retail | retail | cost of living |
| | `purchase` | retail | retail | everyday goods, repairs, upkeep, refunds |
| | `leisure` | leisure | leisure | travel, nightlife, clubs, memberships |
| | `health` | health | health | doctors, hospitals, drugs |
| | `tuition` | edu | edu | school and university fees |
| | `premium` | insurers | insurers | insurance premiums |
| | `claim` | insurers | insurers | an insurer pays out |
| Assets | `property.buy` | sellers | sellers | a home or a lot bought |
| | `property.sell` | sellers | sellers | a home or a lot sold |
| | `asset.buy` | retail | retail | vehicles, jewelry, art, instruments |
| | `asset.sell` | retail | retail | the same, sold |
| Credit | `loan.principal` | banks | `mint:lending` | the lender creates what it lends |
| | `loan.repay` | banks | banks | principal paid back |
| | `loan.interest` | banks | banks | interest on a loan |
| | `fee.bank` | banks | banks | bank fees |
| Markets | `trade.buy` | markets | markets | a security bought |
| | `trade.sell` | markets | markets | a security sold |
| | `invest.income` | markets | markets | coupons and interest |
| | `dividend` | markets | markets | dividends |
| | `bond.redeem` | gov | gov | a bond repaid at par; always name the issuer with `with: gov:<issuer>` |
| Luck | `gamble` | leisure | leisure | bets and lotteries |
| | `luck` | other | other | an event's money effect with no named party |
| Family | `gift` | family | family | a gift between people |
| | `inheritance` | family | family | what an heir receives |
| | `support` | family | family | money sent to relatives; also a loan between people and, on a stamped life, what the estate pays a person the late player borrowed from (R4-L6, token `debtToken('estate', ...)`) |
| | `divorce` | family | family | a divorce settlement; also the part of it the player pays the ex a fifth of the cash at a time (R4-L7) and the unpaid part that the estate pays before the shares (R4-L6) |
| | `estate` | family | family | an estate passed on; also the NPC estate: the cash a dead relative leaves when no heir is modeled (R4-L5) |
| | `donation` | charity | charity | gifts to charity |
| Crime | `crime.take` | crime | crime | what a crime brings in |
| | `crime.cost` | crime | crime | what a crime costs its author |
| Business | `sales` | households | households | revenue |
| | `payroll` | households | households | wages and benefits paid to staff |
| | `inputs` | retail | retail | supplies, rent and services of a firm |
| | `intel` | other | other | reports, analysts and investigators bought to know a number better (Knowledge, R3; an illegal source pays under `bribe`) |
| | `capex` | retail | retail | equipment and buildings |
| | `rnd` | other | other | research and development |
| | `marketing` | other | other | advertising |
| | `draw` | other | other | an owner draws cash from a firm (use `moveCash`) |
| | `inject` | other | other | an owner puts cash into a firm (use `moveCash`) |
| | `firm.sale` | other | other | a company sold |
| Sinks | `inflation` | `burn:inflation` | `mint:revaluation` | only `erodeCash` and `erodeFirm` use it |
| | `writeoff` | `burn:writeoff` | `burn:writeoff` | only `writeoff()` uses it |
| | `emigration` | `burn:emigration` | `burn:emigration` | only `demote(..., 'emigrated')` uses it |
| Default | `unreasoned` | other | other | what a call without a reason books; the ratchet counts it |

The pools are `banks`, `charity`, `crime`, `edu`, `employers`, `family`, `firms`, `health`, `hh`, `insurers`, `landlords`, `legal`,
`leisure`, `markets`, `other`, `retail` and `sellers` (17, a closed list). `hh` is `pool:hh:<country>`.

## Mints and burns

A dollar is created or destroyed in exactly seven named places, each with a yearly cap. A mint over its room is clipped, a `cap` row
is logged and the wrapper applies the clipped amount to the cash, so the books and the cash never part. Nothing else clips: a ledger
refusal never changes the player's cash. Each cap is an entry in `test/ceiling-list.json` (`mint-caps`, `burn-caps`).

| Sink | Cap a year | Why it exists |
|---|---|---|
| `mint:lending` | 1,000,000,000,000 | the lender creates the deposit it lends. The plan said 2.5e9; the probe saw founding loans of 40e9, so the ceiling is a runaway guard, and the probe asserts a quarter of it at most |
| `mint:printing` | 0 | central-bank printing in a declared war; a later release raises the cap with its own commit |
| `mint:immigrants` | 500,000,000 | savings that immigrants bring; first used by the R4 world step |
| `mint:revaluation` | 1,000,000,000,000 | falling prices raise what held cash buys (the engine stores purchasing power, and the economy allows negative inflation), and an inflating debt shrinks |
| `burn:inflation` | 1,000,000,000,000 | erosion of held cash and company cash |
| `burn:writeoff` | 1,000,000,000,000 | a debt removed without payment destroys the deposit it created |
| `burn:emigration` | 1,000,000,000,000 | what a named person takes out of the world when they leave |

Spreads (`kernel/spreads.ts`). No pool trades at the mid price in both directions: `ask(mid, pool)` is above it and `bid(mid, pool)`
below, so a buy from a pool followed by a sale to it loses at least twice the spread unless the path has a larger cost of its own.
`markets` 0.001, `banks` 0.002, `sellers` 0.03, `retail` 0.10, and 0.05 for every other pool (including `other`). Housing
(same-year resale), the securities markets and the level-of-detail promotion are tested against them; goods and vehicles are
measured, not asserted.

## How to book money

The three primitives take a reason as the third argument. A call with none books as `unreasoned`, which the ratchet counts.

```ts
addMoney(g, -rent, 'rent')                                   // the player pays; the table names the other side
earnIncome(g, pay, 'wage')                                   // also adds to flags.taxableIncome, as before
spend(g, fee, { reason: 'fee.gov', country: 'de' })          // false and nothing booked when short
addMoney(g, par, { reason: 'bond.redeem', with: ref('gov', issuer), token: `redeem:${a.id}:${g.year}` })
personCash(g, p, -gift, 'gift', 0)                           // a person (floor 0: never below zero)
firmCash(g, b, -cost, 'inputs', a.id)                        // a company's cash, one-sided
moveCash(g, playerPurse(g), firmPurse(b, a.id), amount, 'inject')   // two purses, one booking
lend(g, principal, to)                                       // a loan record that has no addLoan: the lending mint
writeoff(g, balance)                                         // a debt removed unpaid: burn:writeoff from pool:banks
```

The rules, in the order they bite:

1. Keep the call's own rounding and clamps; add nothing. `g.character.money -= cost` becomes `addMoney(g, -cost, 'reason')` (not
   `spend`: `-=` never checked affordability). `money = 0` becomes `addMoney(g, -money, ...)` with the reason of what took it.
2. A person's money goes through `personCash` and a company's through `firmCash`. NPC wealth and company cash are floats; the
   helpers apply the delta as given and book `Math.round` of it. Never add rounding to a record that did not round itself.
3. A move between two purses is one `moveCash`, never two one-sided calls.
4. A site that mixes flows in one number (proceeds net of a payoff) books the net under the reason of the larger part and says so in
   a short comment.
5. A mortgage or a loan built as a literal calls `lend`; removing one that had a balance and was not paid in cash calls `writeoff`.
6. Never touch the bodies of `core.ts`, `cash.ts` or anything under `kernel/`, nor the `money:` literal of a new `Character` or
   `Person` (an opening balance is not a flow).
7. A line that is not a purse (a local slice's `cash`, a display struct) carries `// ledger-ok: <why>`. Never on `character.money`,
   `Person.money` or `BizState.cash`. At most 12 markers may exist.
8. Do not write `'unreasoned'` as a literal: the ratchet counts it.

A company's cash also keeps a small tally by reason (`kernel/tally.ts`, set by `firmCash`, `moveCash` and `erodeFirm`), which the
books close copies into the year's row, so the company cash walk names every move and has no "everything else" row.

## The ratchet

`test/money-ratchet.test.ts` counts, per file of `src/`, every `addMoney`, `spend` and `earnIncome` call with no reason and every
`.cash` and `.money` write (`+=`, `-=`, `=`, `*=`, `/=`) that is not marked `ledger-ok:`. A count above the file's entry in
`test/money-ratchet.json` fails, and so does a nonzero count in a file with no entry: a new file may call the three with a reason and
may write no `.cash` or `.money`. Every prefix in `MIGRATED` holds no counted site at all, and the failure lists `file:line` for
each. Shrink the baseline after a migration with `UPDATE_MONEY_RATCHET=1 /Users/saeed/projects/anotherlife/wt/bin/vt22
test/money-ratchet.test.ts`; it refuses to raise or add. The token scan cannot see a write through `Object.assign`, a
destructuring or a bracket key: the probe measures that gap as drift.

The type of `why` stays optional. Source holds no unreasoned call any more, but a required `why` also means a reason on every call in
the tests, and the lead decides when that is worth it.

## The probes

- `test/ledger-conservation.test.ts`: forty seeded lives (101 to 140) of up to 100 years with two heirs through the fuzzer, which
  checks the books after every step (the sum equals mint less burn, every flow row nets to zero, every cap holds, nothing was healed)
  and measures the player's cash against the player's account at every year end. In CI each of four shards plays ten lives and the
  aggregate step judges the union. Locally, two lives: `SLICE=1/20 SLICE_DIR=$TMPDIR/s /Users/saeed/projects/anotherlife/wt/bin/vt22
  test/ledger-conservation.test.ts`.
- `test/ledger-conservation-fast.test.ts`: three of the lives, a hundred years each, one action a year, in the fast tier.
- `test/ledger-probe.ts` holds the judge: no failure, at most 3,000 bookings a year (a cost proxy for the year step), no mint over
  its cap and `lending` at most a quarter of it, no `heal`. Over the forty: at least 34 lives of 90 years or more, the floors of
  `FLOORS` for bookings and reasons, and some life that minted `lending` and burned `inflation`. The floors are the plan's
  targets, 40,000 bookings and 20 reasons; the forty lives measured 53,456 bookings and 54 reasons, 39 of them lived 90 years or
  more, and none drifted or healed. If a shard passes its 12 minute wall, lower `PROBE_ACTIONS` first.
- `test/world-acceptance.test.ts` adds the fixture, hostile-load, replay, reload, fork, heir and doc checks, and the strict run below.

## The strict drift run

Drift is the change of the player's cash that nothing booked. The probes report it and only `LEDGER_STRICT` asserts it, because a
raw writer that the token scan cannot see shows up there first. Forty lives take about 9 minutes on one worker, so run four slices
one after another:

```
LEDGER_STRICT=1/4 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/world-acceptance.test.ts -t "strict drift"
```

then `2/4`, `3/4` and `4/4` (`LEDGER_STRICT=1` plays all forty; `LEDGER_STRICT_LIVES=n` keeps only the first `n`). On a failure it
prints the seed and the first drift (year, age, amount), which is how a surviving raw writer is found: fix it with the recipe above,
or list it below.

The nightly deep tier plays the same four slices every night, one job each (`ledger-strict` in `.github/workflows/nightly.yml`,
described in `docs/CI.md`), and a drift fails the night through the hard rule `ledger.drift.sum`. Pull requests do not run it, so
run it by hand after a change that adds or moves a writer of cash.

Last run (the R2-L18 acceptance, `vt22`, Node 22): all forty lives (seeds 101 to 140) in four slices of ten, 127, 166, 108 and 103
seconds, drift 0 in every one. The first run found two lives with a dollar of drift (seeds 119 and 133, at an exact half dollar of
eroded cash); that was a rounding defect in `erodeCash` and the wrappers, fixed with its regression test in
`test/ledger-wrappers.test.ts`, not a raw writer. No raw writer survived the run.

## Known unbooked writers

Every raw `.cash` or `.money` write left in `src/` is one of these, or the strict run above names it. The first group is the
baseline of `test/money-ratchet.json` (a primitive, never a flow); the second is the `ledger-ok:` markers (not a purse). The doc
check in `test/world-acceptance.test.ts` fails when a marker or a baseline file is missing here.

The primitives, in the baseline (lines as of this release):

- `src/game/core.ts` (3 `.money =`, lines 89, 106 and 126): `addMoney`, `spend` and `earnIncome` themselves. They apply the cash
  and book the same whole dollars on the next line, which is what keeps the cash and the books together.
- `src/game/cash.ts` (1 `.cash =` and 4 `.money =`, lines 63, 91, 113, 231 and 234): the purses (`playerPurse`, `personPurse`,
  `firmPurse`) and `erodeCash`. Each applies a change to the record it was handed and books what it applied.

Not a purse, marked `ledger-ok:` (3 of the 12 allowed):

- `src/game/business/state.ts` (line 191): the closing cash on a history row of a company's year, not its cash.
- `src/game/business/economy.ts` (line 1020): the same, on the row the year's report keeps.
- `src/game/events/will-estate.ts` (line 182): one relative's cut in a local list inside the reading of the will, not an account.

Opening balances (the `money:` literal of a new `Character` or `Person`) are not flows and are not counted.

## How to add a reason

1. Append one line to its group in `src/game/kernel/reasons.ts`, in alphabetical order inside the group, with its default
   counterparties and a note. Never rename or delete an old one. The count stays at 80 or fewer.
2. Add the row to the table above (`test/world-acceptance.test.ts` fails until every reason is named here).
3. A new mint or burn is a lead decision: it needs a cap, a `test/ceiling-list.json` entry, a row in the table above and a
   `CEILING_PROBES` row for the platform probe.
4. A reason that needs a pool the table does not have is a decision too: the pools are a closed list.
