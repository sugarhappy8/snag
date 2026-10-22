# AnotherLife v5.0.0

Release R2, "Every dollar has a counterparty": money that moves between named parties, text that
repeats less, faster taps and smaller saves. Saves from v4.1.1 and older load and continue.

## What's new

- **A cash walk with no "Everything else" row.** "Where the cash went" in a company's report names
  each move of the company's cash, because the books now keep a reason for every one. What no reason
  explains shows as "Rounding" when it is a dollar or two. Years from before this version, and the
  year you upgrade, keep the old row and its note.
- **Bonds pay par.** A government bond repays its face value when it matures, not the price it traded
  at that year. The face loses buying power with inflation, as cash does. A government that defaults
  cuts it by the haircut. The issuing government pays the face and the coupons. A bond you already
  hold starts at the lower of its face and its price, so an old holding gets no windfall.
- **Capital gains are taxed as capital gains.** A gain you realize pays your country's capital gains
  rate, withheld when you sell. It used to be added to your income. Where your country has a tax on
  trades, it comes off every buy and sale, and a buy it would overdraw is refused. Both reach your
  government's account in the books.
- **Faster taps.** A tap used to copy and write the whole life. It now copies the small core of the
  save. The world economy and the finished years of the life log are shared between taps and written
  only when they change. A test holds the copy and encode of the core to 8 milliseconds.
- **Smaller saves.** The same life takes at most 80 percent of the room it took in v4.1.1, and a test
  holds it to that. Part of the saving: the world economy keeps last year's frame only for the
  countries you have a tie to, and 16 years of history instead of 32.
- **Text that repeats less.** A pool of lines remembers what was said lately and skips its last few
  picks. On the 13-life probe, repeated lines are under half of what R1 had (8.3 percent of the log
  then, 3.1 percent now), and a test holds it to half.
- **State lines print only when something changes.** The notes that came back every year ("Around me"
  on growth, credit and supply, an index crash or boom, endorsement income, an allowance, a loan paid
  back in parts) now print when the state moves into a new band, or after five quiet years. Each has
  three to six variants, and none repeats the last two.
- **Political broadcasts match the era.** A debate, a speech, a pardon, an exposé, a crony's arrest
  and an apology are on television only where there is television. Before that they are on the radio,
  and before that in the press. Before this, a 1945 debate could be "on live TV".

## Under the hood

- **The money ledger** (`docs/LEDGER.md`). A dollar moves between two named accounts: a person, a
  firm, a bank, a government, a pool (the landlords, the retailers, the households of a country) or
  abroad. Each booking has a reason, and each year's flows net to zero per reason. Money is not
  closed: a pool may run negative. A dollar is made or destroyed in seven declared places (lending,
  printing, immigrants and revaluation; inflation, write-offs and emigration), each with a yearly cap.
  Pools buy at an ask and sell at a bid, so a round trip loses the spread. A probe plays forty lives
  of up to a hundred years with heirs and checks the books after every step. A ratchet test keeps
  calls with no reason from coming back.
- **g.world** (`docs/WORLD.md`). A small, bounded, saved model next to the books: an index of the 80
  people who matter most, the 20 most valuable companies and 150 homes, a holdings table, and a
  level-of-detail framework (named, pooled and seeded). In this version it only indexes, and nothing
  in the simulation reads it. A save with no world reads as empty.
- **Named RNG streams** (`docs/STREAMS.md`). Luck for the world and for text comes from named streams
  that never touch the shared `g.rng`. One extra draw on a stream changes only that stream's slice of
  the state, and a test checks it.
- **The module registry and the bus** (`docs/KERNEL.md`). The 36 yearly steps, the menus and the
  special careers register as modules in a fixed phase order. The order and the saved JSON are the
  same as before, and a parity fixture holds them. Modules talk through facts on a bus and through
  ports. Fourteen import cuts took the import cycles from 147 modules in 5 cycles to 90 modules in 8.
- **Save v3** (`docs/SAVE.md`). A save is a small head that changes on every tap, plus chunks (the
  world, the finished decades of the life log, entity records) that change when their content does.
  A v4.1.1 or older save is read through `migrateSave`, so both shapes load. Parts are gzipped when
  the browser can: in IndexedDB from 100,000 characters, in Time Machine snapshots from 1,000. A
  Time Machine restore of any age passes through `migrateSave`.
- **Golden digests and the nightly deep tier** (`docs/CI.md`). The fast tier plays three seeded lives
  and compares one digest per slice of the state with a committed file, so a change that moves a draw
  names the slice. A Nightly workflow plays 40 fuzzed lives of 160 years, the balance and 100x ceiling
  probes, the anachronism lint, the strict ledger drift check over 40 lives, every old save for 20
  years, the repeat probe and the deep golden plan. It is scheduled on the default branch.

## Seeds

Existing seeds play differently, once. Text used to draw from the shared random stream, so every line
shifted the rolls after it. It now has a stream of its own, and the same seed gives another life from
this version on. A save loads and continues from where it was.

## If you go back

An older build opened on the same browser sees a save newer than it knows. It keeps the save as it is
and does not play it, so nothing is lost. Open v5.0.0 again and the life is there.
