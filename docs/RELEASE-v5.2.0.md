# AnotherLife v5.2.0

"Where the money went": players with a lot of money lost billions at every age-up and could not
tell why, and a game that froze after "Back to" a person. This release fixes the freeze, says where
the money goes, and lets cash and big trades behave more like real ones. Saves from v5.1.0 and
older load and continue.

## What's new

- **No more freeze after "Back to" a person.** Doing something with someone on Relationships (Spend
  Time and the rest) leaves a "Back to" chip. Tapping it used to freeze the whole game: nothing
  could be tapped and only a refresh got out. Both sheets it reopens had made each other
  unclickable. The newest sheet now stays usable.
- **The game says what inflation takes.** The first time inflation takes $10,000 or more of the cash
  you hold in a year, your life says so once: "Inflation ate $X of what my cash can buy, and the bank
  pays only 0.8% on it. It happens every year." An heir is told once again in their own life.
- **The year card says it every year.** The money line of the year card ends "Inflation took $X."
  in every year the loss is worth a line, next to the net worth, income and cash.
- **Cash in the bank earns interest.** It used to earn nothing. It now earns a third of the
  savings rate, the way a nominal deposit does, so it ends the year at (1 + rate) / (1 + inflation)
  of where it began, less the tax on the interest. Savings stays the better place for money you do
  not need. It softens the loss and does not erase it: with $10B in cash, a US life that lost 2.6%
  to inflation in a year now loses 1.9%, Brazil 5.7% becomes 3.7% and Turkey 35% becomes 31%.
- **Big coins are deep.** After real history ends (the present, and every year to come) every coin,
  Bitcoin included, had a flat $50M of market depth, so a $1B order kept 21% of itself and a sale
  could return at most about $83M however high the coin had climbed. A coin's depth is now 5% of
  its size, its price times the supply the record ended with: Bitcoin is deep and a small coin is
  thin. Stocks keep $500M.
- **Big orders ask first.** A buy that would lose a quarter or more of itself to price impact, and a
  partial sale that would lose a quarter or more of its proceeds, now stop at a question that names
  the loss, what the position would be worth, that splitting the order does not help, and the size
  that loses under 10%. An ordinary order asks nothing, and neither does a fund, a bond, savings or
  gold. Sell All already asked.
- **No Bitcoin in 1992.** The "Tip Off a Crony" and market-announcement screens of a politician
  listed every coin in any year, so a 1992 president could bet on Bitcoin. They now list coins only
  when crypto exists and is allowed, like the computer's bet screen.
- **The tax bill is told less often.** The journal mentions the income tax when the bill changes by a
  quarter or more. A life with a big bank balance has a bill that moves every year (its interest is
  income), so the line came up nearly every year. It now waits five years after the last one, unless
  the bill has doubled since, and its wording avoids the last few used.
- **A friend's firm is news every sixth year.** The journal said "X reinvested $Y in a new operating
  location" every third year for as long as a friend's or relative's firm grew. It now says it every
  sixth year, in one of three ways. The person's own history keeps every expansion.

## Under the hood

- `finance.ts` `sayInflationLoss` writes the once-per-life line (fixed id `infl-<year>`, so no uid is
  drawn) and keeps each year's loss as `[year, amount]` in the personal flag `inflationLoss`;
  `inflationTold` marks that the line was said. Both are classified personal. `moneyFacts` reads
  the loss only for the current year and `moneyLine` adds the clause after the cash, up to the
  90-character cap, ahead of the income and the move. Every line without a loss is what it was.
- `investments.ts` `payBankInterest` pays `held x rate / (1 + inflation)` once a year, from the
  banks pool, as taxable income (`invest.income`). `bankCashRate` is `BANK_CASH_SHARE` (a third) of
  the savings rate, and the one constant to change to make cash earn more or less. It draws no
  random number and writes no log line.
- `history/markets.ts` `coinSupply` and `invest/engine.ts` `coinMarketCap(slot, year, price?)`: in a
  year of history the real size, afterwards price times supply when a price is passed, and null
  without one, so the room a coin has this year still reads as unlimited. `tradingDepth` passes the
  raw quote, the price an order has not moved.
- `MenuAction.confirm` is now `(g, input?) => string | null` and `confirmText` passes the typed
  amount on. Every older `confirm` ignores the argument.
- `modal.ts` `openModal`: a dialog that opens inside what a lower dialog made inert wins, and the
  lower one releases its hold, so everything is released exactly once in either close order.
- `npc-lives.ts`: the expansion line of a growing firm goes to the player's journal when
  `g.year % 6 === 0`, in one of three phrasings (`pickSite`, drawn every time so the text stream does
  not move); `milestone` takes `''` for "not in the journal" and the person's history keeps every
  plain line. Interest sent one seeded life down a path with a cafe that repeated it 11 times, which
  the repeated-lines gate rightly refused.
- `finance.ts` `yearlyFinance`: a tax line waits `TAX_LINE_GAP` (5) years after the last one unless the
  bill is at least twice the last one told; the phrasing comes from `freshPick`. `taxLineAge` and
  `lastTaxLogged` are personal flags.
- `computer/money-stocks.ts` exports `coinsHere`, and `special/politics.ts` uses it for the coin rows
  and the "or a coin" header. `special/military.ts` remembers the last three deployment places
  (`special.mil.recentPlaces`), and `health.ts` `freshLine` takes how many picks to avoid (the
  undiagnosed-illness line avoids four). The boundary line pool is nine lines, a shuffle-bag.
- Tests: `korean-cash` and `release-182` stub `bankCashRate` and `payBankInterest` to zero, since they
  hold the cash arithmetic and the closing tax to the cent; `bank-interest.test.ts` holds the interest
  and its tax. The restaurant case of the fog fuzzer moved from seed 11 to seed 12: interest sent
  seed 11 to a company whose market tree has about twenty times the screens, and its five years took
  over 300 s (seeds 12 to 23 all play them in 3 to 12 s).
- Bundle: the initial bundle is within about 25 bytes of its +60,000 budget over the v5.0.0 baseline.
  The baseline (`scripts/bundle-baseline.json`) needs re-capturing by the lead before the next release
  adds anything.

## Seeds

Existing seeds play differently. Interest changes the money of every life with cash, and wealth
gates events, so every seeded life diverges from its first year and the same seed gives another
life from this version on. `g.rng` itself moves only through that path: nothing here draws a random
number. The golden digests, the r2 parity canary and the kernel parity fixture were re-recorded
under Node 22, each with its reason in the commit that moved it.

## Saves

Saves from v5.1.0 and older load and continue. Both new flags are optional and personal, so an old
save has neither: it is told about inflation the first time the loss is large, and its first
age-up pays interest on the cash it holds. The schema is still 3.
